# ETHERIAL — PROGRESS

> Tracks implementation progress. Updated after each task completion.
> Status: ❌ Not Started | 🔄 In Progress | ✅ Complete

---

## Phase 0 — Tracking & Housekeeping

| # | Task | Status | Date | Notes |
|---|------|--------|------|-------|
| 0.1 | Create TO-DO.md | ✅ | 2026-02-07 | All tasks from MD spec mapped |
| 0.2 | Create PROGRESS.md | ✅ | 2026-02-07 | This file |
| 0.3 | Consolidate gun-config into gun-db | ✅ | 2026-02-07 | gun-db.ts now uses getGunConfig(); hardcoded relay URLs removed |
| 0.4 | Remove duplicate createOppositionChallenge from rumor-engine | ✅ | 2026-02-07 | Deleted ~80 lines; canonical in opposition-engine.ts |
| 0.5 | Consolidate ghost logic into ghost-system.ts | ✅ | 2026-02-07 | Removed ~120 lines from opposition-engine.ts; re-exports from ghost-system |
| 0.6 | Consolidate trust-score calc in rumor-engine.ts | ✅ | 2026-02-07 | Kept both as peer modules — reputation-logic.ts has live karma re-weighting for oppositions |
| 0.7 | Deduplicate KNOWN_COMMUNITIES | ✅ | 2026-02-07 | Single definition in gun-config.ts; page.tsx and community-sidebar.tsx import from it |
| 0.8 | Wire debug-monitor.ts | ✅ | 2026-02-07 | All 39 raw console calls replaced with debugMonitor across 7 files |

---

## Phase 1 — Blind Auth System

| # | Task | Status | Date | Notes |
|---|------|--------|------|-------|
| 1.1 | Fix SEA.pair() deterministic keypair | ✅ | 2026-02-07 | SEA.pair() is random-only; using SEA.work() for lookup key + encrypted storage in Gun |
| 1.2 | Add .edu domain validation | ✅ | 2026-02-07 | isEduDomain() regex validates .edu, .edu.xx, .edu.xxx |
| 1.3 | Persist keypair in sessionStorage | ✅ | 2026-02-07 | Full pair stored in sessionStorage (session-scoped, cleared on tab close) |
| 1.4 | Restore pair on mount | ✅ | 2026-02-07 | useEffect in UserProvider restores pair from sessionStorage |
| 1.5 | Sign all interactions with SEA | ✅ | 2026-02-07 | Rumors, votes, oppositions all signed via signData() |

---

## Phase 2 — √Karma Weighted Voting

| # | Task | Status | Date | Notes |
|---|------|--------|------|-------|
| 2.1 | Verify √karma at vote time | ✅ | 2026-02-07 | Math.sqrt(user.karma) confirmed in handleVote (page.tsx L153) |
| 2.2 | Enforce minimum karma floor 0.1 | ✅ | 2026-02-07 | Fixed reputation-logic.ts Math.max(0,…) → Math.max(0.1,…); auth-service.ts already correct |
| 2.3 | Add +2.0 poster reward for FACT | ✅ | 2026-02-07 | Added to both rumor-engine.ts and reputation-logic.ts |
| 2.4 | Verify community-scoped karma | ✅ | 2026-02-07 | Gun path etherial/communities/{domain}/users/{pubkey}/karma is per-community |

---

## Phase 3 — Rumor Lifecycle & Time Windows

| # | Task | Status | Date | Notes |
|---|------|--------|------|-------|
| 3.1 | Normalize status strings (lowercase) | ✅ | 2026-02-07 | Canonical: active, fact, false, unverified, ghost, opposed. Updated 8 files |
| 3.2 | Map time window categories per spec | ✅ | 2026-02-07 | Already mapped: 12h/24h (temp), 2d (standard), 5d (extended) |
| 3.3 | Duplicate vote prevention | ✅ | 2026-02-07 | Deterministic voteId (no timestamp); Gun check before write |
| 3.4 | Vote window enforcement | ✅ | 2026-02-07 | isVotingWindowOpen() now called in handleVote |
| 3.5 | Cryptographic vote signing | ✅ | 2026-02-07 | Done in Phase 1 (signData + SEA.sign on all votes) |
| 3.6 | Auto-resolution scheduler | ✅ | 2026-02-07 | lib/resolution-scheduler.ts — scans every 30s per domain |
| 3.7 | Real-time P2P sync (.on()) | ✅ | 2026-02-07 | Feed loader switched from .once() to .on() for live updates |
| 3.8 | Hide vote counts | ✅ | 2026-02-07 | Removed totalVoters display; shows "Votes hidden until resolution" |

---

## Phase 4 — Opposition Slashing

| # | Task | Status | Date | Notes |
|---|------|--------|------|-------|
| 4.1 | Fix opposition eligibility status check | ✅ | 2026-02-07 | Already correct after 3.1 normalization (status === 'fact') |
| 4.2 | Full opposition resolution + karma | ✅ | 2026-02-07 | Rewritten with spec-exact karma: win(+3.0 opposers, -4.0 voters, -4.0 poster), lose(-5.0 all opp voters, +1.0 orig voters) |
| 4.3 | One-opposition-per-fact rule | ✅ | 2026-02-07 | Added check in createOppositionChallenge; rumor-card hides button if oppositions exist |
| 4.4 | Wire opposition UI | ✅ | 2026-02-07 | Button shows only for status==='fact' with no existing oppositions; status set to 'opposed' on create |
| 4.5 | Opposition auto-resolution | ✅ | 2026-02-07 | resolution-scheduler.ts now scans for expired oppositions (expiresAt < now) |

---

## Phase 5 — Ghost Deletion System

| # | Task | Status | Date | Notes |
|---|------|--------|------|-------|
| 5.1 | Ghost cascade implementation | ✅ | 2026-02-07 | ghostRumor() now: fetches rumor pre-ghost, reverses resolution karma (voters & poster), sets status/trust_score/ghostedAt/votesNullified, then cascades; cascade skips ghost & opposed rumors |
| 5.2 | Filter ghosts from feed | ✅ | 2026-02-07 | page.tsx imports filterGhosts() from ghost-system.ts; double-filter: inline in .on() handler + filterGhosts() on sorted output |
| 5.3 | Nullify ghost vote contributions | ✅ | 2026-02-07 | Ghost guards added to resolveRumor(), updateKarmaAfterResolution(), calculateReputationWeightedTrustScore() — all bail out for status==='ghost'; reverseResolutionKarma() reverses asymmetric karma with 0.1 floor |

---

## Phase 6 — UI Integration & Polish

| # | Task | Status | Date | Notes |
|---|------|--------|------|-------|
| 6.1 | Search functionality | ✅ | 2026-02-07 | searchQuery state + client-side filter on rumor.text.toLowerCase() in page.tsx |
| 6.2 | Filter tabs | ✅ | 2026-02-07 | All/Active/Facts/False/Challenged tabs with activeFilter state; active tab highlight styling |
| 6.3 | Replace alert() with toasts | ✅ | 2026-02-07 | sonner toast() in page.tsx, rumor-card.tsx, opposition-modal.tsx; Sonner Toaster added to layout.tsx |
| 6.4 | Wire ThemeProvider | ✅ | 2026-02-07 | ThemeProvider wraps UserProvider in layout.tsx; attribute="class" defaultTheme="dark" |
| 6.5 | Wire timestamp-utils | ✅ | 2026-02-07 | TruthMeter now imports formatTimeRemaining + getTimeRemaining; shows "3h 45m remaining" |
| 6.6 | Fix Gun array handling (Sets) | ✅ | 2026-02-07 | Added scalar oppositionId to Rumor type; opposition-engine uses .put({oppositionId}) instead of array push; getOppositionChallenges prefers scalar with array fallback |

---

## Phase 7 — Hardening

| # | Task | Status | Date | Notes |
|---|------|--------|------|-------|
| 7.1 | Remove ignoreBuildErrors | ✅ | 2026-02-07 | Removed from next.config.mjs; zero TS errors across entire project |
| 7.2 | Add gun.d.ts type declarations | ✅ | 2026-02-07 | types/gun.d.ts: GunChainReference, GunOptions, SEAKeyPair, GunSEA interfaces |
| 7.3 | Clock skew validation | ✅ | 2026-02-07 | validateClockSkew() imported and enforced in handleVote (page.tsx); rejects votes with >5s skew |
| 7.4 | P2P sync verification | ✅ | 2026-02-07 | .on() real-time listeners wired in Phase 3; manual two-tab testing confirms live updates |
