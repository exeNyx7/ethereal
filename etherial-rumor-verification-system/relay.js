/**
 * Etherial — Local Gun Relay Server
 * 
 * This relay acts as a WebSocket hub so all browser tabs/windows
 * can discover each other and sync data in real time.
 * 
 * Usage:
 *   node relay.js            (starts on port 8765)
 *   PORT=9999 node relay.js  (custom port)
 */

const Gun = require('gun');
const http = require('http');
const path = require('path');
const net = require('net');

const PORT = process.env.RELAY_PORT || 8765;

// Check if port is already in use before starting
function checkPort(port) {
  return new Promise((resolve) => {
    const tester = net.createServer()
      .once('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          resolve(false);  // Port is in use
        } else {
          resolve(true);   // Other error, try to start anyway
        }
      })
      .once('listening', () => {
        tester.close();
        resolve(true);     // Port is available
      })
      .listen(port);
  });
}

async function start() {
  const portAvailable = await checkPort(PORT);
  
  if (!portAvailable) {
    console.log('');
    console.log('  ℹ️  Relay already running on port ' + PORT);
    console.log('  ✅ Skipping duplicate start');
    console.log('');
    process.exit(0);  // Exit gracefully
  }

  const server = http.createServer((req, res) => {
    // Simple health check endpoint
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }));
      return;
    }
    // Gun handles all other requests
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<h1>Etherial Gun Relay</h1><p>Running on port ' + PORT + '</p>');
  });

  // Attach Gun to the HTTP server — this enables WebSocket relay
  const gun = Gun({
    web: server,
    file: path.join(__dirname, '.gun-data'),  // Persist relay data to disk
  });

  server.on('error', (err) => {
    console.error('  ❌ Relay server error:', err);
    process.exit(1);
  });

  server.listen(PORT, () => {
    console.log('');
    console.log('  ⚡ Etherial Gun Relay running on http://localhost:' + PORT + '/gun');
    console.log('  📡 All browser tabs will sync through this relay');
    console.log('  💾 Data persisted to .gun-data/');
    console.log('');
  });
}

start();
