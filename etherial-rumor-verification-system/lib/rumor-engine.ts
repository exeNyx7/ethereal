// @ts-nocheck
import { getRumorVotes, getCommunityRumors, getCommunityUsers, type Rumor, type Vote } from './gun-db';
import { updateUserKarma } from './auth-service';
import { debugMonitor } from './debug-monitor';

// Constants
const MINIMUM_VOTERS = 5;
const MINIMUM_WEIGHT = 10;
const FACT_THRESHOLD = 0.6;
const FALSE_THRESHOLD = 0.4;
const EXTENDED_WINDOW_DURATION = 24 * 60 * 60 * 1000; // 24 hours in ms

export type ResolutionStatus = 'fact' | 'false' | 'unverified' | 'pending';

interface ResolutionResult {
  status: ResolutionStatus;
  ratio: number;
  weighted_true: number;
  weighted_false: number;
  total_weight: number;
  trust_score: number; // Frozen value for resolved rumors
}

interface VoteData extends Vote {
  voterId: string;
  value: 1 | -1;
  weight: number;
}

/**
 * Fetch all votes for a rumor from Gun database
 */
async function fetchRumorVotes(
  domain: string,
  rumorId: string,
  gun: any
): Promise<VoteData[]> {
  const votesNode = getRumorVotes(domain, rumorId);

  return new Promise((resolve) => {
    const votes: VoteData[] = [];
    let voteCount = 0;

    votesNode.once((data) => {
      if (!data || typeof data !== 'object') {
        resolve([]);
        return;
      }

      const voteIds = Object.keys(data).filter((key) => key !== '_');
      if (voteIds.length === 0) {
        resolve([]);
        return;
      }

      voteIds.forEach((voteId) => {
        votesNode.get(voteId).once((voteData: any) => {
          voteCount++;
          if (voteData && voteData.voterId && voteData.value && voteData.weight !== undefined) {
            votes.push({
              voterId: voteData.voterId,
              value: voteData.value,
              weight: voteData.weight,
              timestamp: voteData.timestamp || Date.now(),
              rumorId,
            } as VoteData);
          }

          if (voteCount === voteIds.length) {
            resolve(votes);
          }
        });
      });
    });
  });
}

/**
 * Calculate weighted vote totals
 * CRITICAL: Weight = sqrt(voter_karma) as per spec
 */
function calculateWeightedVotes(votes: VoteData[]): {
  weighted_true: number;
  weighted_false: number;
  total_weight: number;
} {
  let weighted_true = 0;
  let weighted_false = 0;

  votes.forEach((vote) => {
    if (vote.value === 1) {
      weighted_true += vote.weight;
    } else {
      weighted_false += vote.weight;
    }
  });

  const total_weight = weighted_true + weighted_false;

  return {
    weighted_true,
    weighted_false,
    total_weight,
  };
}

/**
 * Calculate trust score ratio
 * Ratio = W_true / (W_true + W_false)
 */
export function calculateTrustScore(weighted_true: number, weighted_false: number): number {
  const total = weighted_true + weighted_false;
  if (total === 0) return 0.5;
  return weighted_true / total;
}

/**
 * Main resolution logic
 * CRITICAL: Implements exact spec - Quorum Check, Resolution Thresholds, Extended Window
 */
export async function resolveRumor(
  domain: string,
  rumorId: string,
  gun: any
): Promise<ResolutionResult> {
  // Fetch rumor data
  const rumorNode = getCommunityRumors(domain).get(rumorId);
  let rumorData: Rumor;

  await new Promise((resolve) => {
    rumorNode.once((data: any) => {
      rumorData = data as Rumor;
      resolve(data);
    });
  });

  // Ghost guard — never re-resolve a ghosted rumor (spec 4.8: votes nullified)
  if (rumorData?.status === 'ghost') {
    debugMonitor.warn(`resolveRumor: ${rumorId} is ghost — skipping`);
    return {
      status: 'pending',
      ratio: 0,
      weighted_true: 0,
      weighted_false: 0,
      total_weight: 0,
      trust_score: 0,
    };
  }

  // Fetch all votes
  const votes = await fetchRumorVotes(domain, rumorId, gun);

  // QUORUM CHECK
  if (votes.length < MINIMUM_VOTERS) {
    debugMonitor.warn(`Quorum check failed: ${votes.length}/${MINIMUM_VOTERS} voters`);
    return {
      status: 'pending',
      ratio: 0,
      weighted_true: 0,
      weighted_false: 0,
      total_weight: 0,
      trust_score: 0,
    };
  }

  // Calculate weighted totals
  const { weighted_true, weighted_false, total_weight } = calculateWeightedVotes(votes);

  // MINIMUM WEIGHT CHECK
  if (total_weight < MINIMUM_WEIGHT) {
    debugMonitor.warn(`Minimum weight check failed: ${total_weight}/${MINIMUM_WEIGHT}`);
    return {
      status: 'pending',
      ratio: 0,
      weighted_true,
      weighted_false,
      total_weight,
      trust_score: 0,
    };
  }

  // Calculate ratio
  const ratio = calculateTrustScore(weighted_true, weighted_false);

  // RESOLUTION THRESHOLDS
  let status: ResolutionStatus;

  if (ratio >= FACT_THRESHOLD) {
    status = 'fact';
  } else if (ratio <= FALSE_THRESHOLD) {
    status = 'false';
  } else {
    // Inconclusive: check if extended window has been used
    if (rumorData.extendedOnce) {
      status = 'unverified';
    } else {
      // Apply extended window - add 24 hours
      const newWindowClosesAt = Date.now() + EXTENDED_WINDOW_DURATION;
      await new Promise((resolve) => {
        rumorNode.put({ windowClosesAt: newWindowClosesAt, extendedOnce: true }, () =>
          resolve(null)
        );
      });
      debugMonitor.info(`Extended window applied to ${rumorId}`);

      return {
        status: 'pending',
        ratio,
        weighted_true,
        weighted_false,
        total_weight,
        trust_score: ratio,
      };
    }
  }

  // LOCKING: Freeze trust_score and status in Gun
  const frozenTrustScore = ratio;
  await new Promise((resolve) => {
    rumorNode.put(
      {
        status,
        trust_score: frozenTrustScore,
        weighted_true,
        weighted_false,
        total_voters: votes.length,
        total_weight,
      },
      () => resolve(null)
    );
  });

  debugMonitor.logResolution(rumorId, status, ratio, votes.length);

  return {
    status,
    ratio,
    weighted_true,
    weighted_false,
    total_weight,
    trust_score: frozenTrustScore,
  };
}

/**
 * Update karma for all voters based on resolution
 * ASYMMETRIC KARMA (per spec Section 4.5):
 * - Winners (voted with majority): +1.0
 * - Losers (voted against majority): -1.5
 * - Poster of true rumor (FACT): +2.0
 * - Poster of false rumor (FALSE): -2.0
 * - Minimum karma floor: 0.1 (enforced in updateUserKarma)
 */
export async function updateKarmaAfterResolution(
  domain: string,
  rumorId: string,
  resolution: ResolutionResult,
  gun: any
): Promise<void> {
  if (resolution.status === 'pending' || resolution.status === 'unverified') {
    return; // Don't update karma for unresolved rumors
  }

  const votes = await fetchRumorVotes(domain, rumorId, gun);
  const rumorNode = getCommunityRumors(domain).get(rumorId);

  let rumorData: Rumor;
  await new Promise((resolve) => {
    rumorNode.once((data: any) => {
      rumorData = data as Rumor;
      resolve(data);
    });
  });

  // Ghost guard — never apply karma for ghosted rumors (spec 4.8: votes nullified)
  if (rumorData?.status === 'ghost') {
    debugMonitor.warn(`updateKarmaAfterResolution: ${rumorId} is ghost — skipping`);
    return;
  }

  // Determine the winning vote (majority direction)
  const isFact = resolution.status === 'fact';
  const winningVote = isFact ? 1 : -1;

  // Update karma for all voters
  const updatePromises = votes.map(async (vote) => {
    let karmaChange = 0;

    if (vote.value === winningVote) {
      // Winner: +1.0
      karmaChange = 1.0;
    } else {
      // Loser: -1.5
      karmaChange = -1.5;
    }

    await updateUserKarma(vote.voterId, domain, karmaChange, gun);
  });

  await Promise.all(updatePromises);

  // Penalty for poster of false rumor
  if (resolution.status === 'false') {
    await updateUserKarma(rumorData.posterPublicKey, domain, -2.0, gun);
  }

  // Reward for poster when rumor resolved as FACT (+2.0 per spec)
  if (resolution.status === 'fact') {
    await updateUserKarma(rumorData.posterPublicKey, domain, 2.0, gun);
  }

  debugMonitor.info(`Karma updated for ${votes.length} voters after ${rumorId} resolution`);
}
