import { getCommunityRumors, getCommunityUsers, getRumorVotes, type Rumor, type Vote } from './gun-db';
import { resolveRumor, updateKarmaAfterResolution } from './rumor-engine';
import { debugMonitor } from './debug-monitor';

/**
 * Soft delete a rumor by marking it as 'ghost'
 * SPEC 4.8: vote_contributions are "Zeroed out" — karma from this rumor's resolution is reversed.
 * Also triggers cascading recalculation of any rumors that reference this one.
 */
export async function ghostRumor(
  domain: string,
  rumorId: string,
  gun: any
): Promise<void> {
  const rumorNode = getCommunityRumors(domain).get(rumorId);

  // Fetch the rumor BEFORE ghosting so we know its resolved status
  const rumorData = await new Promise<Rumor>((resolve) => {
    rumorNode.once((data: any) => resolve(data as Rumor));
  });

  if (!rumorData) {
    debugMonitor.warn(`Ghost: rumor ${rumorId} not found`);
    return;
  }

  if (rumorData.status === 'ghost') {
    debugMonitor.warn(`Ghost: rumor ${rumorId} already ghosted`);
    return;
  }

  // ── Step 1: Reverse karma changes from the rumor's resolution ──
  // Spec: "vote_contributions: Zeroed out — ghost's votes no longer affect any calculations"
  const wasResolved = rumorData.status === 'fact' || rumorData.status === 'false';

  if (wasResolved) {
    await reverseResolutionKarma(domain, rumorId, rumorData, gun);
  }

  // ── Step 2: Mark as ghost and nullify trust score ──
  await new Promise<void>((resolve) => {
    rumorNode.put(
      {
        status: 'ghost',
        trust_score: 0,
        ghostedAt: Date.now(),
        votesNullified: true,
      },
      () => resolve()
    );
  });

  debugMonitor.info(`Rumor ${rumorId} marked as ghost (karma reversed: ${wasResolved})`);

  // ── Step 3: Trigger cascade recalculation ──
  await cascadeRecalculateRumors(domain, rumorId, gun);
}

/**
 * Reverse all karma changes that were applied when the ghosted rumor was resolved.
 * This effectively "zeroes out" the ghost's vote contributions.
 *
 * If the rumor was FACT:
 *   - TRUE voters had +1.0 → now -1.0 (reversal)
 *   - FALSE voters had -1.5 → now +1.5 (reversal)
 *   - Poster had +2.0 → now -2.0 (reversal)
 *
 * If the rumor was FALSE:
 *   - FALSE voters had +1.0 → now -1.0 (reversal)
 *   - TRUE voters had -1.5 → now +1.5 (reversal)
 *   - Poster had -2.0 → now +2.0 (reversal)
 *
 * Karma floor of 0.1 is enforced on every update.
 */
async function reverseResolutionKarma(
  domain: string,
  rumorId: string,
  rumor: Rumor,
  gun: any
): Promise<void> {
  debugMonitor.info(`Reversing karma for ghosted rumor ${rumorId} (was ${rumor.status})`);

  // Fetch all votes on this rumor
  const votesNode = getRumorVotes(domain, rumorId);
  const votes: Array<{ voterId: string; value: number }> = [];

  await new Promise<void>((resolve) => {
    votesNode.once((data: any) => {
      if (!data || typeof data !== 'object') {
        resolve();
        return;
      }
      const voteIds = Object.keys(data).filter((k) => k !== '_');
      if (voteIds.length === 0) {
        resolve();
        return;
      }
      let count = 0;
      voteIds.forEach((voteId) => {
        votesNode.get(voteId).once((voteData: any) => {
          if (voteData?.voterId && voteData.value !== undefined) {
            votes.push({ voterId: voteData.voterId, value: voteData.value });
          }
          count++;
          if (count === voteIds.length) resolve();
        });
      });
    });
  });

  const isFact = rumor.status === 'fact';
  const winningVote = isFact ? 1 : -1;

  // Reverse voter karma
  for (const vote of votes) {
    let karmaReversal: number;

    if (vote.value === winningVote) {
      // Winner had received +1.0, reverse it
      karmaReversal = -1.0;
    } else {
      // Loser had received -1.5, reverse it
      karmaReversal = 1.5;
    }

    const voterNode = getCommunityUsers(domain).get(vote.voterId);
    await new Promise<void>((resolve) => {
      voterNode.once((userData: any) => {
        const current = userData?.karma ?? 1.0;
        const newKarma = Math.max(0.1, current + karmaReversal);
        voterNode.put({ karma: newKarma }, () => resolve());
        debugMonitor.logKarmaUpdate(vote.voterId, karmaReversal, newKarma);
      });
    });
  }

  // Reverse poster karma
  if (rumor.posterPublicKey) {
    let posterReversal: number;
    if (isFact) {
      // Poster had received +2.0 for FACT, reverse it
      posterReversal = -2.0;
    } else {
      // Poster had received -2.0 for FALSE, reverse it
      posterReversal = 2.0;
    }

    const posterNode = getCommunityUsers(domain).get(rumor.posterPublicKey);
    await new Promise<void>((resolve) => {
      posterNode.once((userData: any) => {
        const current = userData?.karma ?? 1.0;
        const newKarma = Math.max(0.1, current + posterReversal);
        posterNode.put({ karma: newKarma }, () => resolve());
        debugMonitor.logKarmaUpdate(rumor.posterPublicKey, posterReversal, newKarma);
      });
    });
  }

  debugMonitor.info(`Reversed karma for ${votes.length} voters + poster on ghost ${rumorId}`);
}

/**
 * Find all rumors that reference the ghosted rumor and recalculate their trust scores
 * This ensures data integrity across the P2P network when references change
 */
async function cascadeRecalculateRumors(
  domain: string,
  ghostedRumorId: string,
  gun: any
): Promise<void> {
  debugMonitor.info(`Starting cascade recalculation for ghosts referencing ${ghostedRumorId}`);

  try {
    // Get all rumors in the community
    const rumorsNode = getCommunityRumors(domain);

    const allRumors: Record<string, Rumor> = {};

    await new Promise<void>((resolve) => {
      rumorsNode.once((data: any) => {
        if (!data || typeof data !== 'object') {
          resolve();
          return;
        }

        const rumorIds = Object.keys(data).filter((k) => k !== '_');
        if (rumorIds.length === 0) {
          resolve();
          return;
        }

        let loadedCount = 0;

        rumorIds.forEach((rumorId) => {
          rumorsNode.get(rumorId).once((rumorData: any) => {
            if (rumorData && rumorData.id) {
              allRumors[rumorId] = rumorData as Rumor;
            }
            loadedCount++;
            if (loadedCount === rumorIds.length) {
              resolve();
            }
          });
        });
      });
    });

    // Find rumors that reference the ghosted rumor (parentRumorId or oppositionId/oppositions)
    const affectedRumors = Object.values(allRumors).filter(
      (rumor) =>
        rumor.parentRumorId === ghostedRumorId ||
        rumor.oppositionId === ghostedRumorId ||
        rumor.oppositions?.includes(ghostedRumorId)
    );

    debugMonitor.info(`Found ${affectedRumors.length} rumors affected by ghost`);

    // Recalculate trust scores for affected rumors
    for (const rumor of affectedRumors) {
      // Skip ghosts — don't recalculate already-ghosted rumors
      if (rumor.status === 'ghost') {
        debugMonitor.debug(`Skipping ghost ${rumor.id} during cascade`);
        continue;
      }

      if (rumor.status === 'active' || rumor.status === 'opposed') {
        // Rumor still in voting or under challenge - skip
        continue;
      }

      // For resolved rumors, recalculate their trust score
      // (In case the parent ghost affects the interpretation)
      const resolution = await resolveRumor(domain, rumor.id, gun);

      if (resolution.status !== 'pending') {
        await updateKarmaAfterResolution(domain, rumor.id, resolution, gun);
        debugMonitor.info(`Recalculated ${rumor.id} after cascade`);
      }
    }
  } catch (error) {
    debugMonitor.error('Cascade recalculation failed', error);
  }
}

/**
 * Check if a rumor or its parent is ghosted
 * Used by feed filter to show warnings
 */
export async function checkGhostStatus(
  domain: string,
  rumor: Rumor,
  gun: any
): Promise<{
  isGhost: boolean;
  parentGhost: boolean;
}> {
  return {
    isGhost: rumor.status === 'ghost',
    parentGhost: rumor.parentRumorId ? await isRumorGhost(domain, rumor.parentRumorId, gun) : false,
  };
}

/**
 * Check if a specific rumor is ghosted
 */
async function isRumorGhost(domain: string, rumorId: string, gun: any): Promise<boolean> {
  const rumorNode = getCommunityRumors(domain).get(rumorId);

  return new Promise((resolve) => {
    rumorNode.once((rumorData: any) => {
      resolve(rumorData?.status === 'ghost');
    });
  });
}

/**
 * Apply feed filter - exclude ghost rumors
 * This is used in feed queries to prevent ghosts from appearing
 */
export function filterGhosts<T extends { status: string }>(rumors: T[]): T[] {
  return rumors.filter((rumor) => rumor.status !== 'ghost');
}
