# Etherial Development Quick Start

## Starting the Application

### Option 1: Start Everything (Recommended)
```bash
npm run dev
```
This starts **both** the Gun relay server and Next.js dev server concurrently.

- **Relay**: http://localhost:8765/gun
- **Next.js**: http://localhost:3000 (or 3001 if 3000 is busy)

### Option 2: Start Services Separately
```bash
# Terminal 1 — Start relay
npm run relay

# Terminal 2 — Start Next.js
npm run dev:next
```

## Troubleshooting

### "Port already in use" errors?
Run the cleanup script to kill existing dev servers:

**Windows (PowerShell):**
```powershell
.\kill-dev.ps1
```

**Manual cleanup:**
```bash
# Kill processes on port 8765 (relay)
npx kill-port 8765

# Kill processes on port 3000/3001 (Next.js)
npx kill-port 3000 3001

# Remove Next.js lock file
rm -rf .next/dev
```

## Testing Database & Relay

Run the comprehensive stress test:
```bash
npm run test:db
```

This tests:
- ✅ Relay connectivity
- ✅ Cross-process sync (simulating different browser tabs)
- ✅ SEA crypto (sign, verify, encrypt, decrypt)
- ✅ Nested graph structures (rumor + votes)
- ✅ `.map()` enumeration
- ✅ Bidirectional sync

## Architecture

### Data Flow
```
Browser Tab A  ━━━━━┓
                     ┃
Browser Tab B  ━━━━━╋━━━━> Gun Relay (port 8765) ━━━━> Disk (.gun-data/)
                     ┃
Browser Tab C  ━━━━━┛
```

All browser tabs sync through the relay in real-time via WebSockets. The relay persists data to `.gun-data/` so it survives restarts.

### Why We Need the Relay

Without the relay (`DEFAULT_RELAYS = []`), each browser tab stores data **only** in its own IndexedDB — there's no WebSocket bridge between tabs. The relay acts as a P2P hub:

- **With relay**: Data written in Tab A instantly appears in Tab B, C, etc.
- **Without relay**: Each tab has isolated data that never syncs

### Configuration

**Relay peers** are configured in [`lib/gun-config.ts`](lib/gun-config.ts):

```typescript
export const DEFAULT_RELAYS: string[] = [
  'http://localhost:8765/gun',  // Local relay
];
```

For production, add your own relay server:
```typescript
export const DEFAULT_RELAYS: string[] = [
  'https://your-relay.example.com/gun',
  'http://localhost:8765/gun',  // Fallback for local dev
];
```

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start relay + Next.js together (recommended) |
| `npm run dev:next` | Start only Next.js (port 3000) |
| `npm run relay` | Start only Gun relay (port 8765) |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run test:db` | Run database stress tests |
| `npm run lint` | Run ESLint |

## Health Checks

**Relay status:**
```bash
curl http://localhost:8765/health
# Output: {"status":"ok","uptime":42.5}
```

**Browser console (F12):**
Look for these startup logs:
```
[Etherial] 🔧 Gun peers: ["http://localhost:8765/gun"]
[Etherial] ✅ Gun write OK
[Etherial] ✅ Gun read OK — DB is operational
[Etherial] ✅ Relay connected (uptime: 42s)
```

If you see:
- ❌ "Relay unreachable" → Start the relay with `npm run relay`
- ⚠️ "No relay peers configured" → Check `lib/gun-config.ts`

## Cross-Browser Sync Testing

1. Open http://localhost:3000 in **Chrome**
2. Open http://localhost:3000 in **Firefox** (or another Chrome tab)
3. Login with the same email domain in both (e.g., `alice@nu.edu.pk`)
4. Post a rumor in Chrome → Should appear instantly in Firefox
5. Vote in Firefox → Vote should sync to Chrome in real-time

If data doesn't sync:
1. Check relay is running: `curl http://localhost:8765/health`
2. Check browser console for Gun connection logs (F12)
3. Run `npm run test:db` to verify relay functionality

## Project Structure

```
etherial-rumor-verification-system/
├── relay.js              # Gun relay server (WebSocket hub)
├── stress-test.js        # Database & sync tests
├── kill-dev.ps1          # Cleanup script (Windows)
├── lib/
│   ├── gun-config.ts     # Relay URLs & communities
│   ├── gun-db.ts         # Gun initialization & types
│   ├── auth-service.ts   # SEA crypto & blind auth
│   ├── rumor-engine.ts   # Rumor lifecycle & resolution
│   └── reputation-logic.ts  # Karma & trust scores
├── app/
│   └── page.tsx          # Main dashboard with rumor feed
└── components/
    ├── rumor-card.tsx    # Rumor display & voting
    └── auth-modal.tsx    # Login/signup modal
```

## Notes

- The relay gracefully handles duplicate starts (exits if port 8765 is already in use)
- Next.js runs in webpack mode (not Turbopack) for Gun compatibility
- All Gun writes use Gun-safe primitives (no JS arrays in `.put()`)
- Gun needs ~2s after init to establish WebSocket connections — this is naturally handled in browser page load time
