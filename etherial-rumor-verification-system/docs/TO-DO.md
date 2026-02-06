# ETHERIAL — TO-DO

> Master task list derived from `fada-ethereal.md` specification.
> Each task maps to a specific MD requirement. Mark complete only when code fully matches spec.

---

## Phase 0 — Tracking & Housekeeping

- [x] Create `TO-DO.md` with all tasks organized by system
- [x] Create `PROGRESS.md` with status table
- [x] Consolidate `gun-config.ts` into `gun-db.ts` — single source of truth for relay URLs
- [x] Remove duplicate `createOppositionChallenge()` from `rumor-engine.ts` (canonical lives in `opposition-engine.ts`)
- [x] Consolidate ghost logic — `ghost-system.ts` is single ghost module; remove duplicates from `opposition-engine.ts`
- [x] Consolidate trust-score calc — `rumor-engine.ts` owns `calculateTrustScore()`; `reputation-logic.ts` imports from it
- [x] Deduplicate `KNOWN_COMMUNITIES` — extract to shared constant in `gun-config.ts`
- [x] Wire `debug-monitor.ts` — replace raw `console.log('[Etherial]...')` with `debugMonitor` calls

---

## Phase 1 — Blind Auth System

- [x] Fix `SEA.pair()` deterministic keypair generation (verify Gun 0.2020.1241 API)
- [x] Add `.edu` domain validation in `extractDomain()`
- [x] Persist keypair (`pair`) in `sessionStorage` (encrypted or raw, session-scoped)
- [x] Restore `pair` on mount in `UserProvider` so vote signing works after refresh
- [x] Sign all interactions (rumors, votes, oppositions) with `SEA.sign()`

---

## Phase 2 — √Karma Weighted Voting

- [x] Verify `Math.sqrt(karma)` is applied at vote time in `handleVote()`
- [x] Enforce minimum karma floor `0.1` (not `0`) in `updateUserKarma()`
- [x] Add +2.0 karma reward for rumor poster when resolved as FACT
- [x] Ensure karma is community-scoped (already per-domain in Gun path)

---

## Phase 3 — Rumor Lifecycle & Time Windows

- [x] Normalize status strings to lowercase: `active`, `fact`, `false`, `ghost`, `opposed`, `extended`, `unverified`
- [x] Update `Rumor` type, `resolveRumor()`, `TruthMeter`, `RumorCard`, all consumers
- [x] Map time window categories per spec: temporary (12-24h), not_urgent (1-2d), permanent (3-5d)
- [x] Implement duplicate vote prevention (check Gun for existing votes before recording)
- [x] Implement vote window enforcement using `isVotingWindowOpen()` from `timestamp-utils.ts`
- [x] Add cryptographic vote signing with `SEA.sign()` / `SEA.verify()`
- [x] Create auto-resolution scheduler (`lib/resolution-scheduler.ts`) — periodic scan + resolve
- [x] Switch from `.once()` to `.on()` for real-time P2P sync in feed loading
- [x] Hide vote counts — users NEVER see upvote/downvote counts, only final resolution

---

## Phase 4 — Opposition Slashing

- [x] Fix opposition eligibility check — status comparison must use normalized `'fact'`
- [x] Implement full opposition resolution with spec-correct karma consequences:
  - Success: Original voters -4.0, poster -4.0, opposers +3.0
  - Failure: Opposers -5.0, original voters +1.0
- [x] Enforce one-opposition-per-fact rule (check for existing failed opposition)
- [x] Wire opposition UI — show only for `status === 'fact'`, check karma threshold
- [x] Add opposition auto-resolution to scheduler

---

## Phase 5 — Ghost Deletion System

- [x] Implement ghost cascade: set status='ghost', trust_score=0, find references, recalculate
- [x] Filter ghosts from feed in `page.tsx` (use `filterGhosts()` from `ghost-system.ts`)
- [x] Nullify ghost vote contributions — ghosted rumor votes don't affect karma recalc

---

## Phase 6 — UI Integration & Polish

- [x] Implement search functionality (client-side filter on rumor text)
- [x] Implement filter tabs (Active / Facts / False / Challenged) with click handlers
- [x] Replace all `alert()` calls with toast notifications
- [x] Wire `ThemeProvider` into `layout.tsx`
- [x] Wire `timestamp-utils.ts` — use `formatTimeRemaining()` in `TruthMeter`
- [x] Fix Gun array handling — use scalar `oppositionId` instead of JS arrays

---

## Phase 7 — Hardening

- [x] Remove `ignoreBuildErrors: true` from `next.config.mjs` and fix TS errors
- [x] Add `gun.d.ts` type declarations for GunDB
- [x] Add clock skew validation using `validateClockSkew()` for rumor/vote creation
- [x] Verify P2P sync: two browser tabs → real-time feed updates (`.on()` listeners already wired)
