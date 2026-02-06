# ethereal - Dark & Mysterious Theme Update

## Overview

The application has been rebranded from **Etherial** to **ethereal** with a complete dark theme transformation featuring mysterious purples, deep blues, and ethereal cyans.

## Theme Updates

### Color Palette (Dark & Mysterious)

```
- ethereal-dark: #0f0f1e          (Deep background)
- ethereal-darker: #09090f        (Darker backgrounds)
- ethereal-purple: #6d28d9        (Primary brand color)
- ethereal-violet: #8b5cf6        (Accent purple)
- ethereal-indigo: #4f46e5        (Deep blue accent)
- ethereal-cyan: #06b6d4          (Bright cyan highlight)
- ethereal-slate: #1e293b         (Card backgrounds)
- ethereal-muted: #475569         (Muted text)
- slate-200/300/400: Text layers
```

### Component Updates

**Truth Meter**
- Voting progress: Ethereal indigo with cyan glow
- FACT: Emerald green (verified)
- FALSE: Rose red (disproven)
- UNVERIFIED: Amber orange (inconclusive)

**Opposition Modal**
- Dark slate background with purple borders
- Cyan headings for clarity
- Dark input fields with purple accents

**Main Dashboard**
- Dark background with cyan headers
- Purple action buttons
- Emerald/rose vote buttons (for TRUE/FALSE)

**Community Sidebar**
- Dark card styling with purple accents
- Cyan text for identifiers
- Indigo selection highlighting

## New Features Implemented

### Prompt A: Reputation Logic (`lib/reputation-logic.ts`)

**calculateReputationWeightedTrustScore()**
- Fetches all votes with weighted karma (√karma)
- Applies quorum check (5+ voters, weight ≥ 10)
- Calculates ratio: `W_true / (W_true + W_false)`
- Determines: FACT (≥0.60), FALSE (≤0.40), INCONCLUSIVE (0.40-0.60)
- Supports extended window for inconclusive votes

**applyAsymmetricKarmaUpdates()**
- Winners: +1.0 karma
- Losers: -1.5 karma
- False rumor poster: -2.0 karma

**fetchAndWeightVotes()**
- Iterates through all votes in GunDB
- Fetches voter karma and applies √ weighting
- Returns weighted vote data for calculation

### Prompt B: Opposition Engine (`lib/opposition-engine.ts`)

**createOppositionChallenge()**
- Checks karma threshold (minimum 50)
- Creates linked opposition node in GunDB
- Sets new voting window (1-2 days/24-48 hours)
- Returns success/failure with detailed messages

**resolveOppositionChallenge()**
- Calculates opposition trust score using reputation logic
- If opposition wins: Original FACT → FALSE, reward opposition voters
- If opposition loses: Applies -5.0 penalty to challenger
- Updates original rumor status

**ghostRumorWithCascade()**
- Marks rumor as status: 'ghost'
- Clears trust_score to 0
- Triggers cascade recalculation for dependent rumors
- Filters ghosts from feed automatically

**cascadeRecalculateOnGhost()**
- Finds all rumors referencing the ghosted rumor
- Recalculates trust scores for affected rumors
- Maintains data integrity across P2P network

**checkGhostStatus() & filterGhosts()**
- Identifies ghosted rumors and parent ghosts
- Provides feed filtering with cascade awareness

## Breaking Changes

### Naming
- App renamed: `Etherial` → `ethereal`
- All console logs updated to `[ethereal]`
- Metadata updated: `title: 'ethereal - Campus Truth Network'`

### Styling
- All vintage colors removed from components
- All classes updated to ethereal color system
- Responsive dark theme applied across entire UI

### Console Logging
- Changed from `[Etherial]` to `[ethereal]` prefix
- Affects: auth-modal, opposition-modal, all engine logs

## File Changes Summary

### Updated Components
1. `components/auth-modal.tsx` - Dark theme + Prompt A/B integration
2. `components/opposition-modal.tsx` - Dark styling + Opposition engine
3. `components/truth-meter.tsx` - Ethereal colors for status indicators
4. `components/rumor-card.tsx` - Full dark theme + Opposition modal
5. `components/community-sidebar.tsx` - Dark sidebar with ethereal accents

### New Libraries
1. `lib/reputation-logic.ts` (306 lines) - **Prompt A: Reputation Logic**
   - calculateReputationWeightedTrustScore()
   - applyAsymmetricKarmaUpdates()
   - fetchAndWeightVotes()
   - getRumorResolutionStatus()

2. `lib/opposition-engine.ts` (408 lines) - **Prompt B: Opposition & Ghost**
   - createOppositionChallenge()
   - resolveOppositionChallenge()
   - ghostRumorWithCascade()
   - cascadeRecalculateOnGhost()
   - checkGhostStatus()
   - filterGhosts()
   - getOppositionChallenges()

### Configuration Updates
1. `tailwind.config.ts` - Added ethereal color palette
2. `app/layout.tsx` - Updated metadata, viewport color
3. `app/globals.css` - Dark mode CSS variables
4. `app/page.tsx` - Dark theme styling

## Integration Points

### Opposition Modal Integration
The opposition modal now integrates directly with the `opposition-engine`:
```typescript
const result = await createOppositionChallenge(
  domain,
  originalRumorId,
  user.publicKey,
  `I oppose: ${originalRumorText}`,
  reason,
  durationHours,
  gun
);
```

### Reputation Logic Integration
The rumor resolution now uses reputation-weighted scoring:
```typescript
const result = await calculateReputationWeightedTrustScore(
  domain,
  rumorId,
  gun
);

// Apply karma updates based on result
await applyAsymmetricKarmaUpdates(
  domain,
  rumorId,
  result,
  gun
);
```

## Testing the Implementation

### Test 1: Reputation Logic
1. Create rumor and get 6+ votes with varied karma
2. Check that weight = √karma for each vote
3. Verify ratio calculation: `W_true / (W_true + W_false)`
4. Check status transitions (FACT/FALSE/INCONCLUSIVE)

### Test 2: Opposition Challenge
1. Create a FACT rumor (ratio ≥ 0.60)
2. Create opposition with user having ≥50 karma
3. Verify opposition voting window (1-2 days)
4. If opposition wins: Original FACT → FALSE
5. Check karma updates (winner +2.0, loser -5.0)

### Test 3: Ghost Cascade
1. Mark a rumor as ghost
2. Verify it's hidden from feed
3. Create rumors that reference it
4. Check that cascade recalculates dependent rumors

### Test 4: Dark Theme
1. Load application
2. Verify all components render with dark background
3. Check contrast ratios for accessibility
4. Test sidebar, cards, modals in dark mode

## Future Enhancements

- Add toast notifications for opposition success
- Implement reputation level badges (Novice, Trusted, Elder)
- Add karma history timeline
- Implement rumor categories/tags
- Add search functionality across rumors
- Create leaderboard of top truth-tellers

## Migration Notes

If upgrading from vintage theme:
1. All vintage color classes should be removed
2. Replace with ethereal color classes
3. Update any custom CSS using vintage colors
4. Test all modal and card components
5. Verify opposition workflow end-to-end
