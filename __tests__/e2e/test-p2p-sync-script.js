const Gun = require('gun');

// Connect to local relay
const peers = ['http://localhost:8765/gun'];

// Initialize two independent nodes (simulating two users)
// Disable local storage/radisk to force network sync
const gun1 = Gun({ peers, localStorage: false, radisk: false, file: false, axon: false }); 
const gun2 = Gun({ peers, localStorage: false, radisk: false, file: false, axon: false });

console.log('Starting P2P Sync Test via ' + peers[0]);

const TEST_NODE = 'test_sync_' + Date.now();
const TEST_VALUE = 'Sync_Success_' + Date.now();

let received = false;

// Node 2 listens
gun2.get('test_space').get(TEST_NODE).on((data) => {
  if (data === TEST_VALUE && !received) {
    received = true;
    console.log('✅ Node 2 received data:', data);
    console.log('SUCCESS: P2P Sync Verified!');
    process.exit(0);
  }
});

// Node 1 puts data
setTimeout(() => {
  console.log('Node 1 putting data:', TEST_VALUE);
  gun1.get('test_space').get(TEST_NODE).put(TEST_VALUE);
}, 2000);

// Timeout
setTimeout(() => {
    console.error('❌ Timeout waiting for sync. Check relay connection.');
    process.exit(1);
}, 10000);
