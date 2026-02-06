# Etherial - Quick Start Guide

## 30 Seconds to Running

```bash
npm install
npm run dev
# Open http://localhost:3000
```

## 2 Minutes to First Rumor

1. **Sign In**
   - Email: `test@nu.edu.pk` (any format works)
   - Passphrase: `anything` (4+ chars)
   - Click "Access Community"

2. **Post a Rumor**
   - Click "Share a Rumor"
   - Type: "The library stays open 24/7"
   - Window: 12 hours
   - Click "Post Rumor"

3. **Vote**
   - Open new browser tab/incognito
   - Sign in as different person: `voter@nu.edu.pk`
   - Click the Fact or False button
   - Watch Truth Meter update

4. **See Results**
   - Wait for 12h window (or skip for demo)
   - Status shows "Verified Fact" or "Confirmed False"
   - You earn/lose karma based on vote

## Key Features

### Voting
- Each vote weighted by your karma (weight = √karma)
- Blind voting (counts hidden until window closes)
- Rumor needs 5+ votes to resolve
- Total weight must be ≥10

### Karma System
- Start with 1.0 karma
- Vote with majority: +1.0
- Vote against majority: -1.5
- Post false rumor: -2.0 extra

### Challenges
- Click "Challenge Fact" on verified rumors
- Need 80% of average voter karma
- Opens new voting window
- If you lose: -5.0 karma

### Communities
- Sidebar shows all university domains
- Read-only in other domains
- Full access in your own domain
- Email domain determines community

## Real Test Data

To properly test the consensus algorithm:

**Scenario: Testing ratio = 0.60 threshold**
```
Vote with different karma users:
User A (karma=1): FACT → weight=1
User B (karma=4): FACT → weight=2
User C (karma=4): FACT → weight=2
User D (karma=9): FALSE → weight=3
User E (karma=4): FALSE → weight=2

Result:
weighted_true = 1+2+2 = 5
weighted_false = 3+2 = 5
ratio = 5/10 = 0.50

0.40 < 0.50 < 0.60 = INCONCLUSIVE
→ Extended window added (24 hours)
```

## Common Questions

**Q: Is my email stored?**
A: No. Email generates your keypair (email + passphrase), then is cleared. Never stored.

**Q: Same email every session?**
A: Yes! Same email + passphrase = same identity. Your karma persists.

**Q: How does Gun.js work without a server?**
A: Peer-to-peer. Your browser syncs with relay servers that persist data.

**Q: Can I vote multiple times?**
A: No. One vote per person per rumor. Enforced client-side.

**Q: What happens if I'm offline?**
A: Gun caches data. Syncs when you reconnect to relays.

**Q: How do I see debug logs?**
A: Open browser console, type: `__etherealDebug.getLogs()`

## Test Checklist

- [ ] Can sign in with any email
- [ ] Can post a rumor
- [ ] Can see other users' votes
- [ ] Rumor resolves after voting window
- [ ] Status shows FACT/FALSE/UNVERIFIED
- [ ] Can challenge a fact
- [ ] Karma updates correctly
- [ ] Can switch to different community
- [ ] Other communities are read-only
- [ ] Page refresh keeps you logged in

## File Structure Overview

```
lib/
  ├─ gun-db.ts              (Database setup)
  ├─ auth-service.ts        (Blind authentication)
  ├─ rumor-engine.ts        (Resolution algorithm) ⭐
  ├─ ghost-system.ts        (Soft deletion)
  ├─ user-context.tsx       (React state)
  ├─ timestamp-utils.ts     (Time handling)
  └─ debug-monitor.ts       (Debug logging)

components/
  ├─ auth-modal.tsx         (Login UI)
  ├─ truth-meter.tsx        (Status display)
  ├─ rumor-card.tsx         (Rumor UI)
  ├─ opposition-modal.tsx   (Challenge UI)
  └─ community-sidebar.tsx  (Navigation)

app/
  ├─ page.tsx               (Main dashboard)
  └─ layout.tsx             (Root layout)

Documentation/
  ├─ ETHERIAL.md           (Full guide)
  ├─ ARCHITECTURE.md       (System design)
  ├─ TESTING.md            (Test cases)
  ├─ QUICKSTART.md         (This file)
  └─ IMPLEMENTATION_SUMMARY.md
```

## Under the Hood

### Resolution Algorithm (The Core)

```javascript
// 1. Quorum Check
if (voters < 5) return PENDING
if (total_weight < 10) return PENDING

// 2. Calculate Ratio
ratio = weighted_true / (weighted_true + weighted_false)

// 3. Decide
if (ratio >= 0.60) return FACT ✓
if (ratio <= 0.40) return FALSE ✓
if (0.40 < ratio < 0.60) {
  if (extended_once) return UNVERIFIED ✓
  else extend_window_24h() ✓
}

// 4. Freeze Score
trust_score = ratio (immutable)
```

### Weighted Voting (The Trick)

```javascript
// Vote weight = SQUARE ROOT of karma
// Prevents high-karma users from dominating

karma=1  → weight=1.0
karma=4  → weight=2.0
karma=9  → weight=3.0
karma=16 → weight=4.0

// Compare: linear would be 1, 4, 9, 16
// Square root is: 1, 2, 3, 4 (much fairer)
```

### Karma Economy

```
Starting: 1.0
Per vote win: +1.0
Per vote loss: -1.5
False rumor: -2.0 extra
Challenge win: +1.0
Challenge loss: -5.0

Examples:
Vote right 3 times: 1 + 3 = 4.0
Vote wrong 3 times: 1 - 4.5 = -3.5 (floor at 0)
Post false: -2.0 + -1.5 = -3.5 (losers also penalized)
```

## Next Steps

1. **Play with it**: Post rumors, vote, see consensus work
2. **Test the edge cases**: See what Test 11-17 in TESTING.md cover
3. **Read ARCHITECTURE.md**: Understand the full system
4. **Review rumor-engine.ts**: See the exact algorithm
5. **Deploy your own relay**: See gun-config.ts for setup

## Troubleshooting

**"Gun not connecting"**
- Check network tab for relay requests
- Relays may be slow but will eventually sync
- Development mode uses public relays (fine for testing)

**"Vote not recorded"**
- Refresh page to see latest state
- Check browser console for errors
- Votes async (take a moment to appear)

**"Wrong karma value"**
- Refresh page
- Use `__etherealDebug.getLogs()` to see updates
- Karma syncs from Gun, may have latency

**"Can't vote"**
- Window closed? Check time remaining
- Already voted? Different user/email needed
- Wrong domain? Only own domain can vote

## Success Criteria (for Hackathon)

✓ Rumor posts successfully
✓ Multiple users can vote
✓ Truth Meter shows consensus
✓ Rumor resolves correctly (FACT/FALSE/UNVERIFIED)
✓ Karma updates asymmetrically
✓ Opposition challenges work
✓ Cross-domain access control works
✓ Email never stored
✓ √Karma weighting correct
✓ Quorum/weight requirements enforced

## Contact

Issues? Check:
1. Browser console (F12 → Console)
2. `__etherealDebug.getLogs()`
3. TESTING.md for test cases
4. ARCHITECTURE.md for system overview

---

**Built for Hackathon**
Decentralized. P2P. Byzantine-resistant. Fair.

Good luck! 🚀
