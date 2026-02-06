# ETHERIAL

### Decentralized Anonymous Campus Rumor Verification System

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Problem Statement](#2-problem-statement)
3. [Core Architecture](#3-core-architecture)
4. [System Components](#4-system-components)
   - 4.1 [Decentralized Database (GunDB P2P)](#41-decentralized-database-gundb-p2p)
   - 4.2 [Blind Authentication System](#42-blind-authentication-system)
   - 4.3 [Subreddit-Like Domain Communities](#43-subreddit-like-domain-communities)
   - 4.4 [Rumor Lifecycle & Time Windows](#44-rumor-lifecycle--time-windows)
   - 4.5 [Trust Score / Karma System](#45-trust-score--karma-system)
   - 4.6 [Voting & Resolution Mechanism](#46-voting--resolution-mechanism)
   - 4.7 [Opposition System (Challenging Facts)](#47-opposition-system-challenging-facts)
   - 4.8 [Ghost Deletion System](#48-ghost-deletion-system)
5. [Anti-Gaming & Sybil Resistance](#5-anti-gaming--sybil-resistance)
6. [Mathematical Proof of Resilience](#6-mathematical-proof-of-resilience)
7. [Bug Analysis & Solutions](#7-bug-analysis--solutions)
8. [User Flow](#8-user-flow)
9. [Tech Stack](#9-tech-stack)
10. [Glossary](#10-glossary)

---

## 1. Project Overview

**Etherial** is a fully decentralized, anonymous platform where university students can submit, verify, and dispute campus rumors and news — without any central server or admin controlling what is "true." Truth is determined collectively through reputation-weighted voting, cryptographic anonymous identity, and a structured lifecycle that transforms rumors into verified facts or debunked lies.

**Key Principles:**

- **No Central Authority** — No admin, no moderator, no single server decides truth.
- **Anonymity by Design** — Users interact through blind cryptographic keys; identities are never stored or linked.
- **Reputation is Earned** — Trust scores determine influence; new accounts and bots have near-zero power.
- **Truth Has a Process** — Rumors go through timed voting windows, opposition challenges, and finality locks.
- **Transparency of Process, Not of Votes** — Users cannot see upvote/downvote counts; they only see the final resolution after the time window closes.

---

## 2. Problem Statement

Campus communities lack a trustworthy, anonymous platform for sharing and verifying rumors or news. Existing systems suffer from:

| Problem | Description |
|---------|-------------|
| **Central Control** | Admins can censor or manipulate what is seen as "true" |
| **Identity Exposure** | Students fear retaliation for sharing sensitive information |
| **Mob Rule** | Popular lies win simply because more people believe them |
| **Bot Manipulation** | Fake accounts can flood votes to manipulate outcomes |
| **No Accountability** | Users can vote irresponsibly with no consequence |
| **Stale Truth** | Previously verified facts mysteriously lose credibility over time |
| **Ghost Dependencies** | Deleted rumors continue to invisibly affect related content |

**Etherial** addresses every one of these problems through its decentralized architecture, blind authentication, reputation-weighted voting, structured rumor lifecycle, and opposition mechanism.

---

## 3. Core Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      ETHERIAL NETWORK                       │
│                                                             │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐              │
│  │  Peer A   │◄──►│  Peer B   │◄──►│  Peer C   │  ...       │
│  │ (Student) │    │ (Student) │    │ (Relay)   │             │
│  └──────────┘    └──────────┘    └──────────┘              │
│       │               │               │                     │
│       └───────────────┼───────────────┘                     │
│                       │                                     │
│              ┌────────▼────────┐                            │
│              │   GunDB Graph   │                            │
│              │  (Replicated)   │                            │
│              └────────┬────────┘                            │
│                       │                                     │
│       ┌───────────────┼───────────────┐                     │
│       │               │               │                     │
│  ┌────▼─────┐   ┌─────▼────┐   ┌─────▼─────┐              │
│  │ Subreddit│   │ Subreddit │   │ Subreddit  │              │
│  │nu.edu.pk │   │lums.edu.pk│   │ nust.edu.pk│              │
│  └──────────┘   └──────────┘   └───────────┘              │
│                                                             │
│  Auth Layer:  Blind Key Generation (SEA)                    │
│  Trust Layer: Karma / Reputation Engine                     │
│  Vote Layer:  Hidden Counts + Reputation-Weighted Resolution│
│  Lifecycle:   Time Windows → Fact Lock → Opposition         │
└─────────────────────────────────────────────────────────────┘
```

**Data flows peer-to-peer.** Every student's device is a node. GunDB replicates the rumor graph across all connected peers. There is no single point of failure or control.

---

## 4. System Components

### 4.1 Decentralized Database (GunDB P2P)

**Technology:** [GunDB](https://gun.eco/) — a decentralized, real-time graph database.

**Why GunDB:**

- **Peer-to-Peer:** Data syncs directly between browsers via WebRTC; no central server required.
- **Graph-Based:** Perfect for modeling relationships between rumors, votes, users, and communities.
- **Real-Time:** Updates propagate instantly across all connected peers.
- **Built-in Crypto (SEA):** Provides encryption, signing, and key management out of the box.
- **Offline-First:** Works even when disconnected; syncs when back online.

**Data Model (Graph Structure):**

```
root/
├── communities/
│   ├── nu.edu.pk/
│   │   ├── rumors/
│   │   │   ├── <rumor_id>/
│   │   │   │   ├── content: "..."
│   │   │   │   ├── author_pub_key: "..."
│   │   │   │   ├── created_at: timestamp
│   │   │   │   ├── category: "temporary" | "not_urgent" | "permanent"
│   │   │   │   ├── status: "active" | "fact" | "false" | "ghost" | "opposed"
│   │   │   │   ├── window_closes_at: timestamp
│   │   │   │   ├── trust_score: number
│   │   │   │   ├── votes/ → <vote references>
│   │   │   │   └── oppositions/ → <opposition references>
│   │   │   └── ...
│   │   └── members/ → <public key references>
│   └── lums.edu.pk/
│       └── ...
├── users/
│   ├── <public_key>/
│   │   ├── karma: number
│   │   ├── created_at: timestamp
│   │   ├── community: "nu.edu.pk"
│   │   └── vote_history/ → <vote references>
│   └── ...
└── oppositions/
    ├── <opposition_id>/
    │   ├── target_rumor_id: "..."
    │   ├── opposing_post_content: "..."
    │   ├── author_pub_key: "..."
    │   ├── window_closes_at: timestamp
    │   ├── status: "active" | "succeeded" | "failed"
    │   └── votes/ → <vote references>
    └── ...
```

**Relay Peers:** At least one always-on relay peer runs to ensure data persistence when students are offline. This relay is NOT an authority — it's just a peer that never sleeps.

---

### 4.2 Blind Authentication System

**Goal:** Every user gets a unique, anonymous, deterministic cryptographic identity — without storing or linking their real email.

**How It Works:**

1. **Account Creation:**
   - User enters their university email (e.g., `fada@nu.edu.pk`) and a passphrase.
   - A **one-time verification email** is sent to confirm the email is real.
   - Once verified, a **deterministic keypair** is generated using GunDB's SEA module:
     ```
     keypair = SEA.pair(email + passphrase)
     ```
   - The **email is immediately discarded** — it is never stored anywhere in the system.
   - The user's **public key** becomes their permanent anonymous identity.

2. **Future Logins:**
   - User enters email + passphrase again → same keypair is regenerated deterministically.
   - No stored credentials, no session tokens, no server-side auth.
   - Same email + same passphrase = same key, every time.

3. **One-Person-One-Account:**
   - Each `.edu` email can only generate one keypair.
   - The email domain (e.g., `nu.edu.pk`) determines community membership.
   - The email itself is never stored — only the domain is extracted and retained.

4. **All Interactions Are Signed:**
   - Every rumor submission, vote, and opposition is cryptographically signed with the user's private key.
   - This proves authorship without revealing identity — peers verify the signature against the public key.

**Privacy Guarantees:**

| What | Stored? | Visible? |
|------|---------|----------|
| Email address | ❌ Never | ❌ Never |
| Passphrase | ❌ Never | ❌ Never |
| Public key | ✅ Yes | ✅ As anonymous ID |
| Private key | ❌ Only in user's device | ❌ Never |
| University domain | ✅ Yes | ✅ For community routing |

---

### 4.3 Subreddit-Like Domain Communities

**Concept:** Each university gets its own isolated community (like a subreddit) based on email domain.

**Rules:**

| Rule | Detail |
|------|--------|
| **Community assignment** | Automatically determined from email domain at registration (e.g., `fada@nu.edu.pk` → community `nu.edu.pk`) |
| **Posting/Voting** | Users can **only post and vote** within their own community |
| **Viewing** | Users can **view** rumors from any community (read-only cross-community access) |
| **Isolation** | Karma/reputation is scoped per community — reputation in `nu.edu.pk` doesn't transfer to `lums.edu.pk` |

**Examples:**

| Email | Community | Can Post In | Can View |
|-------|-----------|-------------|----------|
| `fada@nu.edu.pk` | `nu.edu.pk` | `nu.edu.pk` only | All communities |
| `ali@lums.edu.pk` | `lums.edu.pk` | `lums.edu.pk` only | All communities |
| `sara@nust.edu.pk` | `nust.edu.pk` | `nust.edu.pk` only | All communities |

---

### 4.4 Rumor Lifecycle & Time Windows

Every rumor goes through a structured lifecycle with timed phases. This is the backbone of the truth-determination process.

#### Lifecycle Stages:

```
  ┌─────────────┐
  │   SUBMITTED  │  User posts a new rumor
  │   (Active)   │
  └──────┬───────┘
         │
         ▼
  ┌─────────────┐
  │  VOTING      │  Time window opens (1-2 days based on category)
  │  WINDOW      │  Users upvote (true) or downvote (false)
  │  (Open)      │  Vote counts are HIDDEN from all users
  └──────┬───────┘
         │ Window closes
         ▼
  ┌─────────────┐
  │  RESOLUTION  │  Reputation-weighted votes are tallied
  │              │  Rumor is labelled FACT or FALSE
  └──────┬───────┘
         │
         ├─── If FACT ───────────────┐
         │                           ▼
         │                    ┌─────────────┐
         │                    │   LOCKED     │  Fact is now established
         │                    │   (FACT)     │  Trust score is FROZEN
         │                    └──────┬───────┘
         │                           │ Can be OPPOSED
         │                           ▼
         │                    ┌─────────────┐
         │                    │  OPPOSITION  │  New time window opens
         │                    │  WINDOW      │  Opposers must gather more
         │                    │              │  support than original fact
         │                    └──────┬───────┘
         │                           │
         │                    ┌──────┴──────┐
         │                    ▼             ▼
         │              ┌──────────┐  ┌──────────┐
         │              │ FACT     │  │ FACT      │
         │              │ UPHELD   │  │ OVERTURNED│
         │              │ (Opposers│  │ (Original │
         │              │ punished)│  │ voters    │
         │              └──────────┘  │ punished) │
         │                            └──────────┘
         │
         └─── If FALSE ──────────────┐
                                     ▼
                              ┌─────────────┐
                              │   LOCKED     │
                              │   (FALSE)    │  Debunked, trust score frozen
                              └─────────────┘
```

#### Time Window Categories:

| Category | Duration | Use Case |
|----------|----------|----------|
| **Temporary** | 12-24 hours | Time-sensitive campus events (e.g., "Class cancelled today") |
| **Not Urgent** | 1-2 days | General campus news (e.g., "New cafe opening next week") |
| **Permanent** | 3-5 days | Significant claims (e.g., "Tuition fee increase next semester") |

#### Key Rules:

- **Vote counts are HIDDEN** from all users during the voting window — users cannot see upvote/downvote counts at any time.
- Users see only the **final resolution** (FACT or FALSE) after the window closes.
- Once a rumor is **locked** (as FACT or FALSE), its trust score is **frozen** and cannot change through normal voting — only through the Opposition mechanism.

---

### 4.5 Trust Score / Karma System

Every user has a **Karma Score** (reputation) that determines how much weight their votes carry. This is the primary defense against bots, mob rule, and coordinated manipulation.

#### Karma Calculation:

```
Karma(user) = base_karma
              + Σ (correct_vote_reward)
              - Σ (incorrect_vote_penalty)
              - Σ (failed_opposition_penalty)
              + Σ (successful_opposition_reward)
```

#### Karma Events:

| Event | Karma Change | Description |
|-------|-------------|-------------|
| **Account creation** | +1.0 | Everyone starts with minimal baseline karma |
| **Voted on winning side** | +1.0 | User voted correctly on a resolved rumor |
| **Voted on losing side** | -1.5 | User voted incorrectly (asymmetric penalty — lying costs more) |
| **Posted a rumor → became FACT** | +2.0 | User submitted truth |
| **Posted a rumor → became FALSE** | -2.0 | User submitted a lie |
| **Opposed a FACT → Opposition succeeded** | +3.0 | User correctly challenged a false fact |
| **Opposed a FACT → Opposition failed** | **-5.0** | **Heavy penalty** — user challenged a proven fact and lost |
| **Original FACT voters when fact is overturned** | **-4.0** | **Heavy penalty** — they vouched for something that was later disproven |

#### Karma Properties:

| Property | Detail |
|----------|--------|
| **Minimum karma** | 0.1 (users can never reach exactly 0 — everyone has minimal voice) |
| **No maximum cap** | But influence is calculated using `√(karma)` to prevent oligarchy |
| **Community-scoped** | Karma in `nu.edu.pk` is separate from karma in `lums.edu.pk` |
| **Persistent** | Stored in the GunDB graph, replicated across all peers |

#### Why √(karma) for Vote Weight:

Using the square root of karma as vote weight prevents high-reputation users from becoming unchallengeable:

| User | Raw Karma | Vote Weight (√karma) | Relative Power |
|------|-----------|----------------------|----------------|
| Veteran (100 karma) | 100 | 10.0 | 10× newbie |
| Regular (25 karma) | 25 | 5.0 | 5× newbie |
| Newbie (1 karma) | 1 | 1.0 | Baseline |
| Bot (0.1 karma) | 0.1 | 0.316 | Nearly powerless |

Without √: Veteran has 100× the power of a newbie (oligarchy).  
With √: Veteran has 10× the power (influential but not tyrannical).

---

### 4.6 Voting & Resolution Mechanism

#### Voting Rules:

1. **Hidden Votes:** Users can NEVER see the count of upvotes or downvotes on any rumor — not during voting, not after resolution.
2. **One Vote Per User:** Each public key can only cast one vote per rumor. Duplicate votes from the same key are rejected.
3. **Signed Votes:** Every vote is cryptographically signed, ensuring authenticity and preventing tampering.
4. **No Vote Changing:** Once cast, a vote cannot be changed or retracted.

#### Resolution Algorithm:

When a rumor's time window closes:

```
Step 1: Collect all votes for the rumor
Step 2: For each vote, calculate voter's weight = √(voter_karma)
Step 3: Sum weights:
        - W_true  = Σ √(karma) of all upvoters
        - W_false = Σ √(karma) of all downvoters
Step 4: Calculate ratio:
        - R = W_true / (W_true + W_false)
Step 5: Apply quorum check:
        - IF total_voters < MINIMUM_VOTERS (e.g., 5) → Rumor stays UNRESOLVED
        - IF (W_true + W_false) < MINIMUM_WEIGHT → Rumor stays UNRESOLVED
Step 6: Resolution:
        - IF R ≥ 0.60 → Rumor is labelled FACT ✅
        - IF R ≤ 0.40 → Rumor is labelled FALSE ❌
        - IF 0.40 < R < 0.60 → Rumor is INCONCLUSIVE (stays active for extended window)
Step 7: Lock the rumor's trust score
Step 8: Update karma for all voters (reward winners, penalize losers)
```

#### Edge Case — Tied/Close Votes:

When votes are nearly tied (R between 0.40 and 0.60):
- The rumor gets an **extended time window** (additional 24 hours).
- If still inconclusive after extension, it's marked as **UNVERIFIED** — no karma changes for anyone.

---

### 4.7 Opposition System (Challenging Facts)

Even after a rumor is locked as a **FACT**, it can be challenged through the Opposition mechanism. This is critical because initial consensus can be wrong.

#### How Opposition Works:

1. **Initiating Opposition:**
   - Any user can select a locked FACT and choose to **Oppose** it.
   - The opposing user must create an **Opposition Post** explaining why the fact is false, with evidence.
   - **Eligibility Threshold:** The opposing user (or group of opposing users backing the opposition) must have a combined karma that meets a minimum threshold relative to the karma of the original fact's voters. This prevents frivolous challenges.

2. **Opposition Time Window:**
   - A new voting window opens (1-2 days) specifically for the opposition.
   - During this window, users vote on whether the opposition is valid.
   - The opposition post competes directly against the original fact.

3. **Resolution of Opposition:**
   - For the opposition to **succeed**, the opposition post must gather **more cumulative weighted upvotes** than the original fact received.
   - This is deliberately hard — overturning established facts requires significant community support.

4. **Karma Consequences:**

   **If Opposition SUCCEEDS (Fact is overturned):**
   | Who | What Happens |
   |-----|-------------|
   | Original FACT voters (who upvoted it) | **Heavy karma penalty** (-4.0 each) — they vouched for something false |
   | Opposing users | **Karma reward** (+3.0 each) — they corrected a falsehood |
   | Original rumor poster | **Heavy karma penalty** (-4.0) — they posted misinformation |

   **If Opposition FAILS (Fact is upheld):**
   | Who | What Happens |
   |-----|-------------|
   | Opposing users | **Heavy karma penalty** (-5.0 each) — they challenged proven truth and lost |
   | Original FACT voters | **Small karma reward** (+1.0) — their judgment was reaffirmed |

5. **One Opposition Per Fact:**
   - A fact can only be opposed **once** — if the opposition fails, the fact is permanently locked and can never be challenged again. This prevents harassment through repeated challenges.

#### Why Opposition Is Intentionally Difficult:

The high karma cost of failed opposition serves multiple purposes:
- **Discourages frivolous challenges** — users won't oppose facts unless they genuinely have evidence
- **Protects established truth** — verified facts remain stable
- **Creates real stakes** — opposition is a serious action with serious consequences

---

### 4.8 Ghost Deletion System

When a rumor needs to be removed (by community consensus or platform rules), it is **not actually deleted** from the graph. Instead, it becomes a **Ghost**.

#### Ghost Properties:

| Property | Value |
|----------|-------|
| `status` | `"ghost"` |
| `visible_in_feed` | `false` — hidden from all user interfaces |
| `trust_score` | **Nullified (set to 0)** |
| `vote_contributions` | **Zeroed out** — ghost's votes no longer affect any calculations |
| `graph_node` | **Preserved** — the node remains in GunDB for referential integrity |

#### Why Ghosts Exist (Solving Bug #3):

In a graph database, rumors can reference or relate to other rumors. If you hard-delete a rumor, its relationships become dangling references, and stale cached scores from the deleted rumor continue to pollute calculations of related rumors.

**Ghost deletion solves this by:**
1. Keeping the node in the graph (no dangling references)
2. Explicitly nullifying its score (no stale contribution)
3. Marking it invisible (no UI pollution)
4. Triggering a **score recalculation cascade** on all rumors that referenced the ghost

#### Ghost Cascade Algorithm:

```
When rumor R is ghosted:
  1. Set R.status = "ghost"
  2. Set R.trust_score = 0
  3. Find all rumors that reference R (related rumors)
  4. For each related rumor:
     a. Recalculate trust_score EXCLUDING ghost contributions
     b. Update the recalculated score in the graph
  5. Ghost node remains in graph but is filtered from all queries
```

---

## 5. Anti-Gaming & Sybil Resistance

### 5.1 Bot Account Prevention

| Defense Layer | How It Works |
|---------------|-------------|
| **Email verification** | One-time `.edu` email verification ensures real students |
| **One email = one keypair** | Deterministic key generation prevents multiple accounts per email |
| **Low starting karma** | New accounts have karma = 1.0, giving them minimal influence |
| **√(karma) weighting** | Even 100 bot accounts combined have less weight than 1 established user |
| **Asymmetric penalties** | Bots that vote incorrectly lose karma faster than they gain it |

### 5.2 Coordinated Liar Prevention

| Attack | Defense |
|--------|---------|
| **Mass upvoting a lie** | Reputation-weighted voting — 100 low-karma bots < 5 trusted veterans |
| **Creating fake "facts"** | Quorum requirement — minimum N voters with minimum total weight needed |
| **Opposing real facts** | High karma threshold for opposition eligibility + heavy penalty for failed opposition |
| **Slow reputation farming** | Asymmetric rewards — losing costs 1.5× more than winning gains |

### 5.3 Cost Analysis for an Attacker

To successfully push a false rumor to FACT status, an attacker would need:

```
Required: W_attack > 0.60 × (W_attack + W_honest)
Therefore: W_attack > 1.5 × W_honest

If honest community has total √karma weight of 100:
  Attacker needs √karma weight > 150
  If each bot has starting karma 1.0, √karma = 1.0
  Attacker needs > 150 bot accounts with verified .edu emails
  
  AND every bot that voted wrong in the past has karma < 1.0
  So realistically: attacker needs >> 150 accounts

This is practically infeasible for a university email system.
```

---

## 6. Mathematical Proof of Resilience

### Theorem:

> For a community with `n` honest participants with average karma `k_h`, and an attacker controlling `m` accounts each with karma `k_a`, the attacker cannot flip a truthful resolution if:
>
> `m × √(k_a) < (threshold / (1 - threshold)) × n × √(k_h)`

### Proof:

**Definitions:**
- Let `W_H = n × √(k_h)` = total honest vote weight
- Let `W_A = m × √(k_a)` = total attacker vote weight
- Resolution threshold `T = 0.60`

**For attacker to flip a true rumor to FALSE:**

The attacker needs the false-vote weight to exceed the threshold:

```
W_A / (W_A + W_H) ≥ T
W_A ≥ T × (W_A + W_H)
W_A ≥ T × W_A + T × W_H
W_A - T × W_A ≥ T × W_H
W_A × (1 - T) ≥ T × W_H
W_A ≥ (T / (1-T)) × W_H
W_A ≥ (0.60 / 0.40) × W_H
W_A ≥ 1.5 × W_H
```

**Substituting:**

```
m × √(k_a) ≥ 1.5 × n × √(k_h)
```

**For new bot accounts** where `k_a = 1.0`:

```
m ≥ 1.5 × n × √(k_h)
```

**Example:** Community with `n = 50` honest users, average karma `k_h = 25`:

```
m ≥ 1.5 × 50 × √25
m ≥ 1.5 × 50 × 5
m ≥ 375 verified .edu bot accounts
```

**Conclusion:** An attacker would need **375 unique verified university email accounts** to flip a single vote against a community of 50 moderately-active honest users. This is practically infeasible. ∎

### Additional Property — Self-Correcting:

Even if an attacker succeeds once:
- Attacker bots that voted for a lie will **lose karma** (-1.5 each) when the lie is eventually caught via opposition
- Honest users who correctly opposed will **gain karma** (+3.0 each)
- Over time, the system **self-corrects** — attacker influence diminishes, honest influence grows

---

## 7. Bug Analysis & Solutions

### Bug #1: Verified facts from last month are mysteriously changing scores

**Root Cause:** Trust scores were being recalculated continuously, including for settled/locked rumors. If a voter's karma changed after the fact was locked, the trust score would shift retroactively.

**Solution in Etherial:**
- Once a rumor is resolved (FACT or FALSE), its trust score is **permanently frozen**.
- The score at resolution time is the final score — it never changes regardless of future karma changes.
- Only the Opposition mechanism can reopen a locked fact, and that creates a new separate resolution.

### Bug #2: Bot accounts manipulating votes

**Root Cause:** No identity verification + equal vote weight for all accounts.

**Solution in Etherial:**
- **Blind auth with `.edu` email verification** — one real email = one account
- **Karma-weighted voting** — bots start with karma 1.0 and have negligible influence
- **√(karma) weighting** — even mass bot creation can't overcome established honest users
- **Asymmetric penalties** — bots that vote wrong lose karma faster than they can gain it

### Bug #3: Deleted rumors still affecting trust scores of related rumors

**Root Cause:** Hard-deleting a rumor leaves orphaned references and stale cached score contributions in the graph.

**Solution in Etherial:**
- **Ghost deletion** — rumors are soft-deleted, kept as ghost nodes in the graph
- Ghost nodes have their trust scores **nullified to 0**
- A **cascade recalculation** propagates through all related rumors, excluding ghost contributions
- Referential integrity is maintained because the node still exists in the graph

---

## 8. User Flow

### 8.1 — Registration

```
1. User opens Etherial
2. Enters university email (e.g., fada@nu.edu.pk) + passphrase
3. One-time verification email sent
4. User confirms email
5. Deterministic keypair generated from (email + passphrase)
6. Email is DISCARDED — only domain "nu.edu.pk" is retained
7. User is assigned to community "nu.edu.pk"
8. User starts with karma = 1.0
```

### 8.2 — Posting a Rumor

```
1. User writes rumor content
2. Selects time window category: Temporary / Not Urgent / Permanent
3. Rumor is signed with user's private key
4. Rumor is broadcast to the P2P network
5. Voting window opens
6. Other users in the same community can vote (upvote/downvote)
7. Vote counts remain HIDDEN throughout
```

### 8.3 — Voting on a Rumor

```
1. User sees an active rumor with an open voting window
2. User votes: Upvote (I believe this is true) or Downvote (I believe this is false)
3. Vote is signed with user's private key (prevents forgery)
4. System checks: has this public key already voted? If yes → reject
5. Vote is recorded but count is NOT displayed to anyone
```

### 8.4 — Rumor Resolution

```
1. Time window closes
2. System tallies reputation-weighted votes
3. Quorum check: enough voters? enough total weight?
4. Resolution: FACT / FALSE / INCONCLUSIVE
5. All voters' karma is updated (winners rewarded, losers penalized)
6. Rumor trust score is LOCKED
```

### 8.5 — Opposing a Fact

```
1. User selects a locked FACT they believe is wrong
2. Creates an opposition post with evidence
3. System checks: does user (or backing group) meet karma threshold?
4. If eligible → new opposition time window opens
5. Community votes on the opposition
6. Resolution: Opposition succeeds or fails
7. Heavy karma penalties applied to the losing side
```

---

## 9. Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Database** | GunDB | Decentralized P2P graph database |
| **Authentication** | GunDB SEA (Security, Encryption, Authorization) | Blind keypair generation, signing, encryption |
| **Frontend** | React / Next.js (or any SPA framework) | User interface |
| **P2P Communication** | WebRTC (via GunDB) | Peer-to-peer data sync |
| **Relay Peer** | GunDB relay server | Always-on peer for data persistence |
| **Cryptography** | SEA (built into GunDB) | Signatures, key derivation, zero-knowledge-adjacent proofs |

---

## 10. Glossary

| Term | Definition |
|------|-----------|
| **Rumor** | A user-submitted claim about a campus event, initially unverified |
| **Fact** | A rumor that has been verified as true through reputation-weighted community voting |
| **Ghost** | A soft-deleted rumor that remains in the graph but is invisible and has nullified scores |
| **Karma** | A user's reputation score, earned by voting correctly and lost by voting incorrectly |
| **Trust Score** | A rumor's credibility score, calculated from reputation-weighted votes |
| **Time Window** | The voting period during which users can upvote or downvote a rumor |
| **Opposition** | A formal challenge to a locked fact, requiring significant karma and community support |
| **Quorum** | The minimum number of voters and total vote weight required to resolve a rumor |
| **Blind Auth** | Authentication where a user proves they are unique without revealing their identity |
| **SEA** | Security, Encryption, Authorization — GunDB's built-in crypto module |
| **Sybil Attack** | An attack where one person creates many fake accounts to manipulate the system |
| **Ghost Cascade** | The process of recalculating scores of all rumors related to a ghosted rumor |
| **Subreddit** | A community space scoped to a university domain (e.g., `nu.edu.pk`) |
| **√(karma) Weighting** | Using the square root of karma as vote weight to prevent reputation oligarchy |

---

*Etherial — Where truth isn't declared. It's earned.*