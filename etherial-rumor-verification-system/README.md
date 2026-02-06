# Etherial: Decentralized Campus Rumor Verification

A P2P campus rumor verification system implementing Byzantine-resistant consensus with blind authentication, weighted voting, and decentralized reputation.

## Quick Links

- **Getting Started**: [QUICKSTART.md](./QUICKSTART.md) - Start here (2 minutes)
- **Full Documentation**: [ETHERIAL.md](./ETHERIAL.md) - Complete guide
- **System Architecture**: [ARCHITECTURE.md](./ARCHITECTURE.md) - Design & flows
- **Testing Guide**: [TESTING.md](./TESTING.md) - Test cases & verification
- **Implementation Details**: [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md)

## What's Etherial?

A decentralized platform where campus communities verify rumors through:

1. **Weighted Voting**: Each vote weighted by √(your karma) to prevent reputation farming
2. **Blind Consensus**: Vote counts hidden until voting window closes
3. **Asymmetric Karma**: Winners +1.0, losers -1.5, false posters -2.0
4. **Fair Resolution**: 
   - Need 5+ voters and minimum weight to resolve
   - Ratio ≥0.60 = FACT, ≤0.40 = FALSE, in-between = extend window once, then UNVERIFIED
5. **Opposition Challenges**: Contest any verified FACT if you have sufficient karma
6. **Domain Communities**: Segregated by university email domain, read-only cross-domain

## Key Innovations

### Blind Authentication
- Email + passphrase → deterministic keypair (Gun.SEA)
- **Email never stored** (cleared after key generation)
- Same credentials = same identity across sessions
- No central auth server

### √Karma Weighting (The Math)
```javascript
vote_weight = Math.sqrt(user_karma)

// Prevents karma farming
karma=1 → weight=1
karma=4 → weight=2
karma=9 → weight=3
karma=100 → weight=10 (not 100!)
```

### Resolution Engine (The Core)
```javascript
// 1. Quorum: ≥5 voters AND total_weight ≥ 10
// 2. Ratio: W_true / (W_true + W_false)
// 3. Threshold: ≥0.60=FACT, ≤0.40=FALSE, else extend
// 4. Freeze: trust_score immutable once resolved
```

### Ghost System
- Soft-delete with cascading recalculation
- Maintains referential integrity across P2P network
- Ghosts hidden from feed

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Database**: Gun.js P2P with SEA encryption
- **UI**: React 19 + Shadcn UI
- **Styling**: Tailwind CSS 4 + Vintage Paper design system
- **Type Safety**: TypeScript

## Project Structure

```
lib/
  ├─ gun-db.ts              # Database & types
  ├─ auth-service.ts        # Blind authentication
  ├─ user-context.tsx       # React state management
  ├─ rumor-engine.ts        # ⭐ Resolution algorithm (CRITICAL)
  ├─ ghost-system.ts        # Soft deletion & cascade
  ├─ timestamp-utils.ts     # Time sync & skew handling
  ├─ debug-monitor.ts       # Development logging
  └─ gun-config.ts          # Relay configuration

components/
  ├─ auth-modal.tsx         # Login dialog
  ├─ truth-meter.tsx        # Status visualization
  ├─ rumor-card.tsx         # Rumor display & voting
  ├─ opposition-modal.tsx   # Challenge interface
  └─ community-sidebar.tsx  # Domain selector & user stats

app/
  ├─ page.tsx               # Main dashboard
  ├─ layout.tsx             # Root with providers
  └─ globals.css            # Global styles

docs/
  ├─ QUICKSTART.md          # 2-minute start
  ├─ ETHERIAL.md            # Full feature guide
  ├─ ARCHITECTURE.md        # System design
  ├─ TESTING.md             # Test cases
  ├─ IMPLEMENTATION_SUMMARY.md
  └─ README.md              # This file
```

## Installation

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Open http://localhost:3000
```

## First Rumor in 2 Minutes

1. Open http://localhost:3000
2. Sign in: `alice@nu.edu.pk` / `password`
3. Click "Share a Rumor" → "The library is open 24/7" → 12h window
4. Open new incognito tab, sign in as `bob@nu.edu.pk`
5. Vote "Fact" or "False"
6. Watch Truth Meter update as votes come in

## Features

### Rumor System
- Post with 4 voting windows (12h, 24h, 2d, 5d)
- Blind voting (counts hidden until close)
- Real-time consensus visualization
- Auto-resolution based on algorithm

### Voting & Consensus
- **Quorum**: 5+ voters required
- **Weight**: √karma prevents farming
- **Ratio**: 0.60+ = FACT, 0.40- = FALSE
- **Extended**: Inconclusive gets 24h extension once
- **Frozen**: Score locks after resolution

### Opposition Challenges
- Challenge any FACT if karma ≥ 80% of avg voters
- New 24h or 2d voting window
- Win: +1.0 karma, Lose: -5.0 karma
- Overturns original verdict if successful

### Karma Economy
- **Start**: 1.0 karma
- **Vote with majority**: +1.0
- **Vote against**: -1.5
- **Post false rumor**: -2.0 (additional)
- **Win opposition**: +1.0
- **Lose opposition**: -5.0

### Community System
- 5+ known universities preconfigured
- Easy to add new domains
- Read-only access cross-domain
- Full voting access in own domain

### Privacy & Security
- Email never stored (deterministic keygen)
- Session-based state (not localStorage)
- Gun.SEA encryption for sensitive ops
- No central auth server
- P2P consensus (Byzantine-resistant)

## Configuration

### Custom Relay Servers

Edit `lib/gun-config.ts`:

```javascript
export const DEFAULT_RELAYS = [
  'https://your-relay-1.example.com/gun',
  'https://your-relay-2.example.com/gun',
];
```

### Add New University

Edit `components/community-sidebar.tsx`:

```javascript
const KNOWN_COMMUNITIES = {
  'your-domain.edu': 'Your University Name',
  // existing entries...
};
```

## API Reference

### Authentication
```typescript
// Sign in with email + passphrase
await useUser().login(email, passphrase)

// Get current user
const { user } = useUser()
// { publicKey, domain, karma, isAuthenticated }
```

### Rumors
```typescript
// Post rumor
getCommunityRumors(domain).get(rumorId).put(rumor)

// Vote on rumor
getRumorVotes(domain, rumorId).get(voteId).put(vote)

// Resolve rumor
const result = await resolveRumor(domain, rumorId, gun)
// { status: 'FACT'|'FALSE'|'UNVERIFIED'|'PENDING', ratio, ... }
```

### Karma
```typescript
// Get user karma
const karma = await getUserKarma(publicKey, domain, gun)

// Update karma
await updateUserKarma(publicKey, domain, change, gun)
```

### Opposition
```typescript
// Create challenge
await createOppositionChallenge(domain, rumorId, challengerId, window, gun)
```

## Testing

Run test scenarios from [TESTING.md](./TESTING.md):

```bash
# Test 1: FACT resolution
npm run dev
# See TESTING.md → Test 1 for detailed steps

# Test 2: √Karma weighting
# Create users with different karma (1, 4, 9)
# Verify weight calculations match sqrt formula

# Full checklist in TESTING.md
```

## Architecture Overview

```
Browser (P2P Node)
    ↓
Gun.js Library
    ↓
Gun.SEA (Encryption)
    ↓
Public Relay Peers (Persistence)
    ↓ P2P Sync ↓
Multiple Users ← Consensus Algorithm
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed flows.

## Performance

- Load 50 rumors: ~200ms
- Vote submission: <100ms
- Resolution calculation: ~50ms
- Memory per user: <1MB

See [ARCHITECTURE.md](./ARCHITECTURE.md#performance-characteristics) for detailed analysis.

## Known Limitations

1. **Clock Skew**: Assumes peers within 5 seconds
2. **Relay Dependence**: Data persists on public relays only
3. **Vote Finality**: Votes counted as they arrive (race conditions near window close)
4. **Storage**: Unlimited growth (consider archiving old rumors)

## Future Enhancements

- Decentralized moderation (reputation-weighted)
- Rumor categories and tags
- Evidence voting (cite sources)
- Prediction market for pre-vote
- Mobile app (React Native)
- Self-hosted relay setup
- Bandwidth optimization

## Troubleshooting

**Q: Votes not appearing?**
A: Gun.js P2P sync may take 2-3 seconds. Refresh page.

**Q: Wrong karma value?**
A: Async updates. Use `__etherealDebug.getLogs()` to check.

**Q: Can't post in other domain?**
A: By design - read-only mode for cross-domain. Sign in with your domain.

**Q: Gun relay offline?**
A: Data cached locally. Syncs when relay reconnects.

See full [ETHERIAL.md](./ETHERIAL.md#troubleshooting) troubleshooting guide.

## Debug Mode

```javascript
// Browser console
__etherealDebug.getLogs()           // All logs
__etherealDebug.getLogs('ERROR')    // Errors only
__etherealDebug.exportLogs()        // JSON export
```

## Contributing

This is a hackathon submission. For improvements:

1. Read [ARCHITECTURE.md](./ARCHITECTURE.md)
2. Check [TESTING.md](./TESTING.md) for test cases
3. Review `lib/rumor-engine.ts` for algorithm
4. Test with scenarios from [TESTING.md](./TESTING.md)

## License

Built for hackathon submission. Use at your own risk.

## Acknowledgments

- Gun.js for P2P database
- Shadcn UI for component library
- Next.js for framework
- Byzantine consensus research

---

**Start Here**: [QUICKSTART.md](./QUICKSTART.md)

**Questions?** Check the relevant documentation:
- How do I use it? → [ETHERIAL.md](./ETHERIAL.md)
- How does it work? → [ARCHITECTURE.md](./ARCHITECTURE.md)
- Does it work? → [TESTING.md](./TESTING.md)

**Last Updated**: February 2026
