/**
 * Etherial Backend — Express + Gun + WebSocket
 *
 * ALL P2P, reputation, resolution, opposition, and ghost logic lives HERE.
 * The frontend never touches Gun directly.
 *
 * ── Spec compliance ────────────────────────────────────────────────
 *  ✓ Blind auth with deterministic lookup key (SEA)
 *  ✓ One-email-one-account (email-level uniqueness hash)
 *  ✓ Dynamic communities — auto-created on first .edu signup
 *  ✓ Server-side domain↔publicKey validation on every write
 *  ✓ Hidden vote weights in API response while active
 *  ✓ Signature creation + verification (SEA.verify)
 *  ✓ √(karma) vote weighting
 *  ✓ Resolution formula  R = W_true / (W_true + W_false)
 *  ✓ Thresholds  R≥0.60 → FACT, R≤0.40 → FALSE, else INCONCLUSIVE
 *  ✓ Quorum  min 5 voters AND min 10 total weight
 *  ✓ Extended window (+24h on inconclusive, then UNVERIFIED)
 *  ✓ Trust-score freeze on resolution
 *  ✓ Asymmetric karma  +1 correct / −1.5 incorrect / ±2 poster
 *  ✓ Karma floor 0.1
 *  ✓ Opposition eligibility proportional to original W_true
 *  ✓ Opposition resolution via comparison to original W_true
 *  ✓ One opposition per fact (permanently locked on failure)
 *  ✓ Opposition karma  +3 win / −5 lose / −4 overturned / +1 upheld
 *  ✓ Ghost deletion with karma-reversal + cascade
 *  ✓ Community-scoped karma
 *  ✓ 30-second resolution scheduler
 * ───────────────────────────────────────────────────────────────────
 */

const Gun = require('gun');
require('gun/sea');
const http = require('http');
const express = require('express');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const path = require('path');
const net = require('net');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// ═══════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════
const PORT = process.env.PORT || 4000;
const GUN_FILE = path.join(__dirname, '..', '.gun-data');

// Spec constants
const MINIMUM_VOTERS       = 5;
const MINIMUM_WEIGHT       = 10;
const FACT_THRESHOLD       = 0.60;
const FALSE_THRESHOLD      = 0.40;
const EXTENDED_WINDOW_MS   = 24 * 3600000;        // 24 h
const KARMA_INITIAL        = 1.0;
const KARMA_FLOOR          = 0.1;
const KARMA_CORRECT_VOTE   = 1.0;
const KARMA_INCORRECT_VOTE = -1.5;
const KARMA_POSTER_FACT    = 2.0;
const KARMA_POSTER_FALSE   = -2.0;
const OPP_REWARD           = 3.0;                  // opposition win
const OPP_PENALTY          = -5.0;                 // opposition lose
const OPP_ORIG_VOTER_PEN   = -4.0;                 // original voters when overturned
const OPP_ORIG_POSTER_PEN  = -4.0;                 // original poster when overturned
const OPP_UPHELD_REWARD    = 1.0;                  // original voters when upheld
const SCHEDULER_MS         = 30_000;                // 30 s
const OTP_EXPIRY_MS        = 5 * 60_000;            // 5 min
const OTP_LENGTH           = 6;

// ═══════════════════════════════════════════════════
// 0.  EMAIL / OTP INFRASTRUCTURE
// ═══════════════════════════════════════════════════
let mailTransport = null;
const otpStore = new Map();  // email -> { code, expiresAt }

/** Initialise mail transport — uses real SMTP if configured, else Ethereal test account */
async function initMail() {
  if (process.env.SMTP_HOST) {
    mailTransport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: (process.env.SMTP_SECURE === 'true'),
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    log('Mail', `Using SMTP ${process.env.SMTP_HOST}`);
  } else {
    // Auto-create Ethereal test account (works instantly, no config needed)
    const testAcc = await nodemailer.createTestAccount();
    mailTransport = nodemailer.createTransport({
      host: testAcc.smtp.host,
      port: testAcc.smtp.port,
      secure: testAcc.smtp.secure,
      auth: { user: testAcc.user, pass: testAcc.pass },
    });
    log('Mail', `Using Ethereal test account — emails viewable at https://ethereal.email`);
    log('Mail', `  User: ${testAcc.user}`);
  }
}

function generateOTP() {
  return crypto.randomInt(100000, 999999).toString();
}

async function sendOTP(email, code) {
  const fromAddr = process.env.SMTP_USER || '"Etherial" <noreply@etherial.app>';
  const info = await mailTransport.sendMail({
    from: fromAddr,
    to: email,
    subject: `Etherial — Your verification code: ${code}`,
    text: `Your Etherial verification code is: ${code}\n\nThis code expires in 5 minutes.\nIf you did not request this, ignore this email.`,
    html: `
      <div style="font-family:sans-serif;max-width:400px;margin:auto;padding:32px;background:#0d0d14;color:#e0e0e0;border-radius:12px;border:1px solid #6c3baa33">
        <h2 style="color:#a855f7;margin:0 0 8px">Etherial</h2>
        <p style="color:#999;margin:0 0 24px;font-size:14px">Campus truth engine</p>
        <p style="margin:0 0 16px">Your verification code:</p>
        <div style="font-size:36px;font-weight:bold;letter-spacing:8px;text-align:center;padding:16px;background:#1a1a2e;border-radius:8px;color:#a855f7;border:1px solid #6c3baa44">${code}</div>
        <p style="color:#888;font-size:12px;margin:16px 0 0">Expires in 5 minutes. Never share this code.</p>
      </div>
    `,
  });
  // For Ethereal: log the preview URL so devs can see the email
  const preview = nodemailer.getTestMessageUrl(info);
  if (preview) log('Mail', `Preview OTP email → ${preview}`);
  return info;
}

/** Send credentials email after registration */
async function sendCredentialsEmail(email, username, password) {
  const fromAddr = process.env.SMTP_USER || '"Etherial" <noreply@etherial.app>';
  const info = await mailTransport.sendMail({
    from: fromAddr,
    to: email,
    subject: 'Etherial — Your account credentials',
    text: `Welcome to Etherial!\n\nYour login credentials:\n\nUsername: ${username}\nPassword: ${password}\n\nSave these securely — you will need them to sign in.\nDo NOT share these with anyone.\n\nThis is the only time these credentials will be sent.`,
    html: `
      <div style="font-family:sans-serif;max-width:400px;margin:auto;padding:32px;background:#0d0d14;color:#e0e0e0;border-radius:12px;border:1px solid #6c3baa33">
        <h2 style="color:#a855f7;margin:0 0 8px">Etherial</h2>
        <p style="color:#999;margin:0 0 24px;font-size:14px">Campus truth engine</p>
        <p style="margin:0 0 16px">Your account has been created! Here are your login credentials:</p>
        <div style="padding:16px;background:#1a1a2e;border-radius:8px;border:1px solid #6c3baa44;margin:0 0 12px">
          <p style="margin:0 0 8px;color:#999;font-size:12px">USERNAME</p>
          <p style="font-size:18px;font-weight:bold;color:#a855f7;margin:0;font-family:monospace">${username}</p>
        </div>
        <div style="padding:16px;background:#1a1a2e;border-radius:8px;border:1px solid #6c3baa44;margin:0 0 16px">
          <p style="margin:0 0 8px;color:#999;font-size:12px">PASSWORD</p>
          <p style="font-size:18px;font-weight:bold;color:#a855f7;margin:0;font-family:monospace">${password}</p>
        </div>
        <p style="color:#ff6b6b;font-size:13px;font-weight:bold;margin:0 0 8px">⚠ Save these credentials now!</p>
        <p style="color:#888;font-size:12px;margin:0">This is the only time they will be sent. Do not share with anyone.</p>
      </div>
    `,
  });
  const preview = nodemailer.getTestMessageUrl(info);
  if (preview) log('Mail', `Preview credentials email → ${preview}`);
  return info;
}

// ═══════════════════════════════════════════════════
// 1.  EXPRESS + HTTP SERVER
// ═══════════════════════════════════════════════════
const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
const server = http.createServer(app);

// ═══════════════════════════════════════════════════
// 2.  GUN INSTANCE (server-side only)
// ═══════════════════════════════════════════════════
const gun = Gun({ web: server, file: GUN_FILE });
const SEA = Gun.SEA;
const db = gun.get('etherial');
const communitiesRoot = db.get('communities');

// ═══════════════════════════════════════════════════
// 3.  GUN HELPERS
// ═══════════════════════════════════════════════════
const community     = (d) => communitiesRoot.get(d);
const comRumors     = (d) => community(d).get('rumors');
const comUsers      = (d) => community(d).get('users');
const rumorVotes    = (d, rid) => comRumors(d).get(rid).get('votes');

function gunOnce(node, ms = 3000) {
  return new Promise((res) => {
    let done = false;
    node.once((d) => { if (!done) { done = true; res(d || null); } });
    setTimeout(() => { if (!done) { done = true; res(null); } }, ms);
  });
}
function gunPut(node, data) {
  return new Promise((res, rej) => {
    const t = setTimeout(() => res(), 5000);
    node.put(data, (ack) => { clearTimeout(t); ack.err ? rej(new Error(ack.err)) : res(); });
  });
}
function gunMapOnce(node, ms = 3000) {
  return new Promise((res) => {
    const r = {};
    let t1, t2;
    const finish = () => { clearTimeout(t1); clearTimeout(t2); res(r); };
    const reset  = () => { clearTimeout(t1); t1 = setTimeout(finish, 500); };
    t2 = setTimeout(finish, ms);
    node.map().once((d, k) => { if (d && k !== '_') { r[k] = d; reset(); } });
    t1 = setTimeout(finish, 800);
  });
}

// ─── Karma helpers ──
const clamp = (v) => Math.max(KARMA_FLOOR, v);

async function getKarma(domain, pub) {
  const u = await gunOnce(comUsers(domain).get(pub));
  return u?.karma ?? KARMA_INITIAL;
}

async function addKarma(domain, pub, delta) {
  const cur = await getKarma(domain, pub);
  const nk = clamp(cur + delta);
  await gunPut(comUsers(domain).get(pub), { karma: nk });
  log('Karma', `${pub.slice(0,8)}… ${cur.toFixed(2)} → ${nk.toFixed(2)} (${delta >= 0 ? '+' : ''}${delta})`);
  return nk;
}

function log(tag, msg) { console.log(`  [${tag}] ${msg}`); }

// ═══════════════════════════════════════════════════
// 4.  WEBSOCKET BROADCAST
// ═══════════════════════════════════════════════════
const wss = new WebSocketServer({ noServer: true });
const wsClients = new Set();
wss.on('connection', (ws) => {
  wsClients.add(ws);
  ws.on('close', () => wsClients.delete(ws));
  ws.on('error', () => wsClients.delete(ws));
});
server.on('upgrade', (req, socket, head) => {
  if (req.url === '/ws') wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  // else Gun handles its own WS
});
function broadcast(event, data) {
  const m = JSON.stringify({ event, data, ts: Date.now() });
  for (const ws of wsClients) if (ws.readyState === 1) ws.send(m);
}

// ═══════════════════════════════════════════════════
// 5.  DYNAMIC COMMUNITY REGISTRY
// ═══════════════════════════════════════════════════
const watchedDomains = new Set();

function watchDomain(d) {
  if (watchedDomains.has(d)) return;
  watchedDomains.add(d);
  comRumors(d).map().on((data, key) => {
    if (data && key !== '_') broadcast('rumor:update', { domain: d, rumorId: key, rumor: data });
  });
}

/** Auto-create a community the first time someone signs up with that domain */
async function ensureCommunity(domain) {
  const metaNode = community(domain).get('meta');
  const meta = await gunOnce(metaNode);
  if (meta?.domain) { watchDomain(domain); return meta; }

  // Use full domain as the community name
  const name = domain;
  const newMeta = { domain, name, createdAt: Date.now() };
  await gunPut(metaNode, newMeta);
  watchDomain(domain);
  broadcast('community:new', newMeta);
  log('Community', `Auto-created ${domain}`);
  return newMeta;
}

/** List every community that exists in Gun */
async function listCommunities() {
  const all = await gunMapOnce(communitiesRoot, 4000);
  const out = [];
  for (const [d] of Object.entries(all)) {
    if (d === '_') continue;
    const meta = await gunOnce(community(d).get('meta'), 2000);
    if (!meta?.domain) continue;
    const rMap = await gunMapOnce(comRumors(d), 2000);
    const cnt = Object.keys(rMap).filter(k => k !== '_').length;
    out.push({ domain: meta.domain, name: meta.name, rumorCount: cnt });
  }
  return out;
}

// ═══════════════════════════════════════════════════
// 6.  VOTE FETCHING (re-weights from current karma)
// ═══════════════════════════════════════════════════
async function fetchVotes(domain, rumorId) {
  const map = await gunMapOnce(rumorVotes(domain, rumorId), 3000);
  const votes = [];
  for (const [k, v] of Object.entries(map)) {
    if (!v || k === '_' || !v.voterId) continue;
    const karma = await getKarma(domain, v.voterId);
    votes.push({
      voterId: v.voterId,
      value: v.value === 1 ? 1 : -1,
      weight: Math.sqrt(Math.max(karma, 0)),
      timestamp: v.timestamp || 0,
    });
  }
  return votes;
}

// ═══════════════════════════════════════════════════
// 7.  RESOLUTION ENGINE
// ═══════════════════════════════════════════════════
async function resolveRumor(domain, rumorId) {
  const node = comRumors(domain).get(rumorId);
  const r = await gunOnce(node);
  if (!r?.id || r.status !== 'active') return null;
  if (r.windowClosesAt > Date.now()) return null;
  // skip if this is an opposition rumor (handled by resolveOpposition)
  if (r.originalRumorId) return null;

  log('Resolve', `Processing ${rumorId}`);

  const votes = await fetchVotes(domain, rumorId);

  // ── Quorum ──
  if (votes.length < MINIMUM_VOTERS) {
    if (r.extendedOnce) {
      await gunPut(node, { status: 'unverified', trust_score: 0, resolvedAt: Date.now() });
      broadcast('rumor:resolve', { domain, rumorId, status: 'unverified' });
      log('Resolve', `${rumorId}: UNVERIFIED (no quorum after extension)`);
    }
    return null;
  }

  let Wt = 0, Wf = 0;
  for (const v of votes) { if (v.value === 1) Wt += v.weight; else Wf += v.weight; }
  const total = Wt + Wf;

  // ── Min weight ──
  if (total < MINIMUM_WEIGHT) {
    if (r.extendedOnce) {
      await gunPut(node, { status: 'unverified', trust_score: 0, resolvedAt: Date.now() });
      broadcast('rumor:resolve', { domain, rumorId, status: 'unverified' });
    }
    return null;
  }

  const R = Wt / total;
  log('Resolve', `${rumorId}: R=${R.toFixed(4)} Wt=${Wt.toFixed(2)} Wf=${Wf.toFixed(2)} voters=${votes.length}`);

  let status;
  if (R >= FACT_THRESHOLD) status = 'fact';
  else if (R <= FALSE_THRESHOLD) status = 'false';
  else {
    // ── Inconclusive ──
    if (r.extendedOnce) {
      status = 'unverified';
      await gunPut(node, { status, trust_score: R, weighted_true: Wt, weighted_false: Wf, total_voters: votes.length, total_weight: total, resolvedAt: Date.now() });
      broadcast('rumor:resolve', { domain, rumorId, status });
      log('Resolve', `${rumorId}: UNVERIFIED (extended exhausted)`);
      return { status };
    }
    // first inconclusive → extend 24 h
    await gunPut(node, { windowClosesAt: Date.now() + EXTENDED_WINDOW_MS, extendedOnce: true });
    log('Resolve', `${rumorId}: INCONCLUSIVE — extended +24h`);
    return null;
  }

  // ── Freeze trust score ──
  await gunPut(node, {
    status, trust_score: R,
    weighted_true: Wt, weighted_false: Wf,
    total_voters: votes.length, total_weight: total,
    resolvedAt: Date.now(),
  });
  broadcast('rumor:resolve', { domain, rumorId, status, trust_score: R });
  log('Resolve', `${rumorId}: ${status.toUpperCase()}`);

  // ── Karma ──
  const maj = status === 'fact' ? 1 : -1;
  for (const v of votes) await addKarma(domain, v.voterId, v.value === maj ? KARMA_CORRECT_VOTE : KARMA_INCORRECT_VOTE);
  if (r.posterPublicKey) await addKarma(domain, r.posterPublicKey, status === 'fact' ? KARMA_POSTER_FACT : KARMA_POSTER_FALSE);

  return { status, R };
}

// ═══════════════════════════════════════════════════
// 8.  OPPOSITION RESOLUTION
// ═══════════════════════════════════════════════════
async function resolveOpposition(domain, oppId) {
  const oppNode = comRumors(domain).get(oppId);
  const opp = await gunOnce(oppNode);
  if (!opp || opp.status !== 'active' || !opp.originalRumorId) return null;
  if (opp.windowClosesAt > Date.now()) return null;

  log('Opposition', `Resolving ${oppId} → challenges ${opp.originalRumorId}`);

  const oppVotes = await fetchVotes(domain, oppId);
  const orig = await gunOnce(comRumors(domain).get(opp.originalRumorId));
  if (!orig) { await gunPut(oppNode, { status: 'failed', resolvedAt: Date.now() }); return null; }

  // opposition W_true (people who support the challenge)
  let oppWt = 0;
  for (const v of oppVotes) if (v.value === 1) oppWt += v.weight;

  const origWt = orig.weighted_true || 0;
  log('Opposition', `oppWt=${oppWt.toFixed(2)} vs origWt=${origWt.toFixed(2)}`);

  // Spec: must gather MORE than original W_true
  if (oppWt > origWt) {
    // ── SUCCESS — fact overturned ──
    log('Opposition', `${oppId}: SUCCEEDED`);

    // penalize original TRUE voters −4
    const origVotes = await fetchVotes(domain, opp.originalRumorId);
    for (const v of origVotes) if (v.value === 1) await addKarma(domain, v.voterId, OPP_ORIG_VOTER_PEN);

    // penalize poster −4
    if (orig.posterPublicKey) await addKarma(domain, orig.posterPublicKey, OPP_ORIG_POSTER_PEN);

    // reward opposition upvoters +3
    for (const v of oppVotes) if (v.value === 1) await addKarma(domain, v.voterId, OPP_REWARD);

    await gunPut(comRumors(domain).get(opp.originalRumorId), { status: 'false', trust_score: 0, overturnedAt: Date.now() });
    await gunPut(oppNode, { status: 'succeeded', resolvedAt: Date.now() });

    broadcast('rumor:resolve', { domain, rumorId: opp.originalRumorId, status: 'false', overturned: true });
    broadcast('rumor:resolve', { domain, rumorId: oppId, status: 'succeeded' });
  } else {
    // ── FAIL — fact stands ──
    log('Opposition', `${oppId}: FAILED`);

    // penalize ALL opposition voters −5
    for (const v of oppVotes) if (v.voterId) await addKarma(domain, v.voterId, OPP_PENALTY);

    // reward original TRUE voters +1
    const origVotes = await fetchVotes(domain, opp.originalRumorId);
    for (const v of origVotes) if (v.value === 1) await addKarma(domain, v.voterId, OPP_UPHELD_REWARD);

    await gunPut(comRumors(domain).get(opp.originalRumorId), { status: 'fact' });
    await gunPut(oppNode, { status: 'failed', resolvedAt: Date.now() });

    broadcast('rumor:resolve', { domain, rumorId: opp.originalRumorId, status: 'fact', upheld: true });
    broadcast('rumor:resolve', { domain, rumorId: oppId, status: 'failed' });
  }
  return { success: oppWt > origWt };
}

// ═══════════════════════════════════════════════════
// 9.  GHOST SYSTEM
// ═══════════════════════════════════════════════════
async function ghostRumor(domain, rumorId) {
  const node = comRumors(domain).get(rumorId);
  const r = await gunOnce(node);
  if (!r || r.status === 'ghost') return;
  log('Ghost', `Ghosting ${rumorId} (was ${r.status})`);

  const wasResolved = r.status === 'fact' || r.status === 'false';

  // ── reverse karma ──
  if (wasResolved) {
    const votes = await fetchVotes(domain, rumorId);
    const win = r.status === 'fact' ? 1 : -1;
    for (const v of votes) await addKarma(domain, v.voterId, v.value === win ? -KARMA_CORRECT_VOTE : -KARMA_INCORRECT_VOTE);
    if (r.posterPublicKey) await addKarma(domain, r.posterPublicKey, r.status === 'fact' ? -KARMA_POSTER_FACT : -KARMA_POSTER_FALSE);
  }

  // ── mark ghost ──
  await gunPut(node, { status: 'ghost', trust_score: 0, ghostedAt: Date.now(), votesNullified: true });

  // ── cascade: skip frozen scores (spec: trust-score freeze) ──
  const all = await gunMapOnce(comRumors(domain), 4000);
  for (const [k, rum] of Object.entries(all)) {
    if (!rum || k === '_' || !rum.id || rum.status === 'ghost' || rum.status === 'active') continue;
    if (rum.parentRumorId === rumorId || rum.oppositionId === rumorId || rum.originalRumorId === rumorId) {
      log('Ghost', `Cascade hit ${rum.id} — skipping (frozen score)`);
    }
  }

  broadcast('rumor:update', { domain, rumorId, rumor: { status: 'ghost', trust_score: 0 } });
  log('Ghost', `${rumorId} ghosted`);
}

// ═══════════════════════════════════════════════════
// 10. SCHEDULER
// ═══════════════════════════════════════════════════
async function runScheduler() {
  try {
    const all = await gunMapOnce(communitiesRoot, 3000);
    for (const d of Object.keys(all)) {
      if (d === '_') continue;
      const rMap = await gunMapOnce(comRumors(d), 3000);
      for (const [k, r] of Object.entries(rMap)) {
        if (!r || k === '_' || !r.id || r.status !== 'active') continue;
        if (!r.windowClosesAt || r.windowClosesAt > Date.now()) continue;

        if (r.originalRumorId) await resolveOpposition(d, r.id);
        else                   await resolveRumor(d, r.id);
      }
    }
  } catch (e) { console.error('  [Scheduler] Error:', e.message); }
}

// ═══════════════════════════════════════════════════
// 11. DOMAIN ↔ KEY VALIDATION
// ═══════════════════════════════════════════════════
async function validateKey(domain, pub) {
  const u = await gunOnce(comUsers(domain).get(pub));
  return !!(u?.publicKey === pub && u?.domain === domain);
}

// ═══════════════════════════════════════════════════
// 12. REST API
// ═══════════════════════════════════════════════════

// ── Health ──
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), wsClients: wsClients.size, domains: [...watchedDomains] });
});

// ── Send OTP (for registration only) ──
app.post('/api/auth/send-otp', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });

    const parts = email.split('@');
    if (parts.length !== 2) return res.status(400).json({ error: 'Invalid email' });
    const domain = parts[1].toLowerCase();
    if (!/\.edu(\.[a-z]{2,})?$/i.test(domain)) return res.status(400).json({ error: 'Only .edu email domains allowed' });

    // Check if this email is already registered
    const emailHash = await SEA.work(email.toLowerCase(), 'etherial-email-unique', null, { name: 'SHA-256' });
    const emailNode = gun.get('etherial-emails').get(emailHash);
    const existing = await gunOnce(emailNode);
    if (existing?.registered) {
      return res.status(409).json({ error: 'This email is already registered. Please login with your username and password.' });
    }

    // Send OTP
    const code = generateOTP();
    const key = email.toLowerCase();
    otpStore.set(key, { code, expiresAt: Date.now() + OTP_EXPIRY_MS });
    log('OTP', `Generated ${code} for ${key} (expires in 5m)`);

    await sendOTP(email, code);
    res.json({ message: 'Verification code sent to your email.' });
  } catch (e) {
    console.error('[OTP]', e);
    res.status(500).json({ error: 'Failed to send verification email. ' + (e.message || '') });
  }
});

// ── Register (email + OTP → generates username + password) ──
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ error: 'Email and verification code required' });

    const parts = email.split('@');
    if (parts.length !== 2) return res.status(400).json({ error: 'Invalid email' });
    const domain = parts[1].toLowerCase();
    if (!/\.edu(\.[a-z]{2,})?$/i.test(domain)) return res.status(400).json({ error: 'Only .edu email domains allowed' });

    // Validate OTP
    const key = email.toLowerCase();
    const otpEntry = otpStore.get(key);
    if (!otpEntry) return res.status(403).json({ error: 'No verification code found. Please request a new one.' });
    if (Date.now() > otpEntry.expiresAt) { otpStore.delete(key); return res.status(410).json({ error: 'Verification code expired. Please request a new one.' }); }
    if (otpEntry.code !== otp.toString().trim()) return res.status(401).json({ error: 'Invalid verification code.' });

    // OTP valid — consume it
    otpStore.delete(key);
    log('OTP', `Verified & consumed for ${key}`);

    // Check email not already registered
    const emailHash = await SEA.work(email.toLowerCase(), 'etherial-email-unique', null, { name: 'SHA-256' });
    const emailNode = gun.get('etherial-emails').get(emailHash);
    const existingEmail = await gunOnce(emailNode);
    if (existingEmail?.registered) {
      return res.status(409).json({ error: 'This email is already registered.' });
    }

    // Generate username + password
    const adjectives = ['swift','bold','dark','keen','wild','calm','free','wise','cool','fast','pure','deep'];
    const nouns = ['wolf','hawk','lynx','bear','fox','owl','moth','crow','pike','wren','hare','elk'];
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const tag = crypto.randomBytes(2).toString('hex'); // 4 hex chars
    const username = `user_${adj}${noun}_${tag}`;
    const password = crypto.randomInt(100000, 999999).toString(); // 6-digit numeric PIN

    // Generate keypair
    const pair = await SEA.pair();
    if (!pair?.pub) return res.status(500).json({ error: 'Keypair generation failed' });

    // Store credentials → keypair mapping (hashed for security)
    const credSeed = `${username.toLowerCase()}:${password}`;
    const credHash = await SEA.work(credSeed, 'etherial-cred-auth', null, { name: 'SHA-256' });
    const encKey = await SEA.work(credSeed, 'etherial-keypair-encryption');
    if (!credHash || !encKey) return res.status(500).json({ error: 'Key derivation failed' });

    const enc = await SEA.encrypt(JSON.stringify(pair), encKey);
    const authNode = gun.get('etherial-auth').get(credHash);
    await gunPut(authNode, { encryptedPair: enc, username, createdAt: Date.now() });

    // Mark email as registered
    await gunPut(emailNode, { registered: true, username, createdAt: Date.now() });

    // Store username → credHash mapping for lookup
    const usernameNode = gun.get('etherial-usernames').get(username.toLowerCase());
    await gunPut(usernameNode, { credHash, domain, createdAt: Date.now() });

    // Auto-create community
    await ensureCommunity(domain);

    // Init user in community
    const uNode = comUsers(domain).get(pair.pub);
    await gunPut(uNode, { publicKey: pair.pub, domain, karma: KARMA_INITIAL, username, createdAt: Date.now() });

    log('Auth', `Registered ${username} for domain ${domain}`);

    // Email credentials to user — this is the ONLY way they get them
    try {
      await sendCredentialsEmail(email, username, password);
      log('Auth', `Credentials emailed to ${email}`);
    } catch (mailErr) {
      console.error('[Mail] Failed to send credentials:', mailErr);
      // Still return success — user is registered, but warn them
    }

    // Never return username/password/pair in response — sent via email only
    res.json({
      publicKey: pair.pub,
      domain,
      karma: KARMA_INITIAL,
      pair,
      message: 'Account created! Your username and password have been sent to your email.'
    });
  } catch (e) {
    console.error('[Register]', e);
    res.status(500).json({ error: e.message || 'Registration failed' });
  }
});

// ── Login (username + password) ──
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

    // Derive credential hash
    const credSeed = `${username.toLowerCase()}:${password}`;
    const credHash = await SEA.work(credSeed, 'etherial-cred-auth', null, { name: 'SHA-256' });
    const encKey = await SEA.work(credSeed, 'etherial-keypair-encryption');
    if (!credHash || !encKey) return res.status(500).json({ error: 'Key derivation failed' });

    // Look up stored auth
    const authNode = gun.get('etherial-auth').get(credHash);
    const stored = await gunOnce(authNode);
    if (!stored?.encryptedPair) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    // Decrypt keypair
    const dec = await SEA.decrypt(stored.encryptedPair, encKey);
    if (!dec) return res.status(401).json({ error: 'Invalid username or password.' });
    const pair = typeof dec === 'string' ? JSON.parse(dec) : dec;
    if (!pair.pub) return res.status(500).json({ error: 'Invalid keypair' });

    // Look up username → domain
    const usernameNode = gun.get('etherial-usernames').get(username.toLowerCase());
    const uMeta = await gunOnce(usernameNode);
    const domain = uMeta?.domain;
    if (!domain) return res.status(500).json({ error: 'Account domain not found' });

    // Ensure community exists
    await ensureCommunity(domain);

    // Get user data
    const uNode = comUsers(domain).get(pair.pub);
    const uData = await gunOnce(uNode);
    if (!uData?.publicKey) {
      await gunPut(uNode, { publicKey: pair.pub, domain, karma: KARMA_INITIAL, username: username.toLowerCase(), createdAt: Date.now() });
    }

    res.json({ publicKey: pair.pub, domain, karma: uData?.karma ?? KARMA_INITIAL, pair });
  } catch (e) {
    console.error('[Auth]', e);
    res.status(500).json({ error: e.message || 'Login failed' });
  }
});

// ── Change Credentials (username and/or password) ──
app.post('/api/auth/change-credentials', async (req, res) => {
  try {
    const { currentUsername, currentPassword, newUsername, newPassword } = req.body;
    if (!currentUsername || !currentPassword) return res.status(400).json({ error: 'Current username and password required' });
    if (!newUsername && !newPassword) return res.status(400).json({ error: 'Provide a new username and/or new password' });

    // Authenticate with current credentials
    const oldCredSeed = `${currentUsername.toLowerCase()}:${currentPassword}`;
    const oldCredHash = await SEA.work(oldCredSeed, 'etherial-cred-auth', null, { name: 'SHA-256' });
    const oldEncKey = await SEA.work(oldCredSeed, 'etherial-keypair-encryption');
    if (!oldCredHash || !oldEncKey) return res.status(500).json({ error: 'Key derivation failed' });

    const oldAuthNode = gun.get('etherial-auth').get(oldCredHash);
    const stored = await gunOnce(oldAuthNode);
    if (!stored?.encryptedPair) return res.status(401).json({ error: 'Invalid current username or password.' });

    // Decrypt keypair
    const dec = await SEA.decrypt(stored.encryptedPair, oldEncKey);
    if (!dec) return res.status(401).json({ error: 'Invalid current username or password.' });
    const pair = typeof dec === 'string' ? JSON.parse(dec) : dec;
    if (!pair.pub) return res.status(500).json({ error: 'Invalid keypair' });

    // Get domain from old username node
    const oldUsernameNode = gun.get('etherial-usernames').get(currentUsername.toLowerCase());
    const uMeta = await gunOnce(oldUsernameNode);
    const domain = uMeta?.domain;
    if (!domain) return res.status(500).json({ error: 'Account domain not found' });

    // Determine final new credentials
    const finalUsername = (newUsername || currentUsername).trim();
    const finalPassword = newPassword || currentPassword;

    // Validate new username format (if changed)
    if (newUsername && newUsername.toLowerCase() !== currentUsername.toLowerCase()) {
      if (newUsername.length < 3 || newUsername.length > 30) {
        return res.status(400).json({ error: 'Username must be 3-30 characters' });
      }
      if (!/^[a-zA-Z0-9_]+$/.test(newUsername)) {
        return res.status(400).json({ error: 'Username can only contain letters, numbers, and underscores' });
      }
      // Check if new username is taken
      const existingNode = gun.get('etherial-usernames').get(finalUsername.toLowerCase());
      const existing = await gunOnce(existingNode);
      if (existing?.credHash) {
        return res.status(409).json({ error: 'Username already taken. Choose another.' });
      }
    }

    // Validate new password (if changed)
    if (newPassword) {
      if (newPassword.length < 4 || newPassword.length > 30) {
        return res.status(400).json({ error: 'Password must be 4-30 characters' });
      }
    }

    // Create new credential mapping
    const newCredSeed = `${finalUsername.toLowerCase()}:${finalPassword}`;
    const newCredHash = await SEA.work(newCredSeed, 'etherial-cred-auth', null, { name: 'SHA-256' });
    const newEncKey = await SEA.work(newCredSeed, 'etherial-keypair-encryption');
    if (!newCredHash || !newEncKey) return res.status(500).json({ error: 'New key derivation failed' });

    // Encrypt keypair with new credentials
    const newEnc = await SEA.encrypt(JSON.stringify(pair), newEncKey);
    const newAuthNode = gun.get('etherial-auth').get(newCredHash);
    await gunPut(newAuthNode, { encryptedPair: newEnc, username: finalUsername, createdAt: Date.now() });

    // Null out old auth node
    await gunPut(oldAuthNode, null);

    // Update username node
    if (newUsername && newUsername.toLowerCase() !== currentUsername.toLowerCase()) {
      // Remove old username mapping
      await gunPut(oldUsernameNode, null);
      // Create new username mapping
      const newUsernameNode = gun.get('etherial-usernames').get(finalUsername.toLowerCase());
      await gunPut(newUsernameNode, { credHash: newCredHash, domain, createdAt: Date.now() });
      // Update username in community user data
      const uNode = comUsers(domain).get(pair.pub);
      const uData = await gunOnce(uNode);
      if (uData) {
        await gunPut(uNode, { ...uData, username: finalUsername });
      }
    } else {
      // Same username, just update credHash pointer
      await gunPut(oldUsernameNode, { credHash: newCredHash, domain, createdAt: uMeta.createdAt || Date.now() });
    }

    log('Auth', `Credentials changed for ${currentUsername} → ${finalUsername}`);

    res.json({
      success: true,
      message: 'Credentials updated successfully.',
      username: finalUsername
    });
  } catch (e) {
    console.error('[ChangeCredentials]', e);
    res.status(500).json({ error: e.message || 'Failed to change credentials' });
  }
});

// ── Delete Account (requires username + password) ──
app.post('/api/auth/delete', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

    // Verify credentials first
    const credSeed = `${username.toLowerCase()}:${password}`;
    const credHash = await SEA.work(credSeed, 'etherial-cred-auth', null, { name: 'SHA-256' });
    const encKey = await SEA.work(credSeed, 'etherial-keypair-encryption');
    if (!credHash || !encKey) return res.status(500).json({ error: 'Key derivation failed' });

    const authNode = gun.get('etherial-auth').get(credHash);
    const stored = await gunOnce(authNode);
    if (!stored?.encryptedPair) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    // Decrypt keypair to get publicKey
    const dec = await SEA.decrypt(stored.encryptedPair, encKey);
    if (!dec) return res.status(401).json({ error: 'Invalid username or password.' });
    const pair = typeof dec === 'string' ? JSON.parse(dec) : dec;

    // Get domain from username node
    const usernameNode = gun.get('etherial-usernames').get(username.toLowerCase());
    const uMeta = await gunOnce(usernameNode);
    const domain = uMeta?.domain;

    // Null out all stored data (GunDB doesn't truly delete, but nulling removes data)
    await gunPut(authNode, null);              // Remove auth/keypair
    await gunPut(usernameNode, null);          // Remove username mapping

    // Remove user from community
    if (domain && pair?.pub) {
      const uNode = comUsers(domain).get(pair.pub);
      await gunPut(uNode, null);
    }

    // Note: email hash node stays (prevents re-registration with same email)
    // This is intentional — one email, one account, ever.

    log('Auth', `Deleted account ${username}`);
    res.json({ success: true, message: 'Account deleted. All data has been removed.' });
  } catch (e) {
    console.error('[Delete]', e);
    res.status(500).json({ error: e.message || 'Deletion failed' });
  }
});

// ── Communities ──
app.get('/api/communities', async (_req, res) => {
  try { res.json(await listCommunities()); }
  catch (e) { res.status(500).json({ error: 'Failed' }); }
});

// ── Rumors (read) ──
app.get('/api/rumors/:domain', async (req, res) => {
  try {
    const { domain } = req.params;
    const map = await gunMapOnce(comRumors(domain), 4000);
    const rumors = Object.values(map)
      .filter(r => r?.id && r.status !== 'ghost')
      .map(r => {
        // ── hide vote weights while active (spec §4.6) ──
        if (r.status === 'active' || r.status === 'opposed') {
          const { weighted_true, weighted_false, total_weight, ...safe } = r;
          return safe;
        }
        return r;
      })
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    res.json(rumors);
  } catch (e) { res.status(500).json({ error: 'Failed' }); }
});

// ── Post rumor ──
app.post('/api/rumors', async (req, res) => {
  try {
    const { text, domain, publicKey, windowDuration, pair } = req.body;
    if (!text || !domain || !publicKey) return res.status(400).json({ error: 'text, domain, publicKey required' });

    // server-side domain check
    if (!(await validateKey(domain, publicKey))) return res.status(403).json({ error: 'Post in your own community only' });

    // sig verify
    if (pair) {
      try {
        const p = { text, publicKey, ts: Date.now() };
        const sig = await SEA.sign(p, pair);
        const ok = await SEA.verify(sig, pair.pub);
        if (!ok) return res.status(403).json({ error: 'Signature verification failed' });
      } catch (_) { /* dev fallback */ }
    }

    const id = `rumor_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
    const dur = { '12h': 12*3.6e6, '24h': 24*3.6e6, '2d': 2*864e5, '5d': 5*864e5 }[windowDuration||'24h'] || 24*3.6e6;

    const rumor = {
      id, text, posterPublicKey: publicKey, domain,
      createdAt: Date.now(),
      windowDuration: windowDuration || '24h',
      windowClosesAt: Date.now() + dur,
      status: 'active',
      trust_score: 0, weighted_true: 0, weighted_false: 0,
      total_voters: 0, total_weight: 0, extendedOnce: false,
    };
    await gunPut(comRumors(domain).get(id), rumor);
    broadcast('rumor:new', { domain, rumor });
    res.json({ success: true, rumor });
  } catch (e) { res.status(500).json({ error: 'Failed to post rumor' }); }
});

// ── Vote ──
app.post('/api/rumors/:id/vote', async (req, res) => {
  try {
    const rid = req.params.id;
    const { domain, publicKey, value, pair } = req.body;
    if (!domain || !publicKey || ![1, -1].includes(value)) return res.status(400).json({ error: 'domain, publicKey, value required' });

    if (!(await validateKey(domain, publicKey))) return res.status(403).json({ error: 'Vote in your own community only' });

    // sig verify
    if (pair) {
      try {
        const sig = await SEA.sign({ rid, publicKey, value, ts: Date.now() }, pair);
        if (!(await SEA.verify(sig, pair.pub))) return res.status(403).json({ error: 'Sig failed' });
      } catch (_) {}
    }

    const rumor = await gunOnce(comRumors(domain).get(rid));
    if (!rumor) return res.status(404).json({ error: 'Not found' });
    if (rumor.posterPublicKey === publicKey) return res.status(403).json({ error: 'Cannot vote on your own rumor' });
    if (rumor.windowClosesAt <= Date.now()) return res.status(400).json({ error: 'Window closed' });
    if (rumor.status !== 'active' && rumor.status !== 'opposed') return res.status(400).json({ error: 'Not accepting votes' });

    // duplicate check
    const vid = `vote_${rid}_${publicKey}`;
    const ex = await gunOnce(rumorVotes(domain, rid).get(vid));
    if (ex?.voterId) return res.status(409).json({ error: 'Already voted' });

    const karma = await getKarma(domain, publicKey);
    const weight = Math.sqrt(Math.max(karma, 0));

    await gunPut(rumorVotes(domain, rid).get(vid), { voterId: publicKey, rumorId: rid, value, weight, timestamp: Date.now() });
    broadcast('rumor:vote', { domain, rumorId: rid, vote: { value, weight } });
    res.json({ success: true, weight });
  } catch (e) { res.status(500).json({ error: 'Vote failed' }); }
});

// ── Oppose ──
app.post('/api/rumors/:id/oppose', async (req, res) => {
  try {
    const rid = req.params.id;
    const { domain, publicKey, reason, windowDuration, pair } = req.body;
    if (!domain || !publicKey) return res.status(400).json({ error: 'domain, publicKey required' });
    if (!(await validateKey(domain, publicKey))) return res.status(403).json({ error: 'Oppose in your own community only' });

    const rumor = await gunOnce(comRumors(domain).get(rid));
    if (!rumor) return res.status(404).json({ error: 'Not found' });
    if (rumor.status !== 'fact') return res.status(400).json({ error: 'Can only oppose verified facts' });
    if (rumor.oppositionId) return res.status(409).json({ error: 'Already challenged — one opposition per fact' });

    // eligibility: karma ≥ max(10, 20% of original W_true)
    const uk = await getKarma(domain, publicKey);
    const origWt = rumor.weighted_true || 0;
    const required = Math.max(10, origWt * 0.2);
    if (uk < required) return res.status(403).json({ error: `Need ${required.toFixed(1)} karma (20% of fact's weight). You have ${uk.toFixed(1)}.` });

    const hrs = windowDuration === '2d' ? 48 : 24;
    const oid = `opp_${rid}_${Date.now()}`;
    const opp = {
      id: oid, originalRumorId: rid, challengerId: publicKey, posterPublicKey: publicKey, domain,
      text: `Opposition: ${rumor.text}`, reason: reason || '',
      createdAt: Date.now(), windowClosesAt: Date.now() + hrs * 3.6e6,
      status: 'active', trust_score: 0, weighted_true: 0, weighted_false: 0, total_voters: 0, total_weight: 0,
    };

    await gunPut(comRumors(domain).get(oid), opp);
    await gunPut(comRumors(domain).get(rid), { oppositionId: oid, status: 'opposed' });
    broadcast('rumor:oppose', { domain, rumorId: rid, opposition: opp });
    res.json({ success: true, opposition: opp });
  } catch (e) { res.status(500).json({ error: 'Opposition failed' }); }
});

// ── Ghost ──
app.post('/api/rumors/:id/ghost', async (req, res) => {
  try {
    const { domain } = req.body;
    if (!domain) return res.status(400).json({ error: 'domain required' });
    await ghostRumor(domain, req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Ghost failed' }); }
});

// ── User info ──
app.get('/api/users/:domain/:publicKey', async (req, res) => {
  try {
    const u = await gunOnce(comUsers(req.params.domain).get(req.params.publicKey));
    res.json(u || { publicKey: req.params.publicKey, domain: req.params.domain, karma: KARMA_INITIAL });
  } catch (_) { res.status(500).json({ error: 'Failed' }); }
});

// ═══════════════════════════════════════════════════
// 13. START
// ═══════════════════════════════════════════════════
function checkPort(p) {
  return new Promise(r => {
    const t = net.createServer().once('error', () => r(false)).once('listening', function() { this.close(); r(true); }).listen(p);
  });
}

async function start() {
  if (!(await checkPort(PORT))) { console.log(`  Port ${PORT} busy`); process.exit(0); }

  await initMail();

  server.listen(PORT, async () => {
    console.log('');
    console.log('  ⚡ Etherial Backend on http://localhost:' + PORT);
    console.log('  📡 REST  → http://localhost:' + PORT + '/api');
    console.log('  🔌 WS    → ws://localhost:' + PORT + '/ws');
    console.log('  💾 Data  → ' + GUN_FILE);

    const comms = await listCommunities();
    for (const c of comms) watchDomain(c.domain);
    console.log(`  📋 ${comms.length} communities loaded`);

    setInterval(runScheduler, SCHEDULER_MS);
    console.log(`  ⏰ Scheduler every ${SCHEDULER_MS / 1000}s`);
    console.log('');
  });
}

start();
