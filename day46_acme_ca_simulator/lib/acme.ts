import crypto from 'node:crypto';

// --- Nonce Management ---
const activeNonces = new Set<string>();
const NONCE_LIFETIME = 5 * 60 * 1000; // 5 minutes in milliseconds

/**
 * Generates a new nonce, adds it to the active set, and sets a timeout for its expiry.
 * @returns The new nonce string.
 */
export function generateNonce(): string {
  const nonce = crypto.randomBytes(16).toString('hex');
  activeNonces.add(nonce);
  setTimeout(() => {
    activeNonces.delete(nonce);
    console.log(`Nonce ${nonce} expired and removed. Active nonces: ${activeNonces.size} Contents: ${JSON.stringify(Array.from(activeNonces))}`);
  }, NONCE_LIFETIME);
  console.log(`Generated nonce: ${nonce}, active nonces: ${activeNonces.size} Contents: ${JSON.stringify(Array.from(activeNonces))}`);
  return nonce;
}

/**
 * Validates a given nonce. It must exist in the active set.
 * If valid, it's consumed (removed from the set).
 * @param nonce The nonce to validate.
 * @returns True if the nonce is valid and was consumed, false otherwise.
 */
export function validateAndConsumeNonce(nonce: string): boolean {
  console.log(`Validating nonce: ${nonce}. Current activeNonces: ${JSON.stringify(Array.from(activeNonces))}`);
  if (activeNonces.has(nonce)) {
    activeNonces.delete(nonce);
    console.log(`Consumed nonce: ${nonce}, active nonces: ${activeNonces.size} Contents: ${JSON.stringify(Array.from(activeNonces))}`);
    return true;
  }
  console.warn(`Invalid or expired nonce received: ${nonce}. Current activeNonces: ${JSON.stringify(Array.from(activeNonces))}`);
  return false;
}

// --- JWS (JSON Web Signature) and JWK (JSON Web Key) Utilities (Simplified) ---

/**
 * Represents a JWK (JSON Web Key).
 * For ACME, we are primarily interested in 'RSA' or 'EC' keys.
 */
export interface Jwk {
  kty: 'RSA' | 'EC'; // Key Type
  n?: string;         // RSA modulus
  e?: string;         // RSA public exponent
  crv?: string;       // EC curve
  x?: string;         // EC x-coordinate
  y?: string;         // EC y-coordinate
  [key: string]: any; // Allow other properties
}

/**
 * Placeholder for JWS verification. In a real scenario, this would involve:
 * 1. Parsing the JWS (Protected Header, Payload, Signature).
 * 2. Verifying the signature using the public key from the JWK in the Protected Header.
 * 3. Checking the nonce from the Protected Header.
 * 4. Ensuring the URL in the Protected Header matches the request URL.
 * For this simulator, we will perform very basic checks or assume valid if certain conditions met.
 */
export async function verifyJws(protectedHeader: any, payload: any, signature: string, accountId?: string): Promise<boolean> {
  // This is a highly simplified JWS verification for simulation purposes.
  // A real implementation would require a robust JOSE library.
  console.log('Simulating JWS verification...');
  console.log('Protected Header:', protectedHeader);
  console.log('Payload:', payload);

  if (!protectedHeader || !protectedHeader.nonce || !protectedHeader.url) {
    console.error('JWS verification failed: Missing required protected header fields (nonce, url, and jwk/kid).');
    return false;
  }

  if (!protectedHeader.jwk && !protectedHeader.kid) {
    console.error('JWS verification failed: Missing jwk or kid in protected header.');
    return false;
  }

  if (!validateAndConsumeNonce(protectedHeader.nonce)) {
    console.error('JWS verification failed: Invalid or expired nonce.');
    return false;
  }

  if (accountId && protectedHeader.kid !== `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001'}/api/acme/account/${accountId}`) {
    console.error(`JWS verification failed: kid mismatch. Expected ${`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001'}/api/acme/account/${accountId}`}, got ${protectedHeader.kid}`);
    return false;
  }

  // Signature verification itself is complex and depends on the key type (RSA, EC)
  // and algorithm (e.g., RS256, ES256). We'll skip actual crypto verification here.
  console.log('JWS signature verification SKIPPED (simulation).');
  return true;
}

// --- ACME Specific Data Structures (to be expanded) ---

export interface AcmeOrder {
  id: string; // Order ID (usually a db primary key)
  status: 'pending' | 'ready' | 'processing' | 'valid' | 'invalid';
  expires: string; // ISO date string
  identifiers: { type: 'dns'; value: string }[];
  notBefore?: string; // 追加
  notAfter?: string;  // 追加
  authorizations: string[]; // URLs to authorization objects
  finalize: string; // URL to finalize the order
  certificate?: string; // URL to the issued certificate (after fulfillment)
  error?: any; // 追加 (ACME Problem Details object)
  // accountId: string; // ★この行を完全に削除または再度コメントアウト
  // ... other fields as needed
}

export interface AcmeAuthorization {
  id: string; // Authz ID
  status: 'pending' | 'valid' | 'invalid' | 'deactivated' | 'expired' | 'revoked';
  expires?: string; // ISO date string
  identifier: { type: 'dns'; value: string };
  challenges: AcmeChallenge[];
  wildcard?: boolean;
  // ... other fields
}

export interface AcmeChallenge {
  id: string; // Challenge ID, like one from DB
  type: 'http-01' | 'dns-01' | 'tls-alpn-01';
  status: 'pending' | 'processing' | 'valid' | 'invalid';
  url: string; // URL to post challenge response
  token: string; // Challenge token
  validated?: string; // ISO date string of validation time
  // error?: ProblemDetails; // If validation failed
  // ... other fields specific to challenge type
}

/**
 * Generates a key authorization string for a challenge token and account JWK.
 * keyAuthorization = token + "." + base64url(thumbprint(accountKey))
 * @param token The challenge token.
 * @param accountJwk The account's public JWK.
 * @returns The key authorization string.
 */
export async function generateKeyAuthorization(token: string, accountJwk: Jwk): Promise<string> {
  let canonicalJwkForThumbprint: any;

  if (accountJwk.kty === 'EC') {
    if (!accountJwk.crv || !accountJwk.x || !accountJwk.y) {
      throw new Error('Invalid EC JWK: missing crv, x, or y.');
    }
    canonicalJwkForThumbprint = {
      crv: accountJwk.crv,
      kty: accountJwk.kty,
      x: accountJwk.x,
      y: accountJwk.y,
    };
  } else if (accountJwk.kty === 'RSA') {
    if (!accountJwk.e || !accountJwk.n) {
      throw new Error('Invalid RSA JWK: missing e or n.');
    }
    canonicalJwkForThumbprint = {
      e: accountJwk.e,
      kty: accountJwk.kty,
      n: accountJwk.n,
    };
  } else {
    throw new Error(`Unsupported JWK type for thumbprint: ${accountJwk.kty}`);
  }

  // Order of members MUST be lexicographical for the thumbprint calculation
  const sortedCanonicalJwkString = JSON.stringify(
    Object.fromEntries(Object.entries(canonicalJwkForThumbprint).sort(([keyA], [keyB]) => keyA.localeCompare(keyB)))
  );

  const hash = crypto.createHash('sha256').update(sortedCanonicalJwkString).digest();
  const thumbprint = hash.toString('base64url'); // Node.js crypto uses 'base64url' directly
  return `${token}.${thumbprint}`;
}
