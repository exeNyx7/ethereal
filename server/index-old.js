/**
 * Etherial Backend — Express + Gun + WebSocket
 *
 * All Gun/P2P logic lives HERE. The frontend never touches Gun directly.
 * 
 * Endpoints:
 *   GET  /api/health
 *   POST /api/auth/login
 *   GET  /api/communities
 *   GET  /api/rumors/:domain
 *   POST /api/rumors
 *   POST /api/rumors/:id/vote
 *   POST /api/rumors/:id/oppose
 *   GET  /api/users/:domain/:publicKey
 *
 * WebSocket (ws://localhost:PORT):
 *   - Broadcasts new/updated rumors in real-time
 */

const Gun = require('gun');
require('gun/sea');
const http = require('http');
const express = require('express');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const path = require('path');
const net = require('net');

const PORT = process.env.PORT || 4000;
const GUN_FILE = path.join(__dirname, '..', '.gun-data');

// ───────────────────────────────────────────────────
// 1. Express App
// ───────────────────────────────────────────────────
const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

const server = http.createServer(app);

// ───────────────────────────────────────────────────
// 2. Gun Instance (server-side only)
// ───────────────────────────────────────────────────
const gun = Gun({
  web: server,
  file: GUN_FILE,
});
const SEA = Gun.SEA;
const db = gun.get('etherial');
const communities = db.get('communities');

// Known communities
const KNOWN_COMMUNITIES = {
  'nu.edu.pk': 'FAST NUCES',
  'lums.edu.pk': 'LUMS',
  'ict.edu.pk': 'ICT Islamabad',
  'uet.edu.pk': 'UET',
  'iba.edu.pk': 'IBA',
  'seecs.edu.pk': 'SEECS NUST',
  'fc.edu': 'Forman Christian College',
  'giki.edu.pk': 'GIKI',
};

// ───────────────────────────────────────────────────
// 3. Gun Helper Functions
// ───────────────────────────────────────────────────
function getCommunity(domain) {
  return communities.get(domain);
}
function getCommunityRumors(domain) {
  return getCommunity(domain).get('rumors');
}
function getCommunityUsers(domain) {
  return getCommunity(domain).get('users');
}
function getRumorVotes(domain, rumorId) {
  return getCommunityRumors(domain).get(rumorId).get('votes');
}

/** Promise wrapper for Gun .once() with timeout */
function gunOnce(node, timeoutMs = 3000) {
  return new Promise((resolve) => {
    let done = false;
    node.once((data) => {
      if (!done) { done = true; resolve(data || null); }
    });
    setTimeout(() => { if (!done) { done = true; resolve(null); } }, timeoutMs);
  });
}

/** Promise wrapper for Gun .put() */
function gunPut(node, data) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => resolve(), 5000);
    node.put(data, (ack) => {
      clearTimeout(timeout);
      if (ack.err) reject(new Error(ack.err));
      else resolve();
    });
  });
}

/** Read all children of a node via .map().once() */
function gunMapOnce(node, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const results = {};
    let timer;

    const finish = () => {
      clearTimeout(timer);
      resolve(results);
    };

    // Reset finish timer on each new item
    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(finish, 500); // 500ms of silence = done
    };

    // Overall timeout
    const overallTimer = setTimeout(finish, timeoutMs);

    node.map().once((data, key) => {
      if (!data || key === '_') return;
      results[key] = data;
      resetTimer();
    });

    // Kick off the silence timer in case there are zero items
    timer = setTimeout(finish, 800);
  });
}

// ───────────────────────────────────────────────────
// 4. WebSocket Broadcast
// ───────────────────────────────────────────────────
const wss = new WebSocketServer({ noServer: true });
const wsClients = new Set();

wss.on('connection', (ws) => {
  wsClients.add(ws);
  ws.on('close', () => wsClients.delete(ws));
  ws.on('error', () => wsClients.delete(ws));
});

// Upgrade HTTP to WebSocket on /ws path
server.on('upgrade', (req, socket, head) => {
  if (req.url === '/ws') {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  } else {
    // Let Gun handle its own WebSocket upgrades
    // (Gun uses the root path)
  }
});

function broadcast(event, data) {
  const msg = JSON.stringify({ event, data, ts: Date.now() });
  for (const ws of wsClients) {
    if (ws.readyState === 1) ws.send(msg);
  }
}

// ───────────────────────────────────────────────────
// 5. Gun Real-Time Watchers (per domain)
// ───────────────────────────────────────────────────
const watchedDomains = new Set();

function watchDomain(domain) {
  if (watchedDomains.has(domain)) return;
  watchedDomains.add(domain);

  getCommunityRumors(domain).map().on((data, key) => {
    if (!data || key === '_') return;
    broadcast('rumor:update', { domain, rumorId: key, rumor: data });
  });
}

// Watch all known communities on startup
for (const domain of Object.keys(KNOWN_COMMUNITIES)) {
  watchDomain(domain);
}

// ───────────────────────────────────────────────────
// 6. REST API Routes
// ───────────────────────────────────────────────────

// Health
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), wsClients: wsClients.size });
});

// Auth — login/register
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, passphrase } = req.body;
    if (!email || !passphrase) return res.status(400).json({ error: 'Email and passphrase required' });

    // Validate .edu domain  
    const parts = email.split('@');
    if (parts.length !== 2) return res.status(400).json({ error: 'Invalid email' });
    const domain = parts[1].toLowerCase();
    if (!/\.edu(\.[a-z]{2,3})?$/i.test(domain)) {
      return res.status(400).json({ error: 'Only .edu email domains allowed' });
    }

    // Derive lookup key (email is NEVER stored)
    const seed = `${email}:${passphrase}`;
    const lookupKey = await SEA.work(seed, 'etherial-blind-auth', null, { name: 'SHA-256' });
    const encryptionKey = await SEA.work(seed, 'etherial-keypair-encryption');

    if (!lookupKey || !encryptionKey) {
      return res.status(500).json({ error: 'Key derivation failed' });
    }

    const authNode = gun.get('etherial-auth').get(lookupKey);
    const storedData = await gunOnce(authNode);

    let pair;
    if (storedData?.encryptedPair) {
      // Returning user
      const decrypted = await SEA.decrypt(storedData.encryptedPair, encryptionKey);
      if (!decrypted) return res.status(401).json({ error: 'Wrong passphrase or corrupted data' });
      pair = typeof decrypted === 'string' ? JSON.parse(decrypted) : decrypted;
      if (!pair.pub) return res.status(401).json({ error: 'Invalid keypair' });
    } else {
      // New user
      pair = await SEA.pair();
      if (!pair?.pub) return res.status(500).json({ error: 'Keypair generation failed' });
      const encrypted = await SEA.encrypt(JSON.stringify(pair), encryptionKey);
      await gunPut(authNode, { encryptedPair: encrypted, createdAt: Date.now() });
    }

    // Initialize user in community
    const userNode = getCommunityUsers(domain).get(pair.pub);
    const userData = await gunOnce(userNode);

    if (!userData?.publicKey) {
      await gunPut(userNode, {
        publicKey: pair.pub,
        domain,
        karma: 1.0,
        createdAt: Date.now(),
      });
    }

    const karma = userData?.karma ?? 1.0;

    res.json({
      publicKey: pair.pub,
      domain,
      karma,
      pair, // Client needs this for signing
    });
  } catch (err) {
    console.error('[API] Auth error:', err);
    res.status(500).json({ error: err.message || 'Auth failed' });
  }
});

// List communities with rumor counts
app.get('/api/communities', async (req, res) => {
  try {
    const result = [];
    for (const [domain, name] of Object.entries(KNOWN_COMMUNITIES)) {
      const rumorsData = await gunOnce(getCommunityRumors(domain), 2000);
      const count = rumorsData && typeof rumorsData === 'object'
        ? Object.keys(rumorsData).filter(k => k !== '_').length
        : 0;
      result.push({ domain, name, rumorCount: count });
    }
    res.json(result);
  } catch (err) {
    console.error('[API] Communities error:', err);
    res.status(500).json({ error: 'Failed to fetch communities' });
  }
});

// Get rumors for a domain
app.get('/api/rumors/:domain', async (req, res) => {
  try {
    const { domain } = req.params;
    const rumorsMap = await gunMapOnce(getCommunityRumors(domain), 4000);

    const rumors = Object.values(rumorsMap)
      .filter((r) => r && r.id && r.status !== 'ghost')
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    res.json(rumors);
  } catch (err) {
    console.error('[API] Rumors error:', err);
    res.status(500).json({ error: 'Failed to fetch rumors' });
  }
});

// Post a new rumor
app.post('/api/rumors', async (req, res) => {
  try {
    const { text, domain, publicKey, windowDuration, pair } = req.body;
    if (!text || !domain || !publicKey) {
      return res.status(400).json({ error: 'text, domain, publicKey required' });
    }

    const rumorId = `rumor_${publicKey}_${Date.now()}`;
    const durationMs = {
      '12h': 12 * 3600000,
      '24h': 24 * 3600000,
      '2d': 2 * 86400000,
      '5d': 5 * 86400000,
    }[windowDuration || '24h'];

    // Sign if pair provided
    let signature = null;
    if (pair) {
      try {
        signature = await SEA.sign({ text, id: rumorId, timestamp: Date.now() }, pair);
      } catch (e) { /* signing optional */ }
    }

    const rumor = {
      id: rumorId,
      text,
      posterPublicKey: publicKey,
      domain,
      createdAt: Date.now(),
      windowDuration: windowDuration || '24h',
      windowClosesAt: Date.now() + durationMs,
      status: 'active',
      trust_score: 0,
      weighted_true: 0,
      weighted_false: 0,
      total_voters: 0,
      total_weight: 0,
      extendedOnce: false,
    };
    if (signature) rumor.signature = signature;

    const rumorNode = getCommunityRumors(domain).get(rumorId);
    await gunPut(rumorNode, rumor);

    broadcast('rumor:new', { domain, rumor });
    res.json({ success: true, rumor });
  } catch (err) {
    console.error('[API] Post rumor error:', err);
    res.status(500).json({ error: 'Failed to post rumor' });
  }
});

// Vote on a rumor
app.post('/api/rumors/:id/vote', async (req, res) => {
  try {
    const { id: rumorId } = req.params;
    const { domain, publicKey, value, pair } = req.body;

    if (!domain || !publicKey || ![-1, 1].includes(value)) {
      return res.status(400).json({ error: 'domain, publicKey, value (1 or -1) required' });
    }

    // Check rumor exists & is active
    const rumorNode = getCommunityRumors(domain).get(rumorId);
    const rumor = await gunOnce(rumorNode);
    if (!rumor) return res.status(404).json({ error: 'Rumor not found' });

    const isWindowOpen = rumor.windowClosesAt > Date.now();
    if (!isWindowOpen) return res.status(400).json({ error: 'Voting window closed' });
    if (rumor.status !== 'active' && rumor.status !== 'opposed') {
      return res.status(400).json({ error: 'Rumor is not accepting votes' });
    }

    // Check duplicate vote
    const voteId = `vote_${rumorId}_${publicKey}`;
    const votesNode = getRumorVotes(domain, rumorId);
    const existingVote = await gunOnce(votesNode.get(voteId));
    if (existingVote?.voterId) {
      return res.status(409).json({ error: 'Already voted on this rumor' });
    }

    // Get voter karma for weight
    const userData = await gunOnce(getCommunityUsers(domain).get(publicKey));
    const karma = userData?.karma ?? 1.0;
    const weight = Math.sqrt(karma);

    const vote = {
      voterId: publicKey,
      rumorId,
      value,
      weight,
      timestamp: Date.now(),
    };

    // Sign if pair provided
    if (pair) {
      try { vote.signature = await SEA.sign(vote, pair); } catch (e) { /* optional */ }
    }

    await gunPut(votesNode.get(voteId), vote);

    broadcast('rumor:vote', { domain, rumorId, vote });
    res.json({ success: true, weight });
  } catch (err) {
    console.error('[API] Vote error:', err);
    res.status(500).json({ error: 'Failed to record vote' });
  }
});

// Opposition challenge
app.post('/api/rumors/:id/oppose', async (req, res) => {
  try {
    const { id: rumorId } = req.params;
    const { domain, publicKey, reason, windowDuration, pair } = req.body;

    if (!domain || !publicKey) {
      return res.status(400).json({ error: 'domain, publicKey required' });
    }

    // Check karma threshold
    const userData = await gunOnce(getCommunityUsers(domain).get(publicKey));
    const karma = userData?.karma ?? 0;
    if (karma < 50) {
      return res.status(403).json({ error: `Need 50 karma to oppose. Current: ${karma}` });
    }

    // Check rumor is a resolved fact
    const rumorNode = getCommunityRumors(domain).get(rumorId);
    const rumor = await gunOnce(rumorNode);
    if (!rumor) return res.status(404).json({ error: 'Rumor not found' });
    if (rumor.status !== 'fact') {
      return res.status(400).json({ error: 'Can only oppose verified facts' });
    }
    if (rumor.oppositionId) {
      return res.status(409).json({ error: 'Rumor already has an opposition' });
    }

    const durationHours = windowDuration === '2d' ? 48 : 24;
    const oppositionId = `opp_${rumorId}_${Date.now()}`;

    const opposition = {
      id: oppositionId,
      challengerId: publicKey,
      originalRumorId: rumorId,
      domain,
      reason: reason || '',
      createdAt: Date.now(),
      windowClosesAt: Date.now() + durationHours * 3600000,
      status: 'active',
      trust_score: 0,
      weighted_true: 0,
      weighted_false: 0,
      total_voters: 0,
      total_weight: 0,
    };

    // Sign if pair provided
    if (pair) {
      try {
        opposition.signature = await SEA.sign({
          originalRumorId: rumorId,
          opposerId: publicKey,
          reason: reason || '',
          timestamp: Date.now(),
        }, pair);
      } catch (e) { /* optional */ }
    }

    // Store opposition as a rumor
    await gunPut(getCommunityRumors(domain).get(oppositionId), opposition);

    // Update original rumor
    await gunPut(rumorNode, { oppositionId, status: 'opposed' });

    broadcast('rumor:oppose', { domain, rumorId, opposition });
    res.json({ success: true, opposition });
  } catch (err) {
    console.error('[API] Oppose error:', err);
    res.status(500).json({ error: 'Failed to create opposition' });
  }
});

// Get user info
app.get('/api/users/:domain/:publicKey', async (req, res) => {
  try {
    const { domain, publicKey } = req.params;
    const userData = await gunOnce(getCommunityUsers(domain).get(publicKey));
    res.json(userData || { publicKey, domain, karma: 1.0 });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// ───────────────────────────────────────────────────
// 7. Start Server
// ───────────────────────────────────────────────────
function checkPort(port) {
  return new Promise((resolve) => {
    const tester = net.createServer()
      .once('error', () => resolve(false))
      .once('listening', () => { tester.close(); resolve(true); })
      .listen(port);
  });
}

async function start() {
  const available = await checkPort(PORT);
  if (!available) {
    console.log(`  ℹ️  Port ${PORT} already in use — backend may already be running`);
    process.exit(0);
  }

  server.listen(PORT, () => {
    console.log('');
    console.log('  ⚡ Etherial Backend running on http://localhost:' + PORT);
    console.log('  📡 REST API  → http://localhost:' + PORT + '/api');
    console.log('  🔌 WebSocket → ws://localhost:' + PORT + '/ws');
    console.log('  💾 Gun data  → ' + GUN_FILE);
    console.log('');
  });
}

start();
