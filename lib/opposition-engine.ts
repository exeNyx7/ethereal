import { getCommunityRumors, getCommunityUsers, getRumorVotes, type Rumor, type Vote } from './gun-db';
import { calculateReputationWeightedTrustScore, applyAsymmetricKarmaUpdates } from './reputation-logic';
import { ghostRumor, checkGhostStatus, filterGhosts } from './ghost-system';
import { debugMonitor } from './debug-monitor';

// Opposition mechanics constants (per spec Section 4.5 & 4.7)
const OPPOSITION_KARMA_THRESHOLD = 50; // Minimum karma to challenge a FACT
const OPPOSITION_PENALTY = 5.0; // Karma penalty for ALL opposition voters on loss
const OPPOSITION_REWARD = 3.0; // Karma reward for opposition voters on win
const ORIGINAL_VOTER_PENALTY = 4.0; // Karma penalty for original FACT voters when overturned
const ORIGINAL_POSTER_PENALTY = 4.0; // Karma penalty for original poster when overturned
const ORIGINAL_VOTER_REWARD = 1.0; // Karma reward for original FACT voters when opposition fails
const OPPOSITION_WINDOW_DURATION = 24 * 60 * 60 * 1000; // 1-2 days in ms

/**
 * Fetch all votes for a rumor/opposition as key-value pairs
 * Returns record of voteId → vote data
 */
async function fetchVotesForResolution(
  domain: string,
  rumorId: string
): Promise<Record<string, Vote>> {
  const votesNode = getRumorVotes(domain, rumorId);
  return new Promise((resolve) => {
    const votes: Record<string, Vote> = {};
    votesNode.once((data: any) => {
      if (!data || typeof data !== 'object') {
        resolve({});
        return;
      }
      const voteIds = Object.keys(data).filter((k) => k !== '_');
      if (voteIds.length === 0) {
        resolve({});
        return;
      }
      let count = 0;
      voteIds.forEach((voteId) => {
        votesNode.get(voteId).once((voteData: any) => {
          if (voteData?.voterId) {
            votes[voteId] = voteData as Vote;
          }
          count++;
          if (count === voteIds.length) resolve(votes);
        });
      });
    });
  });
}

export interface OppositionData {
  id: string;
  originalRumorId: string;
  opposerId: string;
  domain: string;
  text: string;
  reason: string;
  status: 'active' | 'succeeded' | 'failed' | 'ghost';
  createdAt: number;
  expiresAt: number;
  posterId?: string;
  trust_score?: number;
  signature?: string;
}

/**
 * PROMPT B: Opposition Mechanism
 * 
 * Check if a user meets the karma threshold to challenge a FACT.
 * If they do, create a new GunDB node linked to the target rumor.
 * The opposition challenge creates a new voting window (1-2 days).
 */
export async function createOppositionChallenge(
  domain: string,
  originalRumorId: string,
  opposerId: string,
  oppositionText: string,
  oppositionReason: string,
  durationHours: number, // 24-48 hours
  gun: any,
  signature?: string
): Promise<{ success: boolean; message: string; oppositionId?: string }> {
  
  debugMonitor.info('Creating opposition challenge', { originalRumorId });

  try {
    // Step 1: Verify the original rumor exists and is FACT
    const rumorNode = getCommunityRumors(domain).get(originalRumorId);
    const originalRumor = await new Promise<Rumor>((resolve) => {
      rumorNode.once((data: any) => {
        resolve(data as Rumor);
      });
    });

    if (!originalRumor) {
      return { success: false, message: 'Original rumor not found' };
    }

    if (originalRumor.status !== 'fact') {
      return { success: false, message: 'Can only oppose rumors marked as FACT' };
    }

    // Step 1.5: One-opposition-per-fact rule (spec: once failed, permanently locked)
    // Use scalar oppositionId (Gun-safe) with fallback to legacy array
    if (originalRumor.oppositionId) {
      return {
        success: false,
        message: 'This fact has already been challenged. Only one opposition per fact is allowed.',
      };
    }
    const existingOppositions = originalRumor.oppositions;
    if (existingOppositions && Array.isArray(existingOppositions) && existingOppositions.length > 0) {
      return {
        success: false,
        message: 'This fact has already been challenged. Only one opposition per fact is allowed.',
      };
    }

    // Step 2: Check if opposition poster meets karma threshold
    const userNode = getCommunityUsers(domain).get(opposerId);
    const userData = await new Promise<any>((resolve) => {
      userNode.once((data: any) => {
        resolve(data);
      });
    });

    const userKarma = userData?.karma ?? 0;

    if (userKarma < OPPOSITION_KARMA_THRESHOLD) {
      return {
        success: false,
        message: `Insufficient karma to challenge. Required: ${OPPOSITION_KARMA_THRESHOLD}, Current: ${userKarma}`,
      };
    }

    debugMonitor.info(`User ${opposerId} meets karma threshold (${userKarma} >= ${OPPOSITION_KARMA_THRESHOLD})`);

    // Step 3: Create opposition rumor node linked to original
    const oppositionId = `opposition_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const now = Date.now();
    const expiresAt = now + durationHours * 60 * 60 * 1000;

    const oppositionRumor: OppositionData = {
      id: oppositionId,
      originalRumorId,
      opposerId,
      domain,
      text: oppositionText,
      reason: oppositionReason,
      status: 'active',
      createdAt: now,
      expiresAt,
      posterId: opposerId,
      ...(signature ? { signature } : {}),
    };

    // Write opposition to GunDB
    const rumorsNode = getCommunityRumors(domain);
    await new Promise<void>((resolve) => {
      rumorsNode.get(oppositionId).put(oppositionRumor, () => resolve());
    });

    // Link opposition to original rumor using Gun-safe scalar property
    // Also set status to 'opposed' (indicates under challenge)
    await new Promise<void>((resolve) => {
      rumorNode.put({ oppositionId, status: 'opposed' }, () => resolve());
    });

    debugMonitor.info(`Opposition ${oppositionId} created and linked to ${originalRumorId}`);

    return {
      success: true,
      message: 'Opposition challenge created successfully',
      oppositionId,
    };
  } catch (error) {
    debugMonitor.error('Error creating opposition challenge', error);
    return { success: false, message: 'Failed to create opposition challenge' };
  }
}

/**
 * Resolve an opposition challenge
 * Called when the opposition voting window closes.
 *
 * Spec karma consequences (Section 4.7):
 *
 * OPPOSITION SUCCEEDS (overturns FACT):
 *   - Original FACT voters: -4.0 each
 *   - Original rumor poster: -4.0
 *   - Opposition voters (upvoted opposition): +3.0 each
 *   - Original rumor → status: 'false'
 *   - Opposition → status: 'succeeded'
 *
 * OPPOSITION FAILS (FACT stands):
 *   - All opposition voters: -5.0 each
 *   - Original FACT voters: +1.0 each
 *   - Original rumor → status: 'fact' (restored from 'opposed')
 *   - Opposition → status: 'failed'
 *   - Fact is permanently locked — can never be challenged again
 */
export async function resolveOppositionChallenge(
  domain: string,
  oppositionId: string,
  gun: any
): Promise<void> {
  debugMonitor.info('Resolving opposition challenge', { oppositionId });

  try {
    const rumorsNode = getCommunityRumors(domain);
    const oppositionNode = rumorsNode.get(oppositionId);

    const opposition = await new Promise<OppositionData>((resolve) => {
      oppositionNode.once((data: any) => {
        resolve(data as OppositionData);
      });
    });

    if (!opposition || opposition.status !== 'active') {
      debugMonitor.warn('Opposition not found or already resolved');
      return;
    }

    // Calculate trust score for opposition voting
    const result = await calculateReputationWeightedTrustScore(domain, oppositionId, gun);

    debugMonitor.info('Opposition result', { status: result.status, ratio: result.ratio });

    // Fetch opposition votes and original rumor votes for karma distribution
    const oppositionVotes = await fetchVotesForResolution(domain, oppositionId);
    const originalVotes = await fetchVotesForResolution(domain, opposition.originalRumorId);

    if (result.status === 'fact') {
      // ─── OPPOSITION SUCCEEDS ─── original FACT overturned
      debugMonitor.info('Opposition WON — original FACT overturned');

      // 1. Penalize all original FACT voters: -4.0 each
      for (const voteId of Object.keys(originalVotes)) {
        const vote = originalVotes[voteId];
        if (vote?.voterId && vote.value === 1) {
          // Only penalize those who voted TRUE on the original (i.e., supported the now-wrong fact)
          const voterNode = getCommunityUsers(domain).get(vote.voterId);
          await new Promise<void>((resolve) => {
            voterNode.once((userData: any) => {
              const current = userData?.karma ?? 1.0;
              const newKarma = Math.max(0.1, current - ORIGINAL_VOTER_PENALTY);
              voterNode.put({ karma: newKarma }, () => resolve());
              debugMonitor.logKarmaUpdate(vote.voterId, -ORIGINAL_VOTER_PENALTY, newKarma);
            });
          });
        }
      }

      // 2. Penalize original rumor poster: -4.0
      const originalRumorNode = rumorsNode.get(opposition.originalRumorId);
      const originalRumor = await new Promise<Rumor>((resolve) => {
        originalRumorNode.once((data: any) => resolve(data as Rumor));
      });

      if (originalRumor?.posterPublicKey) {
        const posterNode = getCommunityUsers(domain).get(originalRumor.posterPublicKey);
        await new Promise<void>((resolve) => {
          posterNode.once((userData: any) => {
            const current = userData?.karma ?? 1.0;
            const newKarma = Math.max(0.1, current - ORIGINAL_POSTER_PENALTY);
            posterNode.put({ karma: newKarma }, () => resolve());
            debugMonitor.logKarmaUpdate(originalRumor.posterPublicKey, -ORIGINAL_POSTER_PENALTY, newKarma);
          });
        });
      }

      // 3. Reward all opposition voters (upvoted the opposition): +3.0 each
      for (const voteId of Object.keys(oppositionVotes)) {
        const vote = oppositionVotes[voteId];
        if (vote?.voterId && vote.value === 1) {
          const voterNode = getCommunityUsers(domain).get(vote.voterId);
          await new Promise<void>((resolve) => {
            voterNode.once((userData: any) => {
              const current = userData?.karma ?? 1.0;
              const newKarma = current + OPPOSITION_REWARD;
              voterNode.put({ karma: newKarma }, () => resolve());
              debugMonitor.logKarmaUpdate(vote.voterId, OPPOSITION_REWARD, newKarma);
            });
          });
        }
      }

      // 4. Mark original rumor as false
      originalRumorNode.put({
        status: 'false',
        trust_score: 1 - result.trustScore,
        resolution_time: Date.now(),
      });

      // 5. Mark opposition as succeeded
      oppositionNode.put({ status: 'succeeded' });

    } else {
      // ─── OPPOSITION FAILS ─── FACT stands
      debugMonitor.info('Opposition LOST — original FACT stands');

      // 1. Penalize ALL opposition voters: -5.0 each (not just the poster)
      for (const voteId of Object.keys(oppositionVotes)) {
        const vote = oppositionVotes[voteId];
        if (vote?.voterId) {
          const voterNode = getCommunityUsers(domain).get(vote.voterId);
          await new Promise<void>((resolve) => {
            voterNode.once((userData: any) => {
              const current = userData?.karma ?? 1.0;
              const newKarma = Math.max(0.1, current - OPPOSITION_PENALTY);
              voterNode.put({ karma: newKarma }, () => resolve());
              debugMonitor.logKarmaUpdate(vote.voterId, -OPPOSITION_PENALTY, newKarma);
            });
          });
        }
      }

      // 2. Reward original FACT voters: +1.0 each
      for (const voteId of Object.keys(originalVotes)) {
        const vote = originalVotes[voteId];
        if (vote?.voterId && vote.value === 1) {
          const voterNode = getCommunityUsers(domain).get(vote.voterId);
          await new Promise<void>((resolve) => {
            voterNode.once((userData: any) => {
              const current = userData?.karma ?? 1.0;
              const newKarma = current + ORIGINAL_VOTER_REWARD;
              voterNode.put({ karma: newKarma }, () => resolve());
              debugMonitor.logKarmaUpdate(vote.voterId, ORIGINAL_VOTER_REWARD, newKarma);
            });
          });
        }
      }

      // 3. Restore original rumor status from 'opposed' back to 'fact'
      const originalRumorNode = rumorsNode.get(opposition.originalRumorId);
      originalRumorNode.put({ status: 'fact' });

      // 4. Mark opposition as failed (fact is now permanently locked)
      oppositionNode.put({ status: 'failed' });
    }
  } catch (error) {
    debugMonitor.error('Error resolving opposition challenge', error);
  }
}

/**
 * Get opposition challenges for a rumor
 * Uses scalar oppositionId (Gun-safe) with fallback to legacy oppositions array
 */
export async function getOppositionChallenges(
  domain: string,
  rumorId: string,
  gun: any
): Promise<OppositionData[]> {
  const rumorsNode = getCommunityRumors(domain);
  const rumorNode = rumorsNode.get(rumorId);

  return new Promise((resolve) => {
    rumorNode.once((rumorData: any) => {
      // Prefer Gun-safe scalar oppositionId
      if (rumorData?.oppositionId) {
        rumorsNode.get(rumorData.oppositionId).once((oppData: any) => {
          if (oppData) {
            resolve([oppData as OppositionData]);
          } else {
            resolve([]);
          }
        });
        return;
      }

      // Fallback: legacy array
      if (!rumorData?.oppositions || !Array.isArray(rumorData.oppositions)) {
        resolve([]);
        return;
      }

      const oppositions: OppositionData[] = [];
      let loadedCount = 0;

      rumorData.oppositions.forEach((oppId: string) => {
        rumorsNode.get(oppId).once((oppData: any) => {
          if (oppData) {
            oppositions.push(oppData as OppositionData);
          }
          loadedCount++;
          if (loadedCount === rumorData.oppositions.length) {
            resolve(oppositions);
          }
        });
      });
    });
  });
}

// Re-export ghost functions from the canonical ghost-system module
export { ghostRumor, checkGhostStatus, filterGhosts } from './ghost-system';
