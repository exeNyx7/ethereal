/**
 * Gun.js Configuration & Relay Setup
 * 
 * Single source of truth for:
 * - Relay peer URLs
 * - Known university communities
 * - Environment-specific Gun configuration
 */

/**
 * Default relay peers for P2P synchronization.
 * 
 * The local relay (relay.js) is started automatically with `npm run dev`.
 * It acts as a WebSocket hub so all browser tabs/windows sync in real time.
 */
export const DEFAULT_RELAYS: string[] = [
  'http://localhost:8765/gun',  // Local relay — started by `npm run dev`
];

/**
 * Known university communities for display and discovery
 * Maps email domain → display name
 */
export const KNOWN_COMMUNITIES: Record<string, string> = {
  'nu.edu.pk': 'FAST NUCES',
  'lums.edu.pk': 'LUMS',
  'ict.edu.pk': 'ICT Islamabad',
  'uet.edu.pk': 'UET',
  'iba.edu.pk': 'IBA',
  'seecs.edu.pk': 'SEECS NUST',
  'fc.edu': 'Forman Christian College',
  'giki.edu.pk': 'GIKI',
};

/**
 * Configuration for different environments
 */
export const GUN_CONFIG = {
  development: {
    peers: DEFAULT_RELAYS,
    localStorage: false, // P2P only, no localStorage persistence
    radix: true, // Enable RAD data structure
  },
  production: {
    peers: DEFAULT_RELAYS, // In production, use your own relays
    localStorage: false,
    radix: true,
    // Optional: Add your own relay server
    // peers: ['https://your-relay.example.com/gun', ...DEFAULT_RELAYS]
  },
};

/**
 * Initialize Gun with appropriate config
 * Called from gun-db.ts
 */
export function getGunConfig() {
  const env = process.env.NODE_ENV || 'development';
  return GUN_CONFIG[env as keyof typeof GUN_CONFIG] || GUN_CONFIG.development;
}
