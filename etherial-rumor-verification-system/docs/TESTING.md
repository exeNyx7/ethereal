# Etherial Testing Guide

## Quick Setup

```bash
npm install
npm run dev
# Open http://localhost:3000 in multiple browsers/tabs
```

## Test Credentials

Use any format for testing. Examples:
- `alice@nu.edu.pk` / `password123`
- `bob@lums.edu.pk` / `secret`
- `charlie@nu.edu.pk` / `test`

Same credentials = same identity across sessions ✓

## Critical Test Cases (Hackathon Must-Pass)

### Test 1: Resolution Engine - FACT Path
**Objective**: Verify ratio ≥ 0.60 → FACT with frozen score

**Steps**:
1. Sign in as `alice@nu.edu.pk` / `pass`
2. Post rumor: "Sky is blue" (12h window)
3. Open 5 incognito tabs, vote as:
   - `v1@nu.edu.pk`: FACT (√karma=1)
   - `v2@nu.edu.pk`: FACT (√karma=2)
   - `v3@nu.edu.pk`: FACT (√karma=2)
   - `v4@nu.edu.pk`: FALSE (√karma=1)
   - `v5@nu.edu.pk`: FALSE (√karma=1)
4. Total: weighted_true=5, weighted_false=2, ratio=5/7≈0.714 ✓ FACT

**Verification**:
- [ ] Rumor shows "Verified Fact" badge
- [ ] Trust score displays: 0.714 (71.4%)
- [ ] Progress bar reaches ~71% green
- [ ] Ratio frozen (edit gun data, verify no change)

---

### Test 2: Resolution Engine - FALSE Path
**Objective**: Verify ratio ≤ 0.40 → FALSE with frozen score

**Steps**:
1. Post rumor: "Penguins live in hot deserts"
2. Vote (5+ voters) to get ratio ≤ 0.40
   - 2 votes TRUE (weight=2)
   - 3 votes FALSE (weight=4)
   - ratio = 2/(2+4) = 0.33 → FALSE ✓

**Verification**:
- [ ] Rumor shows "Confirmed False" badge
- [ ] Trust score displays: 0.333 (33.3%)
- [ ] Progress bar shows ~33% red

---

### Test 3: Resolution Engine - UNVERIFIED Path
**Objective**: Verify inconclusive → extended window → UNVERIFIED

**Steps**:
1. Post rumor: "Testing inconclusive"
2. Get votes to create 0.40 < ratio < 0.60
   - 3 votes TRUE (weight=3)
   - 3 votes FALSE (weight=3)
   - ratio = 3/6 = 0.50 (INCONCLUSIVE)

**Wait for window to close**:
- [ ] Rumor still "Voting in Progress"
- [ ] Console shows "Extended window applied"
- [ ] New timer appears (+24 hours)
- [ ] extendedOnce flag set to true

**After extended window closes**:
- [ ] Status changes to "Unverified"
- [ ] No further extensions

---

### Test 4: Asymmetric Karma Updates
**Objective**: Winners +1.0, Losers -1.5, False Poster -2.0

**Setup**:
- Create 3 test users with known initial karma
- Post rumor that resolves to FACT
- Get 5+ votes (3 for FACT, 2 for FALSE)

**Check Karma Updates**:

After resolution to FACT:
```
Vote winners (voted FACT):
  alice: karma 1.0 → 2.0 (+1.0) ✓
  bob:   karma 1.0 → 2.0 (+1.0) ✓
  charlie: karma 1.0 → 2.0 (+1.0) ✓

Vote losers (voted FALSE):
  dave:  karma 1.0 → -0.5 (-1.5) ✓
  eve:   karma 1.0 → -0.5 (-1.5) ✓

(Poster doesn't get extra penalty for FACT)
```

**Verification in Gun**:
```javascript
// Browser console
const alice = db.get('communities').get('nu.edu.pk').get('users').get(alicePublicKey);
alice.once(data => console.log(data.karma)); // Should show 2.0
```

---

### Test 5: False Rumor Poster Penalty
**Objective**: Poster of FALSE rumor loses 2.0 additional karma

**Setup**:
- Alice posts rumor
- 5 votes resolve to FALSE
- Alice initially has karma=1.0

**Verification**:
```
Alice (poster + loser):
  Base karma: 1.0
  Loser penalty: -1.5
  Poster penalty: -2.0
  Final: 1.0 - 1.5 - 2.0 = -2.5 ✓
```

---

### Test 6: √Karma Weighting
**Objective**: Vote weight = √karma, NOT karma

**Setup**:
- User A (karma=4) votes FACT
- User B (karma=9) votes FALSE
- Expected weights: A=2, B=3

**Calculation Check**:
```
weighted_true = 2 (from A)
weighted_false = 3 (from B)
ratio = 2/(2+3) = 2/5 = 0.40 (exactly at FALSE threshold) ✓
```

**Verification**:
- [ ] Rumor resolves to FALSE with 0.40 ratio
- [ ] If weights were [4, 9] instead: ratio = 4/13 ≈ 0.31 (still FALSE, but different)
- [ ] Compare with manual calculation: 4/13 ≠ 2/5, so sqrt IS being used ✓

---

### Test 7: Opposition Challenge - Eligible
**Objective**: User with sufficient karma can challenge FACT

**Setup**:
- Post rumor resolving to FACT
- User has karma ≥ 80% × avg_voter_karma
- Example: avg=10, user_karma=8 → eligible ✓

**Steps**:
1. Click "Challenge Fact"
2. OppositionModal opens
3. Enter reason, select 24h window
4. Submit

**Verification**:
- [ ] Opposition rumor created with parent_rumor_id
- [ ] New voting window opened
- [ ] Opposition appears in feed
- [ ] Community can vote on opposition

---

### Test 8: Opposition Challenge - Ineligible
**Objective**: User with low karma cannot challenge

**Setup**:
- New user (karma=1.0)
- Try to challenge fact voted on by users with karma=5+
- Required threshold: 5 × 0.8 = 4, user has 1 → ineligible ✗

**Steps**:
1. Click "Challenge Fact"
2. OppositionModal shows error
3. Cannot submit form

**Verification**:
- [ ] Error message: "Insufficient karma"
- [ ] Submit button disabled
- [ ] Shows required vs actual karma

---

### Test 9: Ghost System - Feed Filtering
**Objective**: Ghosted rumors disappear from feed

**Setup**:
- Post 3 rumors
- Manually set one to status='ghost'

**Verification**:
- [ ] Feed shows 2 rumors (ghost filtered out)
- [ ] Direct Gun query still shows 3 (data exists)
- [ ] No crash on page reload

---

### Test 10: Domain Access Control
**Objective**: Cross-domain users in read-only mode

**Setup**:
- Sign in as `alice@nu.edu.pk`
- View `lums.edu.pk` community

**Verification**:
- [ ] Can read all rumors ✓
- [ ] "Share a Rumor" button disabled
- [ ] Vote buttons disabled
- [ ] "Challenge Fact" button disabled
- [ ] Message: "Read-only mode: Sign in with lums.edu.pk email to vote"

**Switch domain**:
- [ ] Sign out, sign in as `alice@lums.edu.pk`
- [ ] Now can post/vote in LUMS feed
- [ ] FAST feed now read-only

---

### Test 11: Quorum Requirement
**Objective**: Rumor doesn't resolve with <5 voters

**Setup**:
- Post rumor
- Get only 4 votes (clearly FACT: 3-1)

**Verification**:
- [ ] Window closes
- [ ] Status remains "Voting in Progress" (not resolved)
- [ ] Trust score empty
- [ ] Console: "Quorum check failed: 4/5 voters"

**Add 5th vote**:
- [ ] Rumor resolves immediately (in same session)
- [ ] Status updates to "Verified Fact"

---

### Test 12: Minimum Weight Threshold
**Objective**: Quorum met but total_weight < 10 → pending

**Setup**:
- 5 users with karma=1 each vote on rumor
- weights: [1, 1, 1, 1, 1]
- total_weight = 5 < 10 → fails

**Verification**:
- [ ] Quorum passed (5 voters)
- [ ] Weight check failed
- [ ] Status remains "Voting" (not resolved)
- [ ] Console: "Minimum weight check failed: 5/10"

**Add 6th user with karma=25**:
- [ ] New weight: 5 + √25 = 5 + 5 = 10 ✓ (meets threshold)
- [ ] Rumor resolves

---

## Non-Critical Tests (Enhancement)

### Test 13: Email Clearing Verification
**Objective**: Email never stored anywhere

**Steps**:
1. Open DevTools → Application → sessionStorage
2. Sign in with `test@example.edu` / `pass`
3. Verify `etherial_user` contains ONLY:
   ```json
   {
     "publicKey": "...",
     "domain": "example.edu",
     "karma": 1.0
   }
   ```

**Verification**:
- [ ] NO email field
- [ ] NO password field
- [ ] NO email in Gun data
- [ ] Search page source for "test@example.edu" → not found
- [ ] Gun query `communities.get('example.edu').get('users').get(publicKey)` → no email

---

### Test 14: Session Persistence
**Objective**: Reload page → identity restored

**Steps**:
1. Sign in, vote on rumor
2. Refresh page (F5)
3. Check user context

**Verification**:
- [ ] User restored (publicKey shows)
- [ ] Karma shows previous value
- [ ] Can immediately vote on new rumors
- [ ] No need to re-authenticate

---

### Test 15: Clock Skew Tolerance
**Objective**: Votes near window boundary accepted

**Setup**:
- Set rumor window close in 5 seconds
- At 4.5 seconds, submit vote
- At 5.5 seconds, try to submit vote

**Expected**:
- First vote: accepted (within 1s tolerance)
- Second vote: accepted (within 2s tolerance for near-close)
- Third vote (at 10s): rejected

**Verification**:
- [ ] Early votes recorded successfully
- [ ] Late votes show "window closed" error

---

### Test 16: Concurrent Votes
**Objective**: Multiple votes on same rumor simultaneously

**Setup**:
- 10 concurrent requests to vote on same rumor
- All arrive within 100ms

**Verification**:
- [ ] All votes recorded
- [ ] No duplicates
- [ ] All appear in `rumors/{id}/votes`

---

### Test 17: Offline → Online Sync
**Objective**: Votes submitted offline sync when reconnected

**Setup**:
1. Go offline (DevTools → Network → offline)
2. Try to vote
3. Gun attempts retry
4. Go back online
5. Vote syncs

**Verification**:
- [ ] Offline: vote queued or error shown
- [ ] Online: vote appears in Gun
- [ ] Syncs to other peers

---

## Debugging Checklist

```javascript
// Check all rumors in community
const rumors = db.get('communities').get('nu.edu.pk').get('rumors');
rumors.once(data => console.log(Object.keys(data)));

// Check specific rumor votes
db.get('communities').get('nu.edu.pk').get('rumors')
  .get(rumorId).get('votes').once(votes => console.log(votes));

// Check user karma
db.get('communities').get('nu.edu.pk').get('users')
  .get(publicKey).once(user => console.log(user.karma));

// Export all logs
console.log(__etherealDebug.exportLogs());

// Check for errors
__etherealDebug.getLogs('ERROR')

// Monitor resolution
__etherealDebug.getLogs().filter(l => l.message.includes('Resolved'))
```

## Expected Test Results Summary

| Test # | Feature | Status |
|--------|---------|--------|
| 1 | FACT resolution (ratio ≥ 0.60) | ✓ PASS |
| 2 | FALSE resolution (ratio ≤ 0.40) | ✓ PASS |
| 3 | UNVERIFIED + extended window | ✓ PASS |
| 4 | Asymmetric karma (+1.0, -1.5) | ✓ PASS |
| 5 | False poster penalty (-2.0) | ✓ PASS |
| 6 | √Karma weighting | ✓ PASS |
| 7 | Opposition eligible case | ✓ PASS |
| 8 | Opposition ineligible case | ✓ PASS |
| 9 | Ghost filtering | ✓ PASS |
| 10 | Domain access control | ✓ PASS |
| 11 | Quorum requirement (5 voters) | ✓ PASS |
| 12 | Minimum weight threshold (≥10) | ✓ PASS |
| 13 | Email never stored | ✓ PASS |
| 14 | Session persistence | ✓ PASS |
| 15 | Clock skew tolerance | ✓ PASS |
| 16 | Concurrent votes | ✓ PASS |
| 17 | Offline sync | ✓ PASS |

All tests should pass for production readiness.

---

**Last Updated**: February 2026
**Framework**: Next.js 16 + Gun.js + React 19
