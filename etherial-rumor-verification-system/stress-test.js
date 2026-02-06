/**
 * Etherial — Gun DB & Relay Stress Test
 * 
 * Uses separate child processes (with forced exit) to simulate
 * two independent browser tabs communicating through the relay.
 */

const { execSync } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const RELAY = 'http://localhost:8765/gun';
const results = [];

function log(icon, msg) { console.log(`  ${icon} ${msg}`); }

function assert(name, condition) {
  results.push({ name, status: condition ? 'PASS' : 'FAIL' });
  log(condition ? '✅' : '❌', `${condition ? 'PASS' : 'FAIL'}: ${name}`);
}

// Run a script in a child process, force-killing Gun's persistent connections
function peer(code, timeout = 15000) {
  const tmp = path.join(__dirname, `_tmp_${Date.now()}_${Math.random().toString(36).slice(2)}.js`);
  // Wrap: suppress Gun's welcome message, and force process.exit
  const wrapped = `
    // Suppress Gun console noise
    const _log = console.log;
    let gunReady = false;
    console.log = function() {
      const msg = [...arguments].join(' ');
      if (msg.includes('Hello wonderful') || msg.includes('AXE') || msg.includes('Multicast') || msg.includes('reusing')) return;
      _log.apply(console, arguments);
    };
    ${code}
  `;
  fs.writeFileSync(tmp, wrapped);
  try {
    const out = execSync(`node "${tmp}"`, { timeout, encoding: 'utf-8', cwd: __dirname });
    return out.trim().split('\n').filter(l => l.trim()).pop() || '';
  } catch (e) {
    if (e.stdout) return e.stdout.trim().split('\n').filter(l => l.trim()).pop() || `ERR:${e.status}`;
    return `ERR:${e.message.slice(0, 80)}`;
  } finally {
    try { fs.unlinkSync(tmp); } catch {}
  }
}

// ── Test 1: Relay Health ──
async function test1() {
  return new Promise(resolve => {
    http.get(`${RELAY.replace('/gun', '')}/health`, res => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => {
        try { assert('Relay health', JSON.parse(b).status === 'ok'); }
        catch { assert('Relay health', false); }
        resolve();
      });
    }).on('error', () => { assert('Relay health', false); resolve(); });
  });
}

// ── Test 2: Write → Read through relay (separate processes) ──
function test2() {
  const key = 'sync_' + Date.now();
  const val = 'v_' + Math.random().toString(36).slice(2, 8);

  log('📤', `Writing key=${key} val=${val}`);
  const wOut = peer(`
    const Gun = require('gun');
    const g = Gun({ peers: ['${RELAY}'], file: false, radisk: false });
    // Wait for WebSocket to connect before writing
    setTimeout(function() {
      g.get('etherial').get('stresstest').get('${key}').put({ v: '${val}', t: Date.now() }, function(ack) {
        setTimeout(function() { process.stdout.write('W:OK\\n'); process.exit(0); }, 3000);
      });
    }, 2000);
    setTimeout(function() { process.stdout.write('W:TIMEOUT\\n'); process.exit(0); }, 10000);
  `, 15000);
  log('📤', `Write result: ${wOut}`);

  log('📥', 'Reading from separate process...');
  const rOut = peer(`
    const Gun = require('gun');
    const g = Gun({ peers: ['${RELAY}'], file: false, radisk: false });
    let done = false;
    // Wait for connection, then read
    setTimeout(function() {
      g.get('etherial').get('stresstest').get('${key}').on(function(data) {
        if (!done && data && data.v) {
          done = true;
          process.stdout.write('R:' + data.v + '\\n');
          setTimeout(function() { process.exit(0); }, 500);
        }
      });
    }, 1500);
    setTimeout(function() {
      if (!done) {
        done = true;
        g.get('etherial').get('stresstest').get('${key}').once(function(data) {
          process.stdout.write('R:' + (data && data.v ? data.v : 'EMPTY') + '\\n');
          setTimeout(function() { process.exit(0); }, 500);
        });
      }
    }, 6000);
    setTimeout(function() { process.stdout.write('R:TIMEOUT\\n'); process.exit(0); }, 12000);
  `, 18000);

  const readVal = rOut.startsWith('R:') ? rOut.slice(2) : rOut;
  log('📥', `Read result: ${readVal}`);
  assert('Cross-process sync (write → read)', readVal === val);
}

// ── Test 3: SEA Crypto ──
function test3() {
  const out = peer(`
    const Gun = require('gun');
    require('gun/sea');
    const SEA = Gun.SEA;
    (async () => {
      const r = [];
      const p = await SEA.pair();
      r.push(p && p.pub ? 'PAIR:OK' : 'PAIR:FAIL');
      const s = await SEA.sign({ t: 'hello' }, p);
      r.push(typeof s === 'string' ? 'SIGN:OK' : 'SIGN:FAIL');
      const v = await SEA.verify(s, p.pub);
      r.push(v && v.t === 'hello' ? 'VERIFY:OK' : 'VERIFY:FAIL');
      const k = await SEA.work('p', 's');
      r.push(k ? 'WORK:OK' : 'WORK:FAIL');
      const e = await SEA.encrypt('sec', k);
      r.push(e ? 'ENC:OK' : 'ENC:FAIL');
      const d = await SEA.decrypt(e, k);
      r.push(d === 'sec' ? 'DEC:OK' : 'DEC:FAIL');
      process.stdout.write(r.join(',') + '\\n');
      process.exit(0);
    })();
    setTimeout(function() { process.exit(1); }, 10000);
  `, 12000);

  const parts = out.split(',');
  assert('SEA.pair()', parts.includes('PAIR:OK'));
  assert('SEA.sign()', parts.includes('SIGN:OK'));
  assert('SEA.verify()', parts.includes('VERIFY:OK'));
  assert('SEA.work()', parts.includes('WORK:OK'));
  assert('SEA.encrypt()', parts.includes('ENC:OK'));
  assert('SEA.decrypt()', parts.includes('DEC:OK'));
}

// ── Test 4: Nested Graph (rumor + votes) ──
function test4() {
  const rid = 'rumor_st_' + Date.now();

  log('📤', `Creating rumor ${rid} with 3 votes...`);
  const wOut = peer(`
    const Gun = require('gun');
    const g = Gun({ peers: ['${RELAY}'], file: false, radisk: false });
    setTimeout(function() {
      const n = g.get('etherial').get('communities').get('test.edu').get('rumors').get('${rid}');
      n.put({
        id: '${rid}', text: 'StressRumor', posterPublicKey: 'pk1', domain: 'test.edu',
        createdAt: ${Date.now()}, windowClosesAt: ${Date.now() + 86400000},
        status: 'active', trust_score: 0, weighted_true: 0, weighted_false: 0,
        total_voters: 0, total_weight: 0, extendedOnce: false
      }, function() {
        let c = 0;
        for (let i = 0; i < 3; i++) {
          n.get('votes').get('v' + i).put({ voterId: 'vt' + i, value: 1, weight: 1, timestamp: Date.now() }, function() {
            c++;
            if (c === 3) setTimeout(function() { process.stdout.write('W:OK\\n'); process.exit(0); }, 3000);
          });
        }
      });
    }, 2000);
    setTimeout(function() { process.stdout.write('W:TIMEOUT\\n'); process.exit(0); }, 12000);
  `, 18000);
  log('📤', `Write: ${wOut}`);

  log('📥', 'Reading rumor + votes from separate process...');
  const rOut = peer(`
    const Gun = require('gun');
    const g = Gun({ peers: ['${RELAY}'], file: false, radisk: false });
    setTimeout(function() {
      const n = g.get('etherial').get('communities').get('test.edu').get('rumors').get('${rid}');
      n.once(function(d) {
        const rok = d && d.text === 'StressRumor' ? 'ROK' : 'RFAIL';
        let vc = 0, chk = 0;
        for (let i = 0; i < 3; i++) {
          n.get('votes').get('v' + i).once(function(vd) {
            if (vd && vd.voterId) vc++;
            chk++;
            if (chk === 3) {
              process.stdout.write(rok + ':V' + vc + '\\n');
              setTimeout(function() { process.exit(0); }, 500);
            }
          });
        }
      });
    }, 1500);
    setTimeout(function() { process.stdout.write('TIMEOUT:V0\\n'); process.exit(0); }, 12000);
  `, 18000);

  log('📥', `Read: ${rOut}`);
  assert('Nested graph: rumor syncs', rOut.startsWith('ROK'));
  assert('Nested graph: 3 votes sync', rOut.includes('V3'));
}

// ── Test 5: .map() enumeration from another process ──
function test5() {
  const cid = 'coll_' + Date.now();

  log('📤', `Writing 5 items to collection ${cid}...`);
  peer(`
    const Gun = require('gun');
    const g = Gun({ peers: ['${RELAY}'], file: false, radisk: false });
    setTimeout(function() {
      let d = 0;
      for (let i = 0; i < 5; i++) {
        g.get('etherial').get('stresstest').get('${cid}').get('i' + i).put({ idx: i, v: 'x' + i }, function() {
          d++;
          if (d === 5) setTimeout(function() { process.stdout.write('W:5\\n'); process.exit(0); }, 3000);
        });
      }
    }, 2000);
    setTimeout(function() { process.stdout.write('W:T\\n'); process.exit(0); }, 12000);
  `, 18000);

  log('📥', 'Enumerating via .map() from separate process...');
  const rOut = peer(`
    const Gun = require('gun');
    const g = Gun({ peers: ['${RELAY}'], file: false, radisk: false });
    const f = {};
    setTimeout(function() {
      g.get('etherial').get('stresstest').get('${cid}').map().once(function(data, key) {
        if (data && key && key !== '_') f[key] = true;
      });
    }, 1500);
    setTimeout(function() {
      process.stdout.write('MAP:' + Object.keys(f).length + '\\n');
      process.exit(0);
    }, 7000);
    setTimeout(function() { process.stdout.write('MAP:0\\n'); process.exit(0); }, 12000);
  `, 18000);

  const m = rOut.match(/MAP:(\d+)/);
  const cnt = m ? parseInt(m[1]) : 0;
  log('📥', `Found ${cnt}/5 via .map()`);
  assert('.map() enumeration (5 items)', cnt === 5);
}

// ── Test 6: Bidirectional sync ──
function test6() {
  const k1 = 'biA_' + Date.now();
  const k2 = 'biB_' + Date.now();

  // Process A writes k1
  peer(`
    const Gun = require('gun');
    const g = Gun({ peers: ['${RELAY}'], file: false, radisk: false });
    setTimeout(function() {
      g.get('etherial').get('stresstest').get('${k1}').put({ from: 'A' }, function() {
        setTimeout(function() { process.stdout.write('OK\\n'); process.exit(0); }, 3000);
      });
    }, 2000);
    setTimeout(function() { process.exit(0); }, 10000);
  `, 15000);

  // Process B writes k2
  peer(`
    const Gun = require('gun');
    const g = Gun({ peers: ['${RELAY}'], file: false, radisk: false });
    setTimeout(function() {
      g.get('etherial').get('stresstest').get('${k2}').put({ from: 'B' }, function() {
        setTimeout(function() { process.stdout.write('OK\\n'); process.exit(0); }, 3000);
      });
    }, 2000);
    setTimeout(function() { process.exit(0); }, 10000);
  `, 15000);

  // Process C reads both
  const rOut = peer(`
    const Gun = require('gun');
    const g = Gun({ peers: ['${RELAY}'], file: false, radisk: false });
    let a = false, b = false;
    setTimeout(function() {
      g.get('etherial').get('stresstest').get('${k1}').once(function(d) { if (d && d.from === 'A') a = true; });
      g.get('etherial').get('stresstest').get('${k2}').once(function(d) { if (d && d.from === 'B') b = true; });
    }, 1500);
    setTimeout(function() {
      process.stdout.write('A:' + a + ',B:' + b + '\\n');
      process.exit(0);
    }, 6000);
    setTimeout(function() { process.exit(0); }, 10000);
  `, 15000);

  log('📥', `Bidirectional read: ${rOut}`);
  assert('Bidirectional sync (A+B→C)', rOut.includes('A:true') && rOut.includes('B:true'));
}

// ── Runner ──
async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════');
  console.log('  ETHERIAL GUN DB STRESS TEST');
  console.log('  Relay: ' + RELAY);
  console.log('═══════════════════════════════════════════════');

  console.log('\n── Test 1: Relay Health ──');
  await test1();

  console.log('\n── Test 2: Cross-Process Sync ──');
  test2();

  console.log('\n── Test 3: SEA Crypto ──');
  test3();

  console.log('\n── Test 4: Nested Graph ──');
  test4();

  console.log('\n── Test 5: .map() Enumeration ──');
  test5();

  console.log('\n── Test 6: Bidirectional Sync ──');
  test6();

  // Summary
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;

  console.log('\n═══════════════════════════════════════════════');
  if (failed === 0) {
    console.log(`  🎉 ALL ${passed} TESTS PASSED`);
  } else {
    console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
    results.filter(r => r.status === 'FAIL').forEach(r => console.log(`    ❌ ${r.name}`));
  }
  console.log('═══════════════════════════════════════════════\n');

  process.exit(failed > 0 ? 1 : 0);
}

main();

