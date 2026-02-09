import { getCommunityRumors, type Rumor } from './gun-db';
import { resolveRumor, updateKarmaAfterResolution } from './rumor-engine';
import { resolveOppositionChallenge } from './opposition-engine';
import { gun } from './gun-db';
import { debugMonitor } from './debug-monitor';

const SCAN_INTERVAL_MS = 30_000; // Scan every 30 seconds

let intervalId: ReturnType<typeof setInterval> | null = null;
let activeDomain: string | null = null;

/**
 * Scan a community for expired-but-unresolved rumors and resolve them.
 * Runs as a background task on each peer (P2P — every client helps resolve).
 */
async function scanAndResolve(domain: string): Promise<void> {
  try {
    const rumorsNode = getCommunityRumors(domain);

    const allRumors: Record<string, Rumor> = {};

    await new Promise<void>((resolve) => {
      let loaded = false;
      rumorsNode.once((data: any) => {
        if (!loaded) {
          loaded = true;
          if (data && typeof data === 'object') {
            const keys = Object.keys(data).filter((k) => k !== '_');
            if (keys.length === 0) {
              resolve();
              return;
            }
            let count = 0;
            keys.forEach((id) => {
              let innerDone = false;
              rumorsNode.get(id).once((rumorData: any) => {
                if (innerDone) return;
                innerDone = true;
                if (rumorData?.id) {
                  allRumors[id] = rumorData as Rumor;
                }
                count++;
                if (count === keys.length) resolve();
              });
              // Guard: inner .once() might not fire for non-existent nodes
              setTimeout(() => {
                if (!innerDone) {
                  innerDone = true;
                  count++;
                  if (count === keys.length) resolve();
                }
              }, 3000);
            });
          } else {
            resolve();
          }
        }
      });
      setTimeout(() => {
        if (!loaded) {
          loaded = true;
          resolve();
        }
      }, 5000);
    });

    const now = Date.now();
    const expired = Object.values(allRumors).filter(
      (r) => r.status === 'active' && r.windowClosesAt < now
    );

    if (expired.length === 0) return;

    debugMonitor.info(`Resolution scheduler: found ${expired.length} expired rumors in ${domain}`);

    for (const rumor of expired) {
      try {
        const resolution = await resolveRumor(domain, rumor.id, gun);
        if (resolution.status !== 'pending') {
          await updateKarmaAfterResolution(domain, rumor.id, resolution, gun);
          debugMonitor.info(`Auto-resolved ${rumor.id} → ${resolution.status}`);
        }
      } catch (err) {
        debugMonitor.error(`Failed to auto-resolve ${rumor.id}`, err);
      }
    }

    // Also scan for expired opposition challenges
    const expiredOppositions = Object.values(allRumors).filter(
      (r: any) => r.status === 'active' && r.originalRumorId && r.expiresAt && r.expiresAt < now
    );

    if (expiredOppositions.length > 0) {
      debugMonitor.info(`Resolution scheduler: found ${expiredOppositions.length} expired oppositions in ${domain}`);
    }

    for (const opp of expiredOppositions) {
      try {
        await resolveOppositionChallenge(domain, opp.id, gun);
        debugMonitor.info(`Auto-resolved opposition ${opp.id}`);
      } catch (err) {
        debugMonitor.error(`Failed to auto-resolve opposition ${opp.id}`, err);
      }
    }
  } catch (err) {
    debugMonitor.error('Resolution scheduler scan failed', err);
  }
}

/**
 * Start the resolution scheduler for a given community domain.
 * Only one scheduler runs at a time — switching domains stops the old one.
 */
export function startResolutionScheduler(domain: string): void {
  // Stop existing scheduler if domain changed
  if (intervalId && activeDomain !== domain) {
    stopResolutionScheduler();
  }

  if (intervalId) return; // Already running for this domain

  activeDomain = domain;
  debugMonitor.info(`Resolution scheduler started for ${domain}`);

  // Run immediately on start
  scanAndResolve(domain);

  // Then run periodically
  intervalId = setInterval(() => {
    scanAndResolve(domain);
  }, SCAN_INTERVAL_MS);
}

/**
 * Stop the resolution scheduler.
 */
export function stopResolutionScheduler(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    debugMonitor.info(`Resolution scheduler stopped for ${activeDomain}`);
    activeDomain = null;
  }
}
