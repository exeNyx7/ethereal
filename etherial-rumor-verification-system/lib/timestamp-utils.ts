/**
 * Timestamp synchronization utilities for P2P network
 * Handles clock skew and concurrent vote timing
 */

// Maximum allowed clock skew between peers (5 seconds)
const MAX_CLOCK_SKEW = 5000;

/**
 * Get current timestamp with optional tolerance
 * Used for voting window checks that account for network latency
 */
export function getCurrentTimestamp(tolerance: number = 0): number {
  return Date.now() - tolerance;
}

/**
 * Check if a voting window is still open
 * Includes tolerance for network latency
 */
export function isVotingWindowOpen(windowClosesAt: number, toleranceMs: number = 1000): boolean {
  const currentTime = Date.now();
  // Add tolerance to current time to account for latency
  return currentTime + toleranceMs < windowClosesAt;
}

/**
 * Check if a voting window has just closed (within tolerance)
 * Used to handle concurrent votes near window close
 */
export function isVotingWindowJustClosed(
  windowClosesAt: number,
  toleranceMs: number = 2000
): boolean {
  const currentTime = Date.now();
  return currentTime >= windowClosesAt && currentTime - windowClosesAt <= toleranceMs;
}

/**
 * Calculate time remaining in voting window (ms)
 * Returns 0 if window is closed
 */
export function getTimeRemaining(windowClosesAt: number): number {
  const remaining = windowClosesAt - Date.now();
  return Math.max(0, remaining);
}

/**
 * Convert milliseconds to human-readable time
 */
export function formatTimeRemaining(ms: number): string {
  if (ms <= 0) return 'Closed';

  const hours = Math.floor(ms / (60 * 60 * 1000));
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

/**
 * Check for clock skew between local time and server timestamp
 * Returns true if skew is within acceptable range
 */
export function validateClockSkew(remoteTimestamp: number, maxSkew: number = MAX_CLOCK_SKEW): boolean {
  const skew = Math.abs(Date.now() - remoteTimestamp);
  return skew <= maxSkew;
}

/**
 * Handle concurrent votes submitted at the same millisecond
 * Returns deterministic tiebreaker based on voter public key
 */
export function resolveConcurrentVoteTiebreaker(
  timestamp: number,
  voterPublicKey: string
): number {
  // Create deterministic hash of voter key for tiebreaker
  let hash = 0;
  for (let i = 0; i < voterPublicKey.length; i++) {
    hash = ((hash << 5) - hash) + voterPublicKey.charCodeAt(i);
    hash |= 0; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}
