# Etherial: Decentralized Campus Rumor Verification System

A P2P campus rumor verification platform built with Next.js, Gun.js, and cryptographic identity management.

## Features

### Core Verification Engine
- **Quorum-Based Resolution**: Rumors resolve only with 5+ voters and minimum weight threshold
- **√Karma Weighted Voting**: Vote weight = √(user's karma), preventing reputation farming
- **Asymmetric Karma Updates**: 
  - Winners: +1.0 karma
  - Losers: -1.5 karma
  - False rumor posters: -2.0 karma
- **Extended Window Logic**: Inconclusive rumors get 24-hour extended window, then marked UNVERIFIED
- **Trust Score Freezing**: Resolved rumors freeze their ratio to prevent retroactive changes

### Opposition & Challenges
- Challenge verified facts if you believe they're wrong
- New voting window (24h or 2d) to re-evaluate
- Karma threshold check: must have 80%+ average challenger karma
- Lose 5.0 karma if opposition fails

### Ghost System
- Soft delete rumors with cascading recalculation
- Affected rumors referencing ghosted rumors are automatically recalculated
- Maintains data integrity across P2P network

### Domain-Based Communities
- Automatic community segregation by university domain
- Users can view all communities but write only in their own domain
- Domain extraction from university email (e.g., @nu.edu.pk)

### Blind Authentication
- Email-based deterministic keypair generation (with passphrase)
- **Email never stored** - only public key and domain retained
- Session-based identity (sessionStorage)
- Same email + passphrase = same identity across sessions

## Architecture

### Database Structure (Gun.js)
```
communities/
  {domain}/
    rumors/
      {rumorId}/
        - text, posterPublicKey, domain, status
        - trust_score, weighted_true, weighted_false
        - votes/{voteId}
        - oppositions[]
    users/
      {publicKey}/
        - karma, domain, createdAt
```

### Key Components
- **TruthMeter**: Visual progress bar showing rumor consensus
- **RumorCard**: Display rumor with voting UI and opposition button
- **CommunitySidebar**: Domain switcher, user karma display
- **AuthModal**: Blind authentication (email + passphrase)
- **OppositionModal**: Challenge interface with karma threshold check

### Libraries
- **Gun.js**: P2P database with SEA encryption
- **Next.js 16**: React framework with App Router
- **Tailwind CSS**: Vintage paper design system
- **Shadcn UI**: Component library with custom styling

## Setup Instructions

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Setup
No environment variables required for development. Gun.js connects to public relays automatically:
- `https://gun-manhattan.herokuapp.com/gun`
- `https://relay.gun.mvp.store/gun`

### 3. Run Development Server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### 4. Test Authentication
- Use any university email (e.g., `test@nu.edu.pk`)
- Use any 4+ character passphrase
- Same credentials will restore your identity (karma, votes, etc.)

## Usage

### Posting a Rumor
1. Click "Share a Rumor"
2. Enter claim (max 500 chars)
3. Select voting window (12h, 24h, 2d, 5d)
4. Rumor posts to your community

### Voting
1. Each rumor shows vote buttons during voting window
2. Vote weight = √(your karma) 
3. Votes are blind until window closes
4. Cannot revote on same rumor

### Resolution Process
1. **Quorum Check**: Need 5+ voters, minimum weight ≥ 10
2. **Ratio Calculation**: W_true / (W_true + W_false)
   - Ratio ≥ 0.60 → **FACT**
   - Ratio ≤ 0.40 → **FALSE**
   - 0.40 < Ratio < 0.60 → Extended window → **UNVERIFIED**
3. **Frozen Locked**: trust_score and status frozen in Gun

### Challenging a Fact
1. Click "Challenge Fact" on verified claims
2. Check karma threshold (need 80% of avg voter karma)
3. Explain why it's false (max 300 chars)
4. Select new voting window (24h or 2d)
5. New vote happens, winner determined, loser loses 5.0 karma

### Cross-Campus Access
- **Own domain**: Can post, vote, oppose
- **Other domain**: Read-only mode (view rumors but can't participate)
- Useful for sharing info across campus boundaries

## Critical Implementation Details

### Weighted Voting (Hackathon Critical)
```javascript
// Vote weight calculation - MUST use sqrt
const weight = Math.sqrt(user_karma);
// Example: karma=4 → weight=2, karma=9 → weight=3
```

### Resolution Engine
```javascript
// Ratio calculation
ratio = weighted_true / (weighted_true + weighted_false)

// Decision tree
if (ratio >= 0.60) → FACT
else if (ratio <= 0.40) → FALSE
else if (!extendedOnce) → extend window 24h
else → UNVERIFIED
```

### Asymmetric Karma
```javascript
// Winners voted with majority
if (vote === majority) karma += 1.0

// Losers voted against majority
if (vote !== majority) karma -= 1.5

// Special penalty
if (postedFalseRumor) karma -= 2.0
```

## Performance Optimization

### Rumor Feed
- Filters out ghost rumors automatically
- Lazy loads from Gun nodes
- Auto-resolves expired voting windows
- Caches karma values in context

### Vote Recording
- Async vote submission prevents UI blocking
- Concurrent vote handling with timestamp tiebreaker
- Deduplication by (rumorId, voterId) pair

### P2P Sync
- Gun relays ensure persistence when offline
- SessionStorage for quick auth restore
- Timeout on Gun queries (3 seconds max)

## Debug Mode

In development, access debug logs:
```javascript
// In browser console
__etherealDebug.getLogs()
__etherealDebug.exportLogs()
__etherealDebug.logResolution(rumorId, status, ratio, voters)
```

## Testing Checklist

- [x] Email cleared after auth (never in Gun or localStorage)
- [x] Same credentials restore identity across sessions
- [x] Rumor resolution respects √karma weighting
- [x] Asymmetric karma updates applied correctly
- [x] Ghost rumors hidden from feed
- [x] Cascade recalculation on ghost creation
- [x] Opposition requires karma threshold
- [x] Domain access control working
- [x] Vote blind-folding until window closes
- [x] Extended window applied once
- [ ] P2P sync tested across multiple peers
- [ ] Clock skew tolerance verified
- [ ] Network disconnection handling

## Known Limitations

1. **Local Testing**: Gun.js P2P sync works but requires relay nodes for persistence
2. **Clock Skew**: Assumes peers within 5 seconds of each other
3. **Vote Race Conditions**: Concurrent votes at millisecond precision handled via tiebreaker hash
4. **Data Durability**: Depends on public Gun relays (consider self-hosted for production)

## Future Enhancements

- Decentralized reputation recovery (lost keys)
- Weighted opposition costs based on voter count
- Rumor category tags for organization
- Historical fact archives
- Peer discovery protocol
- Bandwidth optimization

## License

Built for hackathon submission. Use at your own risk.
