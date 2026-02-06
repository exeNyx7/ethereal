# 📘 ETHERIAL — Complete Manual

> Decentralized Anonymous Campus Rumor Verification System  
> **No database, no servers — pure P2P powered by GunDB**

---

## 📋 Table of Contents

1. [Quick Start](#-quick-start)
2. [System Architecture](#-system-architecture)
3. [Data Flow Diagrams](#-data-flow-diagrams)
4. [Dependencies & Installation](#-dependencies--installation)
5. [How It Works](#-how-it-works)
6. [Testing Guide](#-testing-guide)
7. [Troubleshooting](#-troubleshooting)

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ or 20+
- npm or pnpm
- Modern browser (Chrome/Edge/Firefox)

### Installation

```powershell
# Navigate to project directory
cd etherial-rumor-verification-system

# Install dependencies (use --legacy-peer-deps for Gun compatibility)
npm install --legacy-peer-deps

# Start development server
npm run dev
```

**Open:** http://localhost:3000

---

## 🏗️ System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     ETHERIAL P2P NETWORK                        │
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    │
│  │   Peer A     │◄──►│   Peer B     │◄──►│   Peer C     │    │
│  │ (Browser 1)  │    │ (Browser 2)  │    │ (Browser 3)  │    │
│  └──────────────┘    └──────────────┘    └──────────────┘    │
│         ▲                    ▲                    ▲            │
│         │                    │                    │            │
│         └────────────────────┴────────────────────┘            │
│                              │                                 │
│                    ┌─────────▼─────────┐                       │
│                    │   Gun Relay       │                       │
│                    │   (Optional)      │                       │
│                    │   WebRTC/WebSocket│                       │
│                    └───────────────────┘                       │
└─────────────────────────────────────────────────────────────────┘

          NO CENTRAL DATABASE • NO SERVERS • PURE P2P
```

### Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | Next.js 16 + React 19 | UI framework |
| **Styling** | Tailwind CSS + shadcn/ui | Component library |
| **Database** | GunDB 0.2020.1241 | Decentralized graph database |
| **Crypto** | Gun/SEA | ECDSA keypairs, signing, encryption |
| **Network** | WebRTC + WebSocket | P2P synchronization |
| **Local Storage** | IndexedDB (via Gun) | Client-side persistence |

### Component Architecture

```
app/
  ├─ page.tsx                   ← Main dashboard & rumor feed
  └─ layout.tsx                 ← Root layout with providers

components/
  ├─ rumor-card.tsx            ← Individual rumor display
  ├─ truth-meter.tsx           ← Status indicator & progress
  ├─ opposition-modal.tsx      ← Challenge FACT interface
  ├─ auth-modal.tsx            ← Blind authentication UI
  └─ community-sidebar.tsx     ← University switcher

lib/
  ├─ gun-db.ts                 ← GunDB initialization
  ├─ gun-config.ts             ← Relay peers & communities
  ├─ auth-service.ts           ← Blind auth + SEA crypto
  ├─ user-context.tsx          ← Global user state
  ├─ rumor-engine.ts           ← Resolution logic & karma
  ├─ reputation-logic.ts       ← Trust score calculation
  ├─ opposition-engine.ts      ← Challenge mechanism
  ├─ ghost-system.ts           ← Soft deletion & cascade
  ├─ resolution-scheduler.ts   ← Auto-resolve expired rumors
  └─ timestamp-utils.ts        ← Clock sync & windows
```

---

## 🔄 Data Flow Diagrams

### 1. Authentication Flow (Blind Auth)

```
┌─────────────┐
│   User      │
│ @nu.edu.pk  │
└──────┬──────┘
       │ Email + Passphrase
       ▼
┌──────────────────────────────────┐
│   auth-service.ts                │
│   generateKeypair()              │
├──────────────────────────────────┤
│ 1. Extract domain (@nu.edu.pk)   │
│ 2. Validate .edu domain          │
│ 3. SEA.work(SHA256) → lookup key │
│ 4. Check Gun for existing pair   │
│ 5. Generate NEW random pair      │
│ 6. SEA.encrypt(pair, passphrase) │
│ 7. Store encrypted in Gun        │
│ 8. Save pair in sessionStorage   │
└──────────────┬───────────────────┘
               │
               ▼
      ┌────────────────────┐
      │ UserContext State  │
      │ {                  │
      │   publicKey: "..."  │
      │   pair: {...}      │
      │   karma: 1.0       │
      │   domain: nu.edu.pk│
      │ }                  │
      └────────────────────┘
```

### 2. Rumor Posting Flow

```
User types rumor → handlePostRumor()
         │
         ├─ Generate rumorId (timestamp-based)
         ├─ Sign content with SEA.sign(pair)
         ├─ Calculate windowClosesAt (12h-5d)
         │
         ▼
  Gun.get('etherial')
    .get('communities')
    .get('nu.edu.pk')
    .get('rumors')
    .get(rumorId)
    .put({
      id, text, posterPublicKey,
      status: 'active',
      windowClosesAt,
      signature,
      trust_score: 0
    })
         │
         ▼
  Real-time .on() listener fires
         │
         ▼
  All connected peers see new rumor instantly
```

### 3. Voting & Resolution Flow

```
User clicks 👍 → handleVote(rumorId, 1)
         │
         ├─ Check window open (isVotingWindowOpen)
         ├─ Check clock skew (validateClockSkew)
         ├─ Check duplicate vote (Gun lookup)
         ├─ Calculate weight: √karma
         ├─ Sign vote with SEA.sign(pair)
         │
         ▼
  Gun.get(rumorId).get('votes').get(voteId).put({
    voterId, value: 1, weight, timestamp, signature
  })
         │
  ┌─────┴──────────────────────────┐
  │                                │
  ▼                                ▼
Window open              Window closes (30s scan)
  └─ More votes...              │
                                ▼
                    resolution-scheduler.ts
                    scanAndResolve(domain)
                                │
                    ┌───────────┴───────────┐
                    │ resolveRumor()        │
                    ├───────────────────────┤
                    │ 1. Fetch all votes    │
                    │ 2. Check quorum (5+)  │
                    │ 3. Sum weighted votes │
                    │ 4. Calculate ratio    │
                    │    (W_true / W_total) │
                    │ 5. Apply thresholds:  │
                    │    ≥0.6 → FACT        │
                    │    ≤0.4 → FALSE       │
                    │    else → UNVERIFIED  │
                    │ 6. Lock status in Gun │
                    └───────────┬───────────┘
                                │
                    ┌───────────▼───────────┐
                    │ updateKarmaAfterRes() │
                    ├───────────────────────┤
                    │ Winners: +1.0         │
                    │ Losers:  -1.5         │
                    │ Poster:  ±2.0         │
                    │ Floor:   0.1 minimum  │
                    └───────────┬───────────┘
                                │
                                ▼
                    Gun updates user karma → .on() fires
                                │
                                ▼
                    All peers see new karma & status
```

### 4. Opposition Challenge Flow

```
Rumor locked as FACT
         │
User (karma ≥50) clicks "Challenge Fact"
         │
         ├─ Check karma threshold (50+)
         ├─ Check one-opposition-per-fact rule
         ├─ Create opposition rumor node
         ├─ Set original status: 'opposed'
         ├─ Link via oppositionId (Gun-safe scalar)
         │
         ▼
  Opposition voting window opens (24-48h)
         │
  ┌─────┴─────────────────┐
  │                       │
  ▼                       ▼
Votes accumulate    Window closes
  │                       │
  │           ┌───────────▼──────────┐
  │           │ resolveOppo()        │
  │           ├──────────────────────┤
  │           │ Calculate trust      │
  │           │                      │
  │           │ IF FACT (overturn):  │
  │           │  • Orig voters: -4.0 │
  │           │  • Orig poster: -4.0 │
  │           │  • Opposers:    +3.0 │
  │           │  • Status: 'false'   │
  │           │                      │
  │           │ IF FALSE (stands):   │
  │           │  • All opposers: -5.0│
  │           │  • Orig voters: +1.0 │
  │           │  • Status: 'fact'    │
  │           │  • LOCKED forever    │
  │           └──────────────────────┘
  │
  └──────────► Feed updates via .on()
```

### 5. GunDB Graph Structure

```
etherial/
  └─ communities/
      ├─ nu.edu.pk/
      │   ├─ users/
      │   │   ├─ {pubkey_1}/
      │   │   │   ├─ publicKey: "..."
      │   │   │   ├─ domain: "nu.edu.pk"
      │   │   │   ├─ karma: 15.3
      │   │   │   ├─ createdAt: 1738876800000
      │   │   │   └─ encryptedKeypair: "..."
      │   │   └─ {pubkey_2}/...
      │   │
      │   └─ rumors/
      │       ├─ rumor_{pubkey}_{timestamp}/
      │       │   ├─ id: "..."
      │       │   ├─ text: "Professor canceled..."
      │       │   ├─ posterPublicKey: "..."
      │       │   ├─ status: "active"
      │       │   ├─ trust_score: 0.73
      │       │   ├─ windowClosesAt: 1738920000000
      │       │   ├─ oppositionId: "opposition_..."
      │       │   ├─ signature: "..."
      │       │   └─ votes/
      │       │       ├─ vote_rumorId_pubkey1/
      │       │       │   ├─ voterId: "..."
      │       │       │   ├─ value: 1
      │       │       │   ├─ weight: 1.41  (√2.0)
      │       │       │   ├─ timestamp: ...
      │       │       │   └─ signature: "..."
      │       │       └─ vote_rumorId_pubkey2/...
      │       │
      │       └─ opposition_{timestamp}/
      │           ├─ originalRumorId: "..."
      │           ├─ opposerId: "..."
      │           ├─ status: "active"
      │           └─ expiresAt: ...
      │
      └─ mit.edu/...
```

---

## 📦 Dependencies & Installation

### Core Dependencies

```json
{
  "next": "16.1.6",
  "react": "^19.0.0",
  "gun": "^0.2020.1241",
  "tailwindcss": "^4.1.7",
  "sonner": "^1.7.1"
}
```

### Installation Steps

#### 1. Clone & Install
```powershell
cd etherial-rumor-verification-system
npm install --legacy-peer-deps
```

> **Why `--legacy-peer-deps`?**  
> GunDB has peer dependency conflicts with React 19. This flag resolves them safely.

#### 2. Verify Gun Installation
```powershell
# Check if Gun installed correctly
node -e "console.log(require('gun/package.json').version)"
# Should output: 0.2020.1241
```

#### 3. No Database Setup Required! 🎉
- **GunDB runs entirely in-browser** (IndexedDB + localStorage)
- **No PostgreSQL, MongoDB, or any server database**
- **No connection strings or migrations**
- Data syncs P2P between browsers via WebRTC/WebSocket

#### 4. Optional: Run Your Own Gun Relay (Advanced)
```powershell
# Install gun globally
npm install -g gun

# Start relay server
gun --port 8765
```

Then update `lib/gun-config.ts`:
```typescript
export const DEFAULT_RELAYS = [
  'http://localhost:8765/gun',
  // ... other relays
];
```

---

## 🧠 How It Works

### 1. **Blind Authentication**
- User enters: `yourname@nu.edu.pk` + passphrase
- System extracts domain (`nu.edu.pk`)
- Validates `.edu` TLD
- Derives deterministic lookup key: `SHA256(email + passphrase)`
- Checks Gun for existing keypair
- If found: decrypt with passphrase
- If new: generate random ECDSA keypair → encrypt → store
- **No passwords stored** — only encrypted keypairs

### 2. **Posting Rumors**
- User types rumor text
- Selects voting window (12h / 24h / 2d / 5d)
- System:
  - Generates unique ID: `rumor_{publicKey}_{timestamp}`
  - Signs content with `SEA.sign(data, pair)`
  - Writes to Gun graph
  - Broadcasts via P2P `.on()` listeners
- **All peers see rumor instantly** (no refresh needed)

### 3. **Weighted Voting**
- Vote weight = `Math.sqrt(voter.karma)`
- New users (karma 1.0) → weight 1.0
- Veteran (karma 100) → weight 10.0
- **Prevents sybil attacks**: Creating 100 bots = 100 weight  
  vs. Earning karma on 1 account = can reach 100+ weight
- **Votes are cryptographically signed** (prevents forgery)
- **No vote changing** — deterministic vote IDs prevent duplicates

### 4. **Resolution (Auto)**
- Every peer runs a scheduler (30s scan)
- Checks for expired voting windows (`windowClosesAt < now`)
- Calculates trust score:
  ```
  Trust = W_true / (W_true + W_false)
  ```
- Thresholds:
  - ≥ 0.6 → **FACT**
  - ≤ 0.4 → **FALSE**
  - 0.4-0.6 → **UNVERIFIED** (or extended window once)
- Updates karma:
  - Winners: +1.0
  - Losers: -1.5
  - False poster: -2.0
  - Fact poster: +2.0

### 5. **Opposition Challenges**
- Only users with **karma ≥ 50** can challenge
- Can only challenge rumors marked as **FACT**
- **One opposition per fact** (permanent lock after first fails)
- Opens new voting window (24-48h)
- If opposition succeeds (overturns FACT):
  - Original voters: -4.0 each
  - Original poster: -4.0
  - Opposition voters: +3.0 each
  - Status: `'false'`
- If opposition fails (FACT stands):
  - All opposition voters: -5.0 each
  - Original voters: +1.0 each
  - Fact permanently locked

### 6. **Ghost Deletion**
- When a rumor is ghosted:
  - Status → `'ghost'`
  - Trust score → 0
  - **Reverses all karma** from that rumor's resolution
  - Triggers cascade: recalculates dependent rumors
  - Filtered from all feeds
- Preserves graph integrity (no dangling references)

---

## 🧪 Testing Guide

### Test 1: Authentication
```
1. Open http://localhost:3000
2. Enter: test@nu.edu.pk + any passphrase
3. ✅ Sidebar shows "test" with karma 1.0
4. Refresh page → ✅ Still logged in (sessionStorage)
5. Try non-.edu email → ❌ Should reject
```

### Test 2: Post & Vote
```
1. Click "New Rumor"
2. Type: "CS301 exam postponed to Friday"
3. Select "Standard (1-2 days)"
4. Submit
5. ✅ Toast notification appears
6. ✅ Rumor in feed with "Voting in Progress" badge
7. Click 👍 → ✅ Toast: "Vote recorded! Your weight: √1.00"
8. Try voting again → ❌ Buttons disabled (no change)
```

### Test 3: Search & Filter
```
1. Post 3 rumors with different keywords
2. Type in search box → ✅ Feed filters in real-time
3. Click "Active" tab → ✅ Shows only active rumors
4. Click "All" → ✅ Shows everything
```

### Test 4: Auto-Resolution
```
1. Post rumor with 12h window
2. Vote on it (need 5+ unique voters for quorum)
3. Wait ~30s after window closes
4. ✅ Scheduler auto-resolves
5. ✅ Status changes to FACT/FALSE/UNVERIFIED
6. ✅ Karma updates in sidebar
```

### Test 5: P2P Sync
```
1. Open Tab A: http://localhost:3000
2. Open Tab B: http://localhost:3000 (new profile)
3. In Tab A: Post rumor
4. ✅ Tab B instantly shows new rumor (no refresh!)
5. In Tab B: Vote on rumor
6. ✅ Tab A sees vote count update (real-time .on())
```

### Test 6: Opposition
```
1. Create rumor + vote to FACT (need karma ~50+)
2. Click "Challenge Fact" (shield icon)
3. Enter reason: "This is incorrect because..."
4. Submit
5. ✅ Original rumor status → 'opposed'
6. ✅ New opposition window opens
7. Vote on opposition
8. Wait for resolution
9. ✅ Karma consequences apply correctly
```

---

## 🔧 Troubleshooting

### Issue 1: "Cannot find module gun"
**Error:**
```
Error: Cannot find module as expression is too dynamic
```

**Fix:**
```powershell
# Reinstall with correct flags
npm install gun@0.2020.1241 --save --legacy-peer-deps

# Clear Next.js cache
rm -rf .next

# Restart dev server
npm run dev
```

**Root Cause:** Gun uses dynamic imports that Next.js/Turbopack struggles with. The webpack config in `next.config.mjs` resolves this.

---

### Issue 2: Data Not Loading / Empty Feed
**Symptoms:**
- Feed shows "No rumors yet"
- Sidebar shows "Guest" or no karma
- Console errors about Gun

**Fix:**
```powershell
# 1. Check browser console for errors
#    Open DevTools → Console tab

# 2. Clear Gun's IndexedDB
#    DevTools → Application → Storage → Clear Site Data

# 3. Check Gun connection
#    Console should show: "Hello wonderful person! :) Thanks for using GUN..."

# 4. Verify sessionStorage
#    DevTools → Application → Session Storage → localhost:3000
#    Should see 'etherial_user' key after login

# 5. Test Gun directly in console:
const gun = Gun();
gun.get('test').put({hello: 'world'});
gun.get('test').on(data => console.log(data));
# Should log: {hello: 'world', _: {...}}
```

---

### Issue 3: Votes Not Counting
**Symptoms:**
- Click vote button → nothing happens
- No toast notification
- Console: "Vote rejected — window closed"

**Fix:**
```typescript
// Check rumor's windowClosesAt
const rumor = rumors.find(r => r.id === 'problematic_id');
console.log('Window closes:', new Date(rumor.windowClosesAt));
console.log('Current time:', new Date());

// If window closed, this is expected behavior
// Resolution scheduler will process it within 30 seconds
```

---

### Issue 4: Karma Not Updating
**Symptoms:**
- Voted on resolved rumor
- Karma stuck at 1.0

**Check:**
1. **Is rumor resolved?** Status must be 'fact' or 'false'
2. **Did scheduler run?** Check console for "Auto-resolved {rumorId}"
3. **Are you the poster?** Different karma rules apply
4. **Manual karma refresh:**
   ```typescript
   // In browser console
   gun.get('etherial').get('communities').get('nu.edu.pk')
      .get('users').get(yourPublicKey).get('karma').once(console.log);
   ```

---

### Issue 5: "Clock synchronization error"
**Error:**
```
Toast: "Clock synchronization error. Please check your system time."
```

**Fix:**
```powershell
# Windows: Sync system clock
w32tm /resync

# Check time settings
Settings → Time & Language → Date & Time → Sync now
```

**Root Cause:** Vote timestamp >5 seconds different from rumor's `createdAt`. System rejects vote to prevent time-based manipulation.

---

### Issue 6: "This fact has already been challenged"
**Error:**
Toast shows when trying to oppose a FACT

**Expected Behavior:**
- Spec enforces **one opposition per fact**
- Once an opposition fails, fact is **permanently locked**
- If you see this, someone already challenged it

**Check:**
```typescript
// Find the opposition
gun.get('etherial').get('communities').get('nu.edu.pk')
   .get('rumors').get(rumorId).once(r => {
     console.log('Opposition ID:', r.oppositionId);
     console.log('Opposition array:', r.oppositions);
   });
```

---

### Issue 7: TypeScript Errors in Build
**Check:**
```powershell
# Run type check
npx tsc --noEmit

# Should show zero errors
# If errors appear, check:
# - types/gun.d.ts exists
# - All imports use 'gun/gun' not 'gun'
```

---

## 📊 Performance & Limits

### Scalability
| Metric | Limit | Notes |
|--------|-------|-------|
| Peers per network | 100+ | WebRTC mesh scales to ~100 peers |
| Rumors per community | Unlimited | Limited by browser storage (~50MB IndexedDB) |
| Votes per rumor | Unlimited | Linear scan for resolution |
| Gun relay bandwidth | ~1-5 Mbps | Per peer (WebSocket overhead) |
| Initial sync time | ~2-5s | First load fetches all rumors |

### Browser Storage
- **IndexedDB**: Gun stores data here (~50MB typical limit)
- **sessionStorage**: Encrypted keypairs only (~10KB)
- **Clear old data**: Gun auto-GC after ~30 days (configurable)

---

## 🔐 Security Notes

### What's Secure
✅ Keypairs encrypted with passphrase (AES-GCM)  
✅ All votes/rumors cryptographically signed (ECDSA P-256)  
✅ No passwords stored (only encrypted keypairs)  
✅ Karma floor prevents negative manipulation  
✅ Clock skew validation prevents time attacks  

### What's NOT Secure (By Design)
⚠️ **Public by default** — All rumors visible to all peers  
⚠️ **No content moderation** — Ghosts require manual admin intervention  
⚠️ **Sybil attacks possible** — Creating 1000 accounts with karma 1.0 each = 1000 total weight (but expensive in `.edu` emails)  
⚠️ **Gun relay trust** — If you use public relays, they can log IP addresses  

---

## 🎯 Next Steps

1. **Run the app**: `npm run dev`
2. **Create account**: Use your real `.edu` email or test with `test@nu.edu.pk`
3. **Post a rumor**: Test the voting system
4. **Open second tab**: Watch P2P sync in action
5. **Wait for resolution**: See karma updates automatically

---

## 📞 Support

- **Gun Documentation**: https://gun.eco/docs/
- **Gun Chat**: http://chat.gun.eco
- **Etherial Issues**: Check console logs + this manual's troubleshooting section

---

**🎉 You're ready! Start the dev server and watch the P2P magic happen.**
