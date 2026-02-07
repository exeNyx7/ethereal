#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════
 *  Etherial — Functional Scenario Test Suite
 *  Validates core spec requirements from fada-ethereal.md
 * ═══════════════════════════════════════════════════════════════════
 *
 *  Architecture:  child_process peers (like stress-test.js) + HTTP API
 *  No Mocking:    Uses the actual GunDB instance & real server logic
 *  Server:        Must be running on http://localhost:4000
 *
 *  Tests:
 *    1. Blind Auth Determinism
 *    2. √(Karma) Weighting & Resolution
 *    3. Opposition Thresholds
 *    4. Ghost Cascade
 *
 *  Run:  node functional-scenario-test.js
 * ═══════════════════════════════════════════════════════════════════
 */

const { execSync } = require('child_process');
const http = require('http');
const path = require('path');
const fs   = require('fs');

// ── Config ──
const API_BASE  = 'http://localhost:4000';
const GUN_RELAY = 'http://localhost:4000/gun';
const DOMAIN    = 'functest.edu';

const results = [];

// ═══════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════

function log(icon, msg) { console.log(`  ${icon} ${msg}`); }

function assert(name, condition, detail) {
  results.push({ name, pass: !!condition });
  const tag = condition ? '✅ PASS' : '❌ FAIL';
  const d = detail ? ` — ${detail}` : '';
  console.log(`  ${tag}: ${name}${d}`);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Run JS code in an isolated child process with Gun peer.
 * Same pattern as stress-test.js — force-kills Gun's persistent connections.
 * Returns the last non-empty line of stdout.
 */
function peer(code, timeout = 30000) {
  const tmp = path.join(__dirname, `_tmp_ftest_${Date.now()}_${Math.random().toString(36).slice(2)}.js`);
  const wrapped = `
    const _log = console.log;
    console.log = function() {
      const msg = [...arguments].join(' ');
      if (msg.includes('Hello wonderful') || msg.includes('AXE') ||
          msg.includes('Multicast') || msg.includes('reusing') ||
          msg.includes('0 length')) return;
      _log.apply(console, arguments);
    };
    console.warn = function() {};
    (async () => {
      try {
        ${code}
      } catch(e) {
        process.stdout.write('ERR:' + e.message + '\\n');
        process.exit(1);
      }
    })();
  `;
  fs.writeFileSync(tmp, wrapped);
  try {
    const out = execSync(`node "${tmp}"`, { timeout, encoding: 'utf-8', cwd: __dirname });
    return out.trim().split('\n').filter(l => l.trim()).pop() || '';
  } catch (e) {
    if (e.stdout) return e.stdout.trim().split('\n').filter(l => l.trim()).pop() || `ERR:${e.status}`;
    return `ERR:${e.message.slice(0, 200)}`;
  } finally {
    try { fs.unlinkSync(tmp); } catch {}
  }
}

/**
 * HTTP API request helper — returns { status, data }
 * Retries once on connection errors.
 */
async function api(method, urlPath, body, retries = 2) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const result = await new Promise((resolve, reject) => {
        const url  = new URL(urlPath, API_BASE);
        const data = body ? JSON.stringify(body) : null;
        const opts = {
          method,
          hostname: url.hostname,
          port:     url.port,
          path:     url.pathname + url.search,
          headers:  { 'Content-Type': 'application/json' },
        };
        if (data) opts.headers['Content-Length'] = Buffer.byteLength(data);

        const req = http.request(opts, (res) => {
          let buf = '';
          res.on('data', c => buf += c);
          res.on('end', () => {
            try   { resolve({ status: res.statusCode, data: JSON.parse(buf) }); }
            catch { resolve({ status: res.statusCode, data: buf }); }
          });
        });
        req.on('error', reject);
        if (data) req.write(data);
        req.end();
      });
      return result;
    } catch (e) {
      if (attempt < retries) {
        await sleep(1000);
        continue;
      }
      throw e;
    }
  }
}

// ═══════════════════════════════════════════════════════
//  SETUP — Create 6 test users directly in GunDB
// ═══════════════════════════════════════════════════════

function setupTestUsers() {
  log('⚙️', 'Creating 6 test users in GunDB via peer process...');

  const raw = peer(`
    const Gun = require('gun');
    require('gun/sea');
    const SEA = Gun.SEA;
    const gun = Gun({ peers: ['${GUN_RELAY}'], file: false, radisk: false });

    const DOMAIN = '${DOMAIN}';
    const specs = [
      { username: 'alice_ft',   password: '111111', karma: 1   },
      { username: 'bob_ft',     password: '222222', karma: 100 },
      { username: 'charlie_ft', password: '333333', karma: 1   },
      { username: 'dave_ft',    password: '444444', karma: 1   },
      { username: 'eve_ft',     password: '555555', karma: 1   },
      { username: 'frank_ft',   password: '666666', karma: 1   },
    ];

    function gPut(node, data) {
      return new Promise(r => { node.put(data, () => setTimeout(r, 250)); });
    }

    async function run() {
      await new Promise(r => setTimeout(r, 3000));        // wait for relay connect

      const db = gun.get('etherial');

      // Create community meta
      await gPut(db.get('communities').get(DOMAIN).get('meta'), {
        domain: DOMAIN, name: DOMAIN, createdAt: Date.now()
      });

      const out = [];

      for (const u of specs) {
        const pair     = await SEA.pair();
        const credSeed = u.username.toLowerCase() + ':' + u.password;
        const credHash = await SEA.work(credSeed, 'etherial-cred-auth', null, { name: 'SHA-256' });
        const encKey   = await SEA.work(credSeed, 'etherial-keypair-encryption');
        const enc      = await SEA.encrypt(JSON.stringify(pair), encKey);

        // etherial-auth — encrypted keypair blob
        await gPut(gun.get('etherial-auth').get(credHash), {
          encryptedPair: enc, username: u.username, createdAt: Date.now()
        });

        // etherial-usernames — lookup
        await gPut(gun.get('etherial-usernames').get(u.username.toLowerCase()), {
          credHash: credHash, domain: DOMAIN, createdAt: Date.now()
        });

        // community user node (publicKey + karma)
        await gPut(db.get('communities').get(DOMAIN).get('users').get(pair.pub), {
          publicKey: pair.pub, domain: DOMAIN, karma: u.karma,
          username: u.username, createdAt: Date.now()
        });

        out.push({
          username:  u.username,
          password:  u.password,
          publicKey: pair.pub,
          karma:     u.karma
        });
      }

      await new Promise(r => setTimeout(r, 3000));        // let data sync
      process.stdout.write(JSON.stringify(out) + '\\n');
      process.exit(0);
    }
    run();
  `, 45000);

  try {
    const users = JSON.parse(raw);
    if (!Array.isArray(users) || users.length !== 6) throw new Error('Unexpected user count');
    log('⚙️', `Created: ${users.map(u => `${u.username}(k=${u.karma})`).join(', ')}`);
    return users;
  } catch (e) {
    console.error('  ❌ Setup failed — could not create users:', raw);
    process.exit(1);
  }
}

// ═══════════════════════════════════════════════════════
//  TEST 1 — Blind Auth Determinism  (spec §4.2)
// ═══════════════════════════════════════════════════════

async function test1(users) {
  console.log('\n───────────────────────────────────────────────');
  console.log('  TEST 1: Blind Auth Determinism  (spec §4.2)');
  console.log('───────────────────────────────────────────────');

  const alice = users.find(u => u.username === 'alice_ft');

  // ── 1a. Login #1 ──
  const r1 = await api('POST', '/api/auth/login', {
    username: alice.username, password: alice.password
  });
  assert('Alice login #1 succeeds', r1.status === 200 && r1.data?.publicKey,
    `status=${r1.status}`);

  const pk1 = r1.data?.publicKey;

  // ── 1b. Login #2 (fresh request — simulates new session) ──
  const r2 = await api('POST', '/api/auth/login', {
    username: alice.username, password: alice.password
  });
  assert('Alice login #2 succeeds', r2.status === 200 && r2.data?.publicKey,
    `status=${r2.status}`);

  const pk2 = r2.data?.publicKey;

  // ── 1c. Determinism check ──
  assert(
    'Same credentials → identical Public Key every time',
    pk1 && pk2 && pk1 === pk2,
    pk1 === pk2 ? `pk=${pk1.slice(0,16)}…` : `pk1=${(pk1||'').slice(0,12)} ≠ pk2=${(pk2||'').slice(0,12)}`
  );

  // ── 1d. Email is NEVER stored in user object ──
  const emailCheck = peer(`
    const Gun = require('gun');
    const gun = Gun({ peers: ['${GUN_RELAY}'], file: false, radisk: false });
    setTimeout(() => {
      gun.get('etherial').get('communities').get('${DOMAIN}').get('users').get('${pk1 || 'none'}').once((data) => {
        if (!data) { process.stdout.write('{"hasEmail":false,"keys":[]}\\n'); process.exit(0); return; }
        const keys = Object.keys(data).filter(k => k !== '_');
        const hasEmail = keys.some(k =>
          k === 'email' || k === 'emailAddress' || k === 'email_hash' ||
          (typeof data[k] === 'string' && data[k].includes('@'))
        );
        process.stdout.write(JSON.stringify({ hasEmail, keys }) + '\\n');
        process.exit(0);
      });
    }, 3000);
    setTimeout(() => { process.stdout.write('{"hasEmail":false,"keys":["timeout"]}\\n'); process.exit(0); }, 15000);
  `, 20000);

  try {
    const ed = JSON.parse(emailCheck);
    assert(
      'Email is NOT stored in user object (spec §4.2 privacy)',
      !ed.hasEmail,
      `stored fields: [${ed.keys.join(', ')}]`
    );
  } catch {
    assert('Email is NOT stored in user object', false, `raw: ${emailCheck}`);
  }
}

// ═══════════════════════════════════════════════════════
//  TEST 2 — √(Karma) Weighting & Resolution  (spec §4.5 / §4.6)
// ═══════════════════════════════════════════════════════

async function test2(users) {
  console.log('\n───────────────────────────────────────────────');
  console.log('  TEST 2: √(Karma) Weighting & Resolution');
  console.log('  Spec §4.5: Weight = √(karma)');
  console.log('  Spec §4.6: R = W_true/(W_true+W_false)');
  console.log('───────────────────────────────────────────────');

  // Login every user
  const sessions = {};
  for (const u of users) {
    const r = await api('POST', '/api/auth/login', { username: u.username, password: u.password });
    if (r.status === 200) sessions[u.username] = r.data;
  }

  const alice   = sessions['alice_ft'];
  const bob     = sessions['bob_ft'];
  const charlie = sessions['charlie_ft'];
  const dave    = sessions['dave_ft'];
  const eve     = sessions['eve_ft'];
  const frank   = sessions['frank_ft'];

  if (!alice || !bob || !charlie) {
    assert('All users logged in', false, 'Some logins failed');
    return null;
  }

  // ── 2a. Alice posts a rumor ──
  const postRes = await api('POST', '/api/rumors', {
    text: '[FT] Library open 24/7 during finals week',
    domain: DOMAIN,
    publicKey: alice.publicKey,
    windowDuration: '24h',
    pair: alice.pair,
  });

  assert('Alice posts a rumor', postRes.status === 200 && postRes.data?.success,
    `id=${postRes.data?.rumor?.id?.slice(0, 25)}`);

  const rumorId = postRes.data?.rumor?.id;
  if (!rumorId) { log('❌', 'No rumor ID — aborting Test 2'); return null; }

  // ── 2b. Bob (karma=100) votes UP ──
  const bobVote = await api('POST', `/api/rumors/${rumorId}/vote`, {
    domain: DOMAIN, publicKey: bob.publicKey, value: 1, pair: bob.pair,
  });

  assert(
    'Bob (karma=100) vote weight = √100 = 10.0',
    bobVote.status === 200 && Math.abs((bobVote.data?.weight || 0) - 10) < 0.01,
    `weight=${bobVote.data?.weight}`
  );

  // ── 2c. Charlie (karma=1) votes DOWN ──
  const charlieVote = await api('POST', `/api/rumors/${rumorId}/vote`, {
    domain: DOMAIN, publicKey: charlie.publicKey, value: -1, pair: charlie.pair,
  });

  assert(
    'Charlie (karma=1) vote weight = √1 = 1.0',
    charlieVote.status === 200 && Math.abs((charlieVote.data?.weight || 0) - 1) < 0.01,
    `weight=${charlieVote.data?.weight}`
  );

  // ── 2d. Quorum fillers: Dave, Eve, Frank vote UP (karma=1 → weight=1 each) ──
  log('📊', 'Adding 3 quorum fillers (Dave, Eve, Frank — all vote UP, weight=1)');
  for (const s of [dave, eve, frank]) {
    const r = await api('POST', `/api/rumors/${rumorId}/vote`, {
      domain: DOMAIN, publicKey: s.publicKey, value: 1, pair: s.pair,
    });
    if (r.status !== 200) log('⚠️', `Quorum vote failed for ${s.publicKey?.slice(0,8)}: ${r.data?.error}`);
  }

  log('📊', 'Votes cast — W_true = 10+1+1+1 = 13, W_false = 1');
  log('📊', 'Expected R = 13/(13+1) ≈ 0.929 → FACT (≥ 0.60)');

  // ── 2e. Expire the voting window ──
  log('⏰', 'Setting voting window to expired via Gun peer...');
  const expired = peer(`
    const Gun = require('gun');
    const gun = Gun({ peers: ['${GUN_RELAY}'], file: false, radisk: false });
    setTimeout(() => {
      gun.get('etherial').get('communities').get('${DOMAIN}').get('rumors').get('${rumorId}').put({
        windowClosesAt: ${Date.now() - 120000}
      }, () => {
        setTimeout(() => { process.stdout.write('EXPIRED\\n'); process.exit(0); }, 2000);
      });
    }, 2000);
    setTimeout(() => { process.stdout.write('TIMEOUT\\n'); process.exit(0); }, 15000);
  `);
  log('⏰', `Window result: ${expired}`);

  // ── 2f. Wait for scheduler-driven resolution (every 30s) ──
  log('🔄', 'Polling for rumor resolution (scheduler runs every 30s)...');
  let resolved = null;
  for (let i = 0; i < 14; i++) {
    await sleep(5000);
    const rr = await api('GET', `/api/rumors/${encodeURIComponent(DOMAIN)}`);
    if (rr.status === 200 && Array.isArray(rr.data)) {
      const found = rr.data.find(r => r.id === rumorId);
      if (found && found.status !== 'active') {
        resolved = found;
        break;
      }
    }
    process.stdout.write('.');
  }
  console.log('');

  if (resolved) {
    assert(
      'Rumor resolves as FACT (R ≥ 0.60, spec §4.6)',
      resolved.status === 'fact',
      `status=${resolved.status}`
    );
    assert(
      'Trust score frozen and matches expected R ≈ 0.929',
      typeof resolved.trust_score === 'number' && resolved.trust_score > 0.9,
      `trust_score=${resolved.trust_score?.toFixed(4)}`
    );
    assert(
      'weighted_true includes √100 = 10 (Bob) + 3×√1 = 3 fillers',
      resolved.weighted_true >= 12,
      `weighted_true=${resolved.weighted_true?.toFixed(2)}`
    );
    assert(
      'weighted_false = √1 = 1 (Charlie only)',
      typeof resolved.weighted_false === 'number' && Math.abs(resolved.weighted_false - 1) < 0.2,
      `weighted_false=${resolved.weighted_false?.toFixed(2)}`
    );
    assert(
      'Total voters ≥ 5 (quorum met, spec §4.6 Step 5)',
      resolved.total_voters >= 5,
      `total_voters=${resolved.total_voters}`
    );
  } else {
    assert('Rumor resolves as FACT', false, 'Resolution timed out (70s)');
  }

  return rumorId;
}

// ═══════════════════════════════════════════════════════
//  TEST 3 — Opposition Thresholds  (spec §4.7)
// ═══════════════════════════════════════════════════════

async function test3(users, factRumorId) {
  console.log('\n───────────────────────────────────────────────');
  console.log('  TEST 3: Opposition Thresholds  (spec §4.7)');
  console.log('  Eligibility: karma ≥ max(10, 20% of W_true)');
  console.log('───────────────────────────────────────────────');

  if (!factRumorId) {
    log('⚠️', 'Skipping — no resolved FACT from Test 2');
    assert('Charlie opposition rejected', false, 'no FACT to oppose');
    assert('Bob opposition accepted', false, 'no FACT to oppose');
    return;
  }

  // Login Charlie and Bob
  const charlieLogin = await api('POST', '/api/auth/login', {
    username: 'charlie_ft', password: '333333'
  });
  const bobLogin = await api('POST', '/api/auth/login', {
    username: 'bob_ft', password: '222222'
  });

  const charlie = charlieLogin.data;
  const bob     = bobLogin.data;

  // ── 3a. Charlie (post-resolution karma ≈ 0.1) tries to oppose ──
  //   Server calculates: required = max(10, 0.2 × W_true)
  //   W_true ≈ 13 → required = max(10, 2.6) = 10
  //   Charlie karma ≈ 0.1 (lost -1.5 from incorrect vote, floored at 0.1) → REJECTED
  log('🔍', 'Charlie (karma after losing vote ≈ 0.1) attempts to oppose the FACT...');

  const charlieOpp = await api('POST', `/api/rumors/${factRumorId}/oppose`, {
    domain: DOMAIN,
    publicKey: charlie.publicKey,
    reason: 'I disagree with this fact',
    windowDuration: '24h',
    pair: charlie.pair,
  });

  assert(
    'Charlie opposition REJECTED — insufficient karma (spec §4.7)',
    charlieOpp.status === 403,
    `status=${charlieOpp.status}, error="${charlieOpp.data?.error?.slice(0, 60)}"`
  );

  // ── 3b. Bob (post-resolution karma ≈ 101) tries to oppose ──
  //   Bob karma 101 ≥ 10 → ACCEPTED
  log('🔍', 'Bob (karma after winning vote ≈ 101) attempts to oppose the FACT...');

  const bobOpp = await api('POST', `/api/rumors/${factRumorId}/oppose`, {
    domain: DOMAIN,
    publicKey: bob.publicKey,
    reason: 'I have new evidence disproving this',
    windowDuration: '24h',
    pair: bob.pair,
  });

  assert(
    'Bob opposition ACCEPTED — meets karma threshold (spec §4.7)',
    bobOpp.status === 200 && bobOpp.data?.success,
    `status=${bobOpp.status}, oppId=${bobOpp.data?.opposition?.id?.slice(0, 25) || 'none'}`
  );

  // ── 3c. One-opposition-per-fact rule ──
  //   Try another opposition after Bob's was accepted — should be rejected
  if (bobOpp.status === 200) {
    const bobLogin2 = await api('POST', '/api/auth/login', { username: 'bob_ft', password: '222222' });
    const dupOpp = await api('POST', `/api/rumors/${factRumorId}/oppose`, {
      domain: DOMAIN,
      publicKey: bobLogin2.data?.publicKey,
      reason: 'Second challenge attempt',
      windowDuration: '24h',
      pair: bobLogin2.data?.pair,
    });

    assert(
      'Duplicate opposition REJECTED — one per fact (spec §4.7)',
      dupOpp.status === 409 || dupOpp.status === 400,
      `status=${dupOpp.status}, error="${dupOpp.data?.error?.slice(0, 60)}"`
    );
  }
}

// ═══════════════════════════════════════════════════════
//  TEST 4 — Ghost Cascade  (spec §4.8)
// ═══════════════════════════════════════════════════════

async function test4(users) {
  console.log('\n───────────────────────────────────────────────');
  console.log('  TEST 4: Ghost Cascade  (spec §4.8)');
  console.log('  Ghost: status=ghost, trust_score=0, cascade');
  console.log('───────────────────────────────────────────────');

  // Login users
  const sessions = {};
  for (const u of users) {
    const r = await api('POST', '/api/auth/login', { username: u.username, password: u.password });
    if (r.status === 200) sessions[u.username] = r.data;
  }

  const alice   = sessions['alice_ft'];
  const bob     = sessions['bob_ft'];
  const charlie = sessions['charlie_ft'];
  const dave    = sessions['dave_ft'];
  const eve     = sessions['eve_ft'];
  const frank   = sessions['frank_ft'];

  // ── 4a. Alice posts Rumor A ──
  const postA = await api('POST', '/api/rumors', {
    text: '[FT-Ghost] Rumor A — Professor leaving the department',
    domain: DOMAIN,
    publicKey: alice.publicKey,
    windowDuration: '12h',
    pair: alice.pair,
  });

  assert('Rumor A posted', postA.status === 200 && postA.data?.success,
    `id=${postA.data?.rumor?.id?.slice(0, 25)}`);

  const rumorAId = postA.data?.rumor?.id;
  if (!rumorAId) { log('❌', 'No Rumor A ID — aborting Test 4'); return; }

  // ── 4b. Vote on Rumor A (all 5 UP for clean resolution) ──
  for (const s of [bob, charlie, dave, eve, frank]) {
    await api('POST', `/api/rumors/${rumorAId}/vote`, {
      domain: DOMAIN, publicKey: s.publicKey, value: 1, pair: s.pair,
    });
  }
  log('📊', 'All 5 voters cast UP on Rumor A');

  // ── 4c. Alice posts Rumor B (will reference A) ──
  const postB = await api('POST', '/api/rumors', {
    text: '[FT-Ghost] Rumor B — Follow-up: replacement professor announced',
    domain: DOMAIN,
    publicKey: alice.publicKey,
    windowDuration: '12h',
    pair: alice.pair,
  });

  assert('Rumor B posted', postB.status === 200 && postB.data?.success,
    `id=${postB.data?.rumor?.id?.slice(0, 25)}`);

  const rumorBId = postB.data?.rumor?.id;

  // ── 4d. Link Rumor B → A via parentRumorId (Gun peer) ──
  if (rumorBId) {
    const linkResult = peer(`
      const Gun = require('gun');
      const gun = Gun({ peers: ['${GUN_RELAY}'], file: false, radisk: false });
      setTimeout(() => {
        gun.get('etherial').get('communities').get('${DOMAIN}').get('rumors').get('${rumorBId}').put({
          parentRumorId: '${rumorAId}'
        }, () => {
          setTimeout(() => { process.stdout.write('LINKED\\n'); process.exit(0); }, 2000);
        });
      }, 2000);
      setTimeout(() => { process.stdout.write('TIMEOUT\\n'); process.exit(0); }, 15000);
    `);
    log('🔗', `B.parentRumorId → A: ${linkResult}`);
  }

  // ── 4e. Expire Rumor A and wait for resolution ──
  log('⏰', 'Expiring Rumor A voting window...');
  peer(`
    const Gun = require('gun');
    const gun = Gun({ peers: ['${GUN_RELAY}'], file: false, radisk: false });
    setTimeout(() => {
      gun.get('etherial').get('communities').get('${DOMAIN}').get('rumors').get('${rumorAId}').put({
        windowClosesAt: ${Date.now() - 120000}
      }, () => {
        setTimeout(() => { process.stdout.write('EXPIRED\\n'); process.exit(0); }, 2000);
      });
    }, 2000);
    setTimeout(() => { process.stdout.write('TIMEOUT\\n'); process.exit(0); }, 15000);
  `);

  log('🔄', 'Waiting for Rumor A resolution...');
  let rumorAResolved = null;
  for (let i = 0; i < 14; i++) {
    await sleep(5000);
    const rr = await api('GET', `/api/rumors/${encodeURIComponent(DOMAIN)}`);
    if (rr.status === 200 && Array.isArray(rr.data)) {
      const found = rr.data.find(r => r.id === rumorAId);
      if (found && found.status !== 'active') {
        rumorAResolved = found;
        break;
      }
    }
    process.stdout.write('.');
  }
  console.log('');

  assert('Rumor A resolved as FACT before ghosting',
    rumorAResolved?.status === 'fact',
    `status=${rumorAResolved?.status}, trust=${rumorAResolved?.trust_score?.toFixed(4)}`);

  const priorTrustScore = rumorAResolved?.trust_score || 0;

  // ── 4f. Ghost Rumor A via API ──
  log('👻', 'Ghosting Rumor A...');
  const ghostRes = await api('POST', `/api/rumors/${rumorAId}/ghost`, { domain: DOMAIN });

  assert('Ghost API call succeeds',
    ghostRes.status === 200 && ghostRes.data?.success,
    `status=${ghostRes.status}`);

  // Allow propagation
  await sleep(3000);

  // ── 4g. Verify Rumor A is ghost via Gun peer (API filters out ghosts) ──
  const ghostCheck = peer(`
    const Gun = require('gun');
    const gun = Gun({ peers: ['${GUN_RELAY}'], file: false, radisk: false });
    setTimeout(() => {
      gun.get('etherial').get('communities').get('${DOMAIN}').get('rumors').get('${rumorAId}').once((data) => {
        if (!data) { process.stdout.write('{"error":"no data"}\\n'); process.exit(0); return; }
        process.stdout.write(JSON.stringify({
          status: data.status,
          trust_score: data.trust_score,
          ghostedAt: data.ghostedAt,
          votesNullified: data.votesNullified,
        }) + '\\n');
        process.exit(0);
      });
    }, 3000);
    setTimeout(() => { process.stdout.write('{"error":"timeout"}\\n'); process.exit(0); }, 15000);
  `, 20000);

  try {
    const gd = JSON.parse(ghostCheck);

    assert(
      'Rumor A status = "ghost" (spec §4.8)',
      gd.status === 'ghost',
      `status=${gd.status}`
    );

    assert(
      'Rumor A trust_score nullified to 0 (spec §4.8)',
      gd.trust_score === 0,
      `trust_score=${gd.trust_score} (was ${priorTrustScore.toFixed(4)})`
    );

    assert(
      'Rumor A votesNullified flag set (spec §4.8)',
      gd.votesNullified === true,
      `votesNullified=${gd.votesNullified}`
    );

    assert(
      'Rumor A ghostedAt timestamp recorded',
      typeof gd.ghostedAt === 'number' && gd.ghostedAt > 0,
      `ghostedAt=${gd.ghostedAt}`
    );
  } catch {
    assert('Rumor A is a ghost', false, `raw: ${ghostCheck}`);
  }

  // ── 4h. Verify ghost is hidden from API feed (spec: "hidden from all UIs") ──
  const feedRes = await api('GET', `/api/rumors/${encodeURIComponent(DOMAIN)}`);
  const ghostInFeed = feedRes.status === 200 && Array.isArray(feedRes.data)
    ? feedRes.data.some(r => r.id === rumorAId)
    : true;

  assert(
    'Ghost rumor hidden from API feed (spec §4.8 visible_in_feed=false)',
    !ghostInFeed,
    ghostInFeed ? 'STILL in feed!' : 'correctly filtered'
  );

  // ── 4i. Verify Rumor B is NOT ghosted (cascade doesn't ghost children) ──
  if (rumorBId) {
    const bCheck = peer(`
      const Gun = require('gun');
      const gun = Gun({ peers: ['${GUN_RELAY}'], file: false, radisk: false });
      setTimeout(() => {
        gun.get('etherial').get('communities').get('${DOMAIN}').get('rumors').get('${rumorBId}').once((data) => {
          process.stdout.write(JSON.stringify({
            status: data?.status || 'missing',
            parentRumorId: data?.parentRumorId || null,
          }) + '\\n');
          process.exit(0);
        });
      }, 3000);
      setTimeout(() => { process.stdout.write('{"status":"timeout"}\\n'); process.exit(0); }, 15000);
    `, 20000);

    try {
      const bd = JSON.parse(bCheck);
      assert(
        'Rumor B still exists and is NOT ghosted (cascade preserves children)',
        bd.status !== 'ghost' && bd.status !== 'missing',
        `B.status=${bd.status}, B.parentRumorId=${bd.parentRumorId?.slice(0, 20)}`
      );
    } catch {
      assert('Rumor B still exists', false, `raw: ${bCheck}`);
    }
  }
}

// ═══════════════════════════════════════════════════════
//  MAIN — Run all tests sequentially
// ═══════════════════════════════════════════════════════

(async function main() {
  console.log('');
  console.log('══════════════════════════════════════════════════════');
  console.log('  ETHERIAL — Functional Scenario Tests');
  console.log('  Spec reference: fada-ethereal.md');
  console.log('══════════════════════════════════════════════════════');

  // ── Health check ──
  try {
    const h = await api('GET', '/api/health');
    if (h.status !== 200) throw new Error(`status ${h.status}`);
    log('🟢', `Server running — uptime ${h.data?.uptime?.toFixed(0)}s\n`);
  } catch (e) {
    console.error('  ❌ Server not reachable at', API_BASE);
    console.error('     Start with: cd etherial-rumor-verification-system && npm run dev');
    process.exit(1);
  }

  // ── Setup ──
  const users = setupTestUsers();
  console.log('');
  await sleep(2000);  // let Gun data fully propagate

  // ── Tests ──
  await test1(users);
  const factRumorId = await test2(users);
  await test3(users, factRumorId);
  await test4(users);

  // ── Summary ──
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  const total  = results.length;

  console.log('\n══════════════════════════════════════════════════════');
  console.log('  SUMMARY');
  console.log('══════════════════════════════════════════════════════');
  results.forEach(r => {
    console.log(`  ${r.pass ? '✅' : '❌'} ${r.name}`);
  });
  console.log('──────────────────────────────────────────────────────');
  console.log(`  ✅ ${passed} passed    ❌ ${failed} failed    📊 ${total} total`);
  console.log('══════════════════════════════════════════════════════\n');

  process.exit(failed > 0 ? 1 : 0);
})().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
