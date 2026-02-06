import { getCommunityUsers, getCommunityRumors, getRumorVotes, type Rumor, type Vote } from './gun-db';
import { debugMonitor } from './debug-monitor';

// Constants from spec
const MINIMUM_VOTERS = 5;
const MINIMUM_WEIGHT = 10;
const FACT_THRESHOLD = 0.6;
const FALSE_THRESHOLD = 0.4;

export interface ReputationWeightedResult {
  status: 'fact' | 'false' | 'inconclusive' | 'pending';
  ratio: number;
  weightedTrue: number;
  weightedFalse: number;
  totalWeight: number;
  trustScore: number;
  totalVoters: number;
  requiresExtendedWindow: boolean;
}

/**
 * PROMPT A: Reputation-Weighted Trust Score Calculation
 * 
 * Iterates through all signed votes in a GunDB node, fetches each voter's current karma,
 * applies Math.sqrt() weighting, and returns whether the rumor is FACT, FALSE, or INCONCLUSIVE.
 * 
 * Asymmetric karma rewards:
 * - Winners (voted with majority): +1.0
 * - Losers (voted against majority): -1.5
 * - Poster of false rumor: -2.0
 */
export async function calculateReputationWeightedTrustScore(
  domain: string,
  rumorId: string,
  gun: any
): Promise<ReputationWeightedResult> {
  debugMonitor.info('Calculating reputation-weighted trust score', { rumorId });

  try {
    // Step 1: Fetch the rumor
    const rumorNode = getCommunityRumors(domain).get(rumorId);
    const rumor = await new Promise<Rumor>((resolve) => {
      rumorNode.once((data: any) => {
        resolve(data as Rumor);
      });
    });

    if (!rumor) {
      return {
        status: 'pending',
        ratio: 0,
        weightedTrue: 0,
        weightedFalse: 0,
        totalWeight: 0,
        trustScore: 0,
        totalVoters: 0,
        requiresExtendedWindow: false,
      };
    }

    // Ghost guard — never recalculate a ghosted rumor (spec 4.8: votes nullified)
    if (rumor.status === 'ghost') {
      debugMonitor.warn(`Reputation calc: ${rumorId} is ghost — returning zeroed result`);
      return {
        status: 'pending',
        ratio: 0,
        weightedTrue: 0,
        weightedFalse: 0,
        totalWeight: 0,
        trustScore: 0,
        totalVoters: 0,
        requiresExtendedWindow: false,
      };
    }

    // Step 2: Fetch all votes with voter IDs
    const votes = await fetchAndWeightVotes(domain, rumorId, gun);

    debugMonitor.debug('Total votes fetched', { count: votes.length });

    // Step 3: Check quorum
    if (votes.length < MINIMUM_VOTERS) {
      debugMonitor.warn(`Quorum not met: ${votes.length} < ${MINIMUM_VOTERS}`);
      return {
        status: 'pending',
        ratio: 0,
        weightedTrue: votes.reduce((sum, v) => sum + (v.value === 1 ? v.weight : 0), 0),
        weightedFalse: votes.reduce((sum, v) => sum + (v.value === -1 ? v.weight : 0), 0),
        totalWeight: votes.reduce((sum, v) => sum + v.weight, 0),
        trustScore: 0,
        totalVoters: votes.length,
        requiresExtendedWindow: false,
      };
    }

    // Step 4: Calculate weighted totals
    const weightedTrue = votes.reduce((sum, v) => sum + (v.value === 1 ? v.weight : 0), 0);
    const weightedFalse = votes.reduce((sum, v) => sum + (v.value === -1 ? v.weight : 0), 0);
    const totalWeight = weightedTrue + weightedFalse;

    debugMonitor.debug('Weighted totals', { weightedTrue, weightedFalse, totalWeight });

    // Step 5: Check minimum weight threshold
    if (totalWeight < MINIMUM_WEIGHT) {
      debugMonitor.warn(`Weight threshold not met: ${totalWeight} < ${MINIMUM_WEIGHT}`);
      return {
        status: 'pending',
        ratio: totalWeight > 0 ? weightedTrue / totalWeight : 0,
        weightedTrue,
        weightedFalse,
        totalWeight,
        trustScore: totalWeight > 0 ? weightedTrue / totalWeight : 0,
        totalVoters: votes.length,
        requiresExtendedWindow: false,
      };
    }

    // Step 6: Calculate ratio and determine status
    const ratio = weightedTrue / totalWeight;
    const trustScore = ratio; // Trust score is the ratio itself

    debugMonitor.debug('Ratio calculated', { ratio, trustScore });

    let status: 'fact' | 'false' | 'inconclusive' | 'pending' = 'inconclusive';
    let requiresExtendedWindow = false;

    if (ratio >= FACT_THRESHOLD) {
      status = 'fact';
      debugMonitor.info('Resolution: FACT (ratio >= 0.60)');
    } else if (ratio <= FALSE_THRESHOLD) {
      status = 'false';
      debugMonitor.info('Resolution: FALSE (ratio <= 0.40)');
    } else {
      // Inconclusive: between 0.40 and 0.60
      status = 'inconclusive';
      requiresExtendedWindow = true;
      debugMonitor.info('Resolution: INCONCLUSIVE - requires extended window');
    }

    // Step 7: Apply asymmetric karma updates (will be called by caller)
    // This function returns the result; karma updates happen after resolution confirmation
    
    return {
      status,
      ratio,
      weightedTrue,
      weightedFalse,
      totalWeight,
      trustScore,
      totalVoters: votes.length,
      requiresExtendedWindow,
    };
  } catch (error) {
    debugMonitor.error('Error calculating trust score', error);
    return {
      status: 'pending',
      ratio: 0,
      weightedTrue: 0,
      weightedFalse: 0,
      totalWeight: 0,
      trustScore: 0,
      totalVoters: 0,
      requiresExtendedWindow: false,
    };
  }
}

/**
 * Fetch all votes for a rumor with voter karma weights applied
 * CRITICAL: Weight = Math.sqrt(voter_karma)
 */
async function fetchAndWeightVotes(
  domain: string,
  rumorId: string,
  gun: any
): Promise<Array<{ voterId: string; value: 1 | -1; weight: number; timestamp: number }>> {
  const votes: Array<{ voterId: string; value: 1 | -1; weight: number; timestamp: number }> = [];

  // Fetch all votes for this rumor
  const votesNode = getRumorVotes(domain, rumorId);

  return new Promise((resolve) => {
    votesNode.once((votesData: any) => {
      if (!votesData || typeof votesData !== 'object') {
        resolve([]);
        return;
      }

      const voteIds = Object.keys(votesData).filter((k) => k !== '_');
      if (voteIds.length === 0) {
        resolve([]);
        return;
      }

      let processedCount = 0;

      voteIds.forEach((voteId) => {
        votesNode.get(voteId).once(async (voteData: any) => {
          if (voteData && voteData.voterId && voteData.value !== undefined) {
            // Fetch voter's current karma
            const voterNode = getCommunityUsers(domain).get(voteData.voterId);
            voterNode.once((userData: any) => {
              const karma = userData?.karma ?? 0;
              const weight = Math.sqrt(Math.max(karma, 0)); // Math.sqrt(karma) as per spec

              votes.push({
                voterId: voteData.voterId,
                value: voteData.value === 1 ? 1 : -1,
                weight,
                timestamp: voteData.timestamp || Date.now(),
              });

              processedCount++;
              if (processedCount === voteIds.length) {
                resolve(votes);
              }
            });
          } else {
            processedCount++;
            if (processedCount === voteIds.length) {
              resolve(votes);
            }
          }
        });
      });
    });
  });
}

/**
 * Apply asymmetric karma updates after resolution is finalized
 * 
 * Karma changes (per spec Section 4.5):
 * - Winners (voted with majority): +1.0
 * - Losers (voted against majority): -1.5
 * - Poster of false rumor: -2.0
 * - Poster of fact rumor: +2.0
 * - Minimum karma floor: 0.1
 */
export async function applyAsymmetricKarmaUpdates(
  domain: string,
  rumorId: string,
  resolution: ReputationWeightedResult,
  gun: any
): Promise<void> {
  if (resolution.status === 'pending' || resolution.status === 'inconclusive') {
    debugMonitor.debug('Skipping karma updates for non-resolved rumor');
    return;
  }

  debugMonitor.info('Applying asymmetric karma updates', { rumorId });

  try {
    // Fetch all votes again
    const votes = await fetchAndWeightVotes(domain, rumorId, gun);

    // Determine majority vote value (1 for FACT, -1 for FALSE)
    const majorityValue = resolution.status === 'fact' ? 1 : -1;

    // Update karma for each voter
    for (const vote of votes) {
      const usersNode = getCommunityUsers(domain);
      const userNode = usersNode.get(vote.voterId);

      userNode.once((userData: any) => {
        const currentKarma = userData?.karma ?? 0;
        let karmaChange = 0;

        if (vote.value === majorityValue) {
          // Winner
          karmaChange = 1.0;
          debugMonitor.logKarmaUpdate(vote.voterId, 1.0, currentKarma + 1.0);
        } else {
          // Loser
          karmaChange = -1.5;
          debugMonitor.logKarmaUpdate(vote.voterId, -1.5, currentKarma - 1.5);
        }

        const newKarma = Math.max(0.1, currentKarma + karmaChange);
        userNode.put({ karma: newKarma });
      });
    }

    // Fetch rumor poster and apply karma based on resolution
    const rumorNode = getCommunityRumors(domain).get(rumorId);
    rumorNode.once((rumorData: any) => {
      if (resolution.status === 'false' && rumorData?.posterId) {
        const posterNode = getCommunityUsers(domain).get(rumorData.posterId);
        posterNode.once((posterData: any) => {
          const currentKarma = posterData?.karma ?? 0;
          const newKarma = Math.max(0.1, currentKarma - 2.0);
          posterNode.put({ karma: newKarma });
          debugMonitor.logKarmaUpdate(rumorData.posterId, -2.0, newKarma);
        });
      }
      if (resolution.status === 'fact' && rumorData?.posterId) {
        const posterNode = getCommunityUsers(domain).get(rumorData.posterId);
        posterNode.once((posterData: any) => {
          const currentKarma = posterData?.karma ?? 0;
          const newKarma = currentKarma + 2.0;
          posterNode.put({ karma: newKarma });
          debugMonitor.logKarmaUpdate(rumorData.posterId, 2.0, newKarma);
        });
      }
    });

  } catch (error) {
    debugMonitor.error('Error applying karma updates', error);
  }
}

/**
 * Get the status of a resolved rumor without recalculating
 * Used to check if a rumor has already been resolved
 */
export async function getRumorResolutionStatus(
  domain: string,
  rumorId: string,
  gun: any
): Promise<{ status: string; trustScore: number; isLocked: boolean }> {
  const rumorNode = getCommunityRumors(domain).get(rumorId);

  return new Promise((resolve) => {
    rumorNode.once((rumorData: any) => {
      resolve({
        status: rumorData?.status ?? 'active',
        trustScore: rumorData?.trust_score ?? 0,
        isLocked: rumorData?.status === 'fact' || rumorData?.status === 'false',
      });
    });
  });
}
