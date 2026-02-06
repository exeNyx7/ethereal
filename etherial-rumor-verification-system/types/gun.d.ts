/**
 * GunDB type declarations for Etherial
 * Provides TypeScript types for gun and gun/sea modules
 */

declare module 'gun' {
  interface GunOptions {
    peers?: string[];
    localStorage?: boolean;
    radisk?: boolean;
    file?: string;
    web?: any;
    multicast?: boolean;
    [key: string]: any;
  }

  interface GunChainReference {
    /** Navigate to a sub-node */
    get(key: string): GunChainReference;
    /** Write data to a node */
    put(data: any, callback?: (ack: { err?: string; ok?: number }) => void): GunChainReference;
    /** Add data to a set (unordered list) */
    set(data: any, callback?: (ack: { err?: string; ok?: number }) => void): GunChainReference;
    /** Subscribe to real-time updates (persistent listener) */
    on(callback: (data: any, key: string) => void): GunChainReference;
    /** Read data once */
    once(callback?: (data: any, key: string) => void): GunChainReference;
    /** Unsubscribe from updates */
    off(): void;
    /** Map over set items */
    map(callback?: (data: any, key: string) => any): GunChainReference;
    /** Navigate back to parent context */
    back(amount?: number): GunChainReference;
    /** Access the user graph (SEA-authenticated) */
    user(publicKey?: string): GunChainReference;
  }

  interface GunConstructor {
    new (options?: GunOptions): GunChainReference;
    (options?: GunOptions): GunChainReference;
    SEA: GunSEA;
  }

  const Gun: GunConstructor;
  export default Gun;
}

declare module 'gun/sea' {
  export {};
}

interface GunSEA {
  /** Generate a new random ECDSA keypair */
  pair(callback?: (pair: SEAKeyPair) => void): Promise<SEAKeyPair>;

  /** Sign data with a keypair — returns signed string */
  sign(data: any, pair: SEAKeyPair, callback?: (signed: string) => void): Promise<string>;

  /** Verify a signed string against a public key — returns original data or undefined */
  verify(signed: string, pub: string, callback?: (data: any) => void): Promise<any>;

  /** Encrypt data with a key or shared secret */
  encrypt(data: any, key: string | SEAKeyPair, callback?: (encrypted: string) => void): Promise<string>;

  /** Decrypt encrypted data with a key or shared secret */
  decrypt(encrypted: string, key: string | SEAKeyPair, callback?: (data: any) => void): Promise<any>;

  /** Derive a key using PBKDF2 (deterministic key derivation) */
  work(
    data: any,
    salt?: any,
    callback?: (derived: string) => void,
    options?: { name?: string; encode?: string; hash?: string; length?: number }
  ): Promise<string>;

  /** Compute a cryptographic hash */
  certify(
    certificants: string | string[],
    policy: any,
    authority: SEAKeyPair,
    callback?: (certificate: string) => void
  ): Promise<string>;

  /** Create a shared secret between two keypairs (ECDH) */
  secret(
    theirEpub: string,
    myPair: SEAKeyPair,
    callback?: (secret: string) => void
  ): Promise<string>;
}

interface SEAKeyPair {
  /** Public key (ECDSA) */
  pub: string;
  /** Private key (ECDSA) */
  priv: string;
  /** Public key for encryption (ECDH) */
  epub: string;
  /** Private key for encryption (ECDH) */
  epriv: string;
}
