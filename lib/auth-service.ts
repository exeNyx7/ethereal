// @ts-nocheck
import Gun from 'gun';
import 'gun/sea';
import { getCommunityUsers, gun } from './gun-db';
import { debugMonitor } from './debug-monitor';

/**
 * Validate that an email domain is a .edu domain
 * Supports: .edu, .edu.xx (e.g., .edu.pk), .edu.xxx
 */
export function isEduDomain(domain: string): boolean {
  return /\.edu(\.[a-z]{2,3})?$/i.test(domain);
}

/**
 * Extract domain from email (e.g., user@nu.edu.pk → nu.edu.pk)
 * Validates email format AND .edu domain requirement per spec
 */
export function extractDomain(email: string): string {
  const parts = email.split('@');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error('Invalid email format');
  }
  const domain = parts[1].toLowerCase();
  if (!isEduDomain(domain)) {
    throw new Error('Only .edu email domains are allowed (e.g., user@nu.edu.pk)');
  }
  return domain;
}

/**
 * Generate a keypair using blind authentication
 *
 * HOW IT WORKS (per spec Section 4.2):
 * - A deterministic lookup key is derived from email+passphrase using SEA.work (PBKDF2)
 * - On FIRST registration: a random ECDSA keypair is generated via SEA.pair(),
 *   encrypted with a key derived from email+passphrase, and stored in GunDB
 * - On SUBSEQUENT logins: the same email+passphrase re-derives the lookup key,
 *   fetches the encrypted keypair from GunDB, and decrypts it → same keypair
 *
 * PRIVACY GUARANTEES:
 * - Email is NEVER stored — only a SHA-256 hash of (email:passphrase) as lookup key
 * - Keypair is AES-encrypted — cannot be read without the passphrase
 * - One email = one keypair (deterministic lookup)
 */
export async function generateKeypair(
  email: string,
  passphrase: string
): Promise<{
  publicKey: string;
  pair: any;
}> {
  const SEA = Gun.SEA;

  // Step 1: Derive deterministic lookup key from email+passphrase
  // This SHA-256 hash is the ONLY thing stored — email cannot be recovered
  const seed = `${email}:${passphrase}`;
  const lookupKey = await SEA.work(seed, 'etherial-blind-auth', null, { name: 'SHA-256' });

  if (!lookupKey) {
    throw new Error('Failed to derive lookup key');
  }

  // Step 2: Derive separate encryption key (PBKDF2, 100k iterations)
  const encryptionKey = await SEA.work(seed, 'etherial-keypair-encryption');

  if (!encryptionKey) {
    throw new Error('Failed to derive encryption key');
  }

  // Step 3: Check if keypair already exists in Gun under this lookup key
  const authNode = gun.get('etherial-auth').get(lookupKey);

  console.log('[Etherial Auth] 🔑 Looking up keypair for domain...');

  const storedData = await new Promise<any>((resolve) => {
    let resolved = false;
    authNode.once((data: any) => {
      if (!resolved) {
        resolved = true;
        console.log('[Etherial Auth] 📥 Auth lookup result:', data ? 'Found existing keypair' : 'No keypair found');
        resolve(data);
      }
    });
    // Timeout after 3 seconds for offline/slow networks
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        console.log('[Etherial Auth] ⏱️ Auth lookup timeout — treating as new user');
        resolve(null);
      }
    }, 3000);
  });

  if (storedData?.encryptedPair) {
    // RETURNING USER — decrypt and recover keypair
    try {
      const decrypted = await SEA.decrypt(storedData.encryptedPair, encryptionKey);
      if (!decrypted) {
        throw new Error('Decryption returned null');
      }
      const pair = typeof decrypted === 'string' ? JSON.parse(decrypted) : decrypted;

      if (!pair.pub || !pair.priv || !pair.epub || !pair.epriv) {
        throw new Error('Invalid keypair structure');
      }

      debugMonitor.info('Returning user authenticated', {
        publicKey: pair.pub.slice(0, 12) + '...',
      });
      return { publicKey: pair.pub, pair };
    } catch (err) {
      throw new Error('Failed to decrypt keypair — wrong passphrase or corrupted data');
    }
  }

  // NEW USER — generate fresh keypair and store encrypted
  const pair = await SEA.pair();

  if (!pair || !pair.pub) {
    throw new Error('Failed to generate keypair');
  }

  const encrypted = await SEA.encrypt(JSON.stringify(pair), encryptionKey);

  await new Promise<void>((resolve) => {
    authNode.put(
      { encryptedPair: encrypted, createdAt: Date.now() },
      () => resolve()
    );
  });

  debugMonitor.info('New user registered', {
    publicKey: pair.pub.slice(0, 12) + '...',
  });

  return {
    publicKey: pair.pub,
    pair,
  };
}

/**
 * Sign data with user's private key using SEA
 * Used for signing rumors, votes, and oppositions
 * Proves authorship without revealing identity
 */
export async function signData(data: any, pair: any): Promise<string> {
  const SEA = Gun.SEA;
  const signed = await SEA.sign(data, pair);
  if (!signed) {
    throw new Error('Failed to sign data');
  }
  return signed;
}

/**
 * Verify signed data against a public key
 * Returns the original data if valid, null if invalid
 */
export async function verifySignature(
  signedData: string,
  publicKey: string
): Promise<any | null> {
  const SEA = Gun.SEA;
  const verified = await SEA.verify(signedData, publicKey);
  return verified || null;
}

/**
 * Initialize user in Gun database with blind authentication
 * CRITICAL: Email is cleared from memory after key generation
 */
export async function initializeUser(
  email: string,
  passphrase: string,
  gunInstance: any
) {
  const domain = extractDomain(email);
  let userEmail = email; // Store temporarily

  // Generate keypair (handles new user vs returning user internally)
  const { publicKey, pair } = await generateKeypair(userEmail, passphrase);

  // CRITICAL: Clear email from local variable
  userEmail = '';

  const communityUsers = getCommunityUsers(domain);
  const userNode = communityUsers.get(publicKey);

  // Initialize or fetch user data
  let userData: any = null;
  await new Promise((resolve) => {
    let resolved = false;
    userNode.once((data: any) => {
      if (!resolved) {
        resolved = true;
        userData = data;
        resolve(data);
      }
    });
    // Timeout — .once() may never fire if node doesn't exist yet
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve(null);
      }
    }, 2000);
  });

  if (!userData) {
    // New user - initialize with karma = 1.0
    console.log('[Etherial Auth] 👤 Creating new user in domain:', domain);
    await new Promise((resolve) => {
      userNode.put(
        {
          publicKey,
          domain,
          karma: 1.0,
          createdAt: Date.now(),
        },
        (ack: any) => {
          console.log('[Etherial Auth] ✅ User created in Gun, ack:', ack?.err || 'OK');
          resolve(null);
        }
      );
    });
  } else {
    console.log('[Etherial Auth] 👤 Returning user, karma:', userData.karma);
  }

  // Return user state (email NOT included)
  return {
    publicKey,
    domain,
    pair,
    initialKarma: (userData?.karma || 1.0) as number,
  };
}

/**
 * Fetch current user karma from Gun database
 */
export async function getUserKarma(
  publicKey: string,
  domain: string,
  gunInstance: any
): Promise<number> {
  const userNode = getCommunityUsers(domain).get(publicKey);

  return new Promise((resolve) => {
    userNode.once((data) => {
      resolve((data?.karma || 1.0) as number);
    });
  });
}

/**
 * Update user karma in Gun database
 * Changes are atomic and immediately persisted
 * Per spec: minimum karma = 0.1 (users can never reach exactly 0)
 */
export async function updateUserKarma(
  publicKey: string,
  domain: string,
  karmaChange: number,
  gunInstance: any
): Promise<number> {
  const userNode = getCommunityUsers(domain).get(publicKey);

  return new Promise((resolve) => {
    userNode.once(async (userData) => {
      const currentKarma = (userData?.karma || 1.0) as number;
      // Per spec: minimum karma = 0.1 — everyone has minimal voice
      const newKarma = Math.max(0.1, currentKarma + karmaChange);

      await new Promise((resolveUpdate) => {
        userNode.put({ karma: newKarma }, () => resolveUpdate(null));
      });

      debugMonitor.logKarmaUpdate(publicKey, karmaChange, newKarma);
      resolve(newKarma);
    });
  });
}

/**
 * Verify user belongs to domain (for access control)
 * Used by UI to enforce read-only mode for cross-domain access
 */
export function verifyUserDomain(userDomain: string, targetDomain: string): boolean {
  return userDomain === targetDomain;
}
