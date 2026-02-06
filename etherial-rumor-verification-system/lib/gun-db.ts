'use client';

import Gun from 'gun';
import 'gun/sea';
import { getGunConfig } from './gun-config';

// Initialize Gun with config from gun-config.ts (single source of truth for relay peers)
const config = getGunConfig();
export const gun = Gun({
  peers: config.peers,
  localStorage: true,  // Enable localStorage as fallback persistence
});

// ── Gun connectivity self-test ──
// Runs once on initialization to verify Gun + relay are operational
if (typeof window !== 'undefined') {
  // Log configured peers
  console.log('[Etherial] 🔧 Gun peers:', config.peers);

  const testKey = `_etherial_test_${Date.now()}`;
  gun.get('_connectivity_test').get(testKey).put({ ts: Date.now() }, (ack: any) => {
    if (ack.err) {
      console.error('[Etherial] ❌ Gun write FAILED:', ack.err);
    } else {
      console.log('[Etherial] ✅ Gun write OK');
      gun.get('_connectivity_test').get(testKey).once((data: any) => {
        if (data?.ts) {
          console.log('[Etherial] ✅ Gun read OK — DB is operational');
        } else {
          console.warn('[Etherial] ⚠️ Gun read returned empty — check IndexedDB');
        }
      });
    }
  });

  // Verify relay reachability
  if (config.peers.length > 0) {
    const relayBase = config.peers[0].replace('/gun', '');
    fetch(`${relayBase}/health`)
      .then(r => r.json())
      .then(d => {
        if (d?.status === 'ok') {
          console.log(`[Etherial] ✅ Relay connected (uptime: ${d.uptime?.toFixed(0)}s)`);
        } else {
          console.warn('[Etherial] ⚠️ Relay responded but status not OK:', d);
        }
      })
      .catch(() => {
        console.error('[Etherial] ❌ Relay unreachable at', relayBase);
        console.error('[Etherial] 💡 Start the relay with: npm run relay');
      });
  } else {
    console.warn('[Etherial] ⚠️ No relay peers configured — data will NOT sync across tabs');
  }
}

// Reference to the main database
export const db = gun.get('etherial');

// Community reference
export const communities = db.get('communities');

// Type definitions for GunDB structures
export interface User {
  publicKey: string;
  domain: string;
  karma: number;
  createdAt: number;
}

export interface Rumor {
  id: string;
  text: string;
  posterPublicKey: string;
  domain: string;
  createdAt: number;
  windowDuration: '12h' | '24h' | '2d' | '5d'; // Duration until voting closes
  windowClosesAt: number;
  status: 'active' | 'fact' | 'false' | 'unverified' | 'ghost' | 'opposed';
  trust_score: number; // Frozen once resolved: ratio of weighted_true / (weighted_true + weighted_false)
  weighted_true: number;
  weighted_false: number;
  total_voters: number;
  total_weight: number;
  oppositions: string[]; // @deprecated — kept for backward compatibility; use oppositionId
  oppositionId?: string; // Scalar: Gun-safe single opposition reference (one-per-fact rule)
  parentRumorId?: string; // If this is an opposition, reference to parent
  extendedOnce: boolean; // Track if extended window has been used
}

export interface Vote {
  voterId: string;
  rumorId: string;
  value: 1 | -1; // 1 for true, -1 for false
  weight: number; // sqrt(voter_karma) at time of vote
  timestamp: number;
}

export interface OppositionChallenge {
  id: string;
  challengerId: string;
  originalRumorId: string;
  domain: string;
  createdAt: number;
  windowClosesAt: number;
  status: 'active' | 'succeeded' | 'failed' | 'ghost';
  trust_score: number;
  weighted_true: number;
  weighted_false: number;
  total_voters: number;
  total_weight: number;
}

/**
 * Get community reference by domain
 */
export function getCommunity(domain: string) {
  return communities.get(domain);
}

/**
 * Get rumors for a specific community
 */
export function getCommunityRumors(domain: string) {
  return getCommunity(domain).get('rumors');
}

/**
 * Get users for a specific community
 */
export function getCommunityUsers(domain: string) {
  return getCommunity(domain).get('users');
}

/**
 * Get votes for a specific rumor
 */
export function getRumorVotes(domain: string, rumorId: string) {
  return getCommunityRumors(domain).get(rumorId).get('votes');
}
