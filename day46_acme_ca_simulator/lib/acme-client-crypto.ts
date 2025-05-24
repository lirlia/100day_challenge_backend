/**
 * Converts an ArrayBuffer to a Base64URL-encoded string.
 */
export function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  return Buffer.from(buffer)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Converts a Base64URL-encoded string to an ArrayBuffer.
 */
export function base64UrlToArrayBuffer(base64url: string): ArrayBuffer {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const binStr = Buffer.from(base64, 'base64').toString('binary');
  const len = binStr.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binStr.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Generates an ECDSA P-256 key pair for ACME account.
 */
export async function generateKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    {
      name: 'ECDSA',
      namedCurve: 'P-256',
    },
    true, // extractable
    ['sign', 'verify']
  );
}

/**
 * Exports a public key in JWK format.
 */
export async function exportJwk(publicKey: CryptoKey): Promise<JsonWebKey> {
  return crypto.subtle.exportKey('jwk', publicKey);
}

/**
 * Creates a JWS (JSON Web Signature).
 * @param payload The payload to sign.
 * @param privateKey The private key to sign with.
 * @param protectedHeader The protected header.
 * @returns The JWS in flattened JSON format.
 */
export async function createJws(
  payload: object,
  privateKey: CryptoKey,
  protectedHeader: object
): Promise<{ protected: string; payload: string; signature: string }> {
  const payloadB64Url = arrayBufferToBase64Url(new TextEncoder().encode(JSON.stringify(payload)).buffer);
  const protectedHeaderB64Url = arrayBufferToBase64Url(new TextEncoder().encode(JSON.stringify(protectedHeader)).buffer);

  const signatureInput = `${protectedHeaderB64Url}.${payloadB64Url}`;
  const signatureBuffer = await crypto.subtle.sign(
    {
      name: 'ECDSA',
      hash: { name: 'SHA-256' },
    },
    privateKey,
    new TextEncoder().encode(signatureInput).buffer
  );

  return {
    protected: protectedHeaderB64Url,
    payload: payloadB64Url,
    signature: arrayBufferToBase64Url(signatureBuffer),
  };
}

/**
 * Creates a CSR (Certificate Signing Request) in Base64URL encoded DER format (simplified).
 * This is a very simplified CSR generation for simulation purposes.
 * A real CSR would involve ASN.1 encoding of distinguished names, public key, etc.
 * @param commonName The common name for the certificate.
 * @param privateKey The private key (for self-signing or proof of possession, though not fully used here).
 * @param publicKey The public key to be certified.
 */
export async function createCsr(
  domains: string[], // First domain is CN, others are SANs
  keyPair: CryptoKeyPair
): Promise<string> {
  // This is a placeholder for actual CSR generation.
  // Generating a DER-encoded ASN.1 CSR in browser is complex without a library.
  // We will return a PEM-like string which the server side will naively parse for CN.
  // Or, if the server side /finalize expects Base64URL(DER), this would be a dummy value.

  const cn = domains[0];
  const publicKeyJwk = await exportJwk(keyPair.publicKey);

  // Constructing a pseudo-CSR. A real one is a DER structure.
  // For simulation, we'll make a PEM-like string that our naive server-side parser might handle for CN.
  // The server's finalize endpoint expects a Base64URL encoded DER CSR.
  // Let's create a very minimal fake DER structure (as a hex string, then convert to buffer, then base64url)
  // This is extremely simplified and not a valid CSR.
  // Sequence (Object) > Sequence (Subject) > RelativeDistinguishedName (CN) > PrintableString (commonName)
  // Sequence (Object) > Sequence (PublicKeyInfo) > ...
  // For the simulator, a simple string identifying the CN might be enough if the server is lenient.

  // Let's create a simple text-based representation and base64url encode that.
  // The server's `parseCsrForDomains` is very naive, so this might work for it.
  const pseudoCsrContent =
`-----BEGIN CERTIFICATE REQUEST-----
Version: 0
Subject: CN=${cn}
${domains.slice(1).map(d => `SubjectAlternativeName: DNS:${d}`).join('\n')}
PublicKeyAlgorithm: ECDSA
PublicKey:
${JSON.stringify(publicKeyJwk, null, 2)}
-----END CERTIFICATE REQUEST-----`;

  // The server expects Base64URL(DER). This is Base64URL(PEM-like-text).
  // The server's `parseCsrForDomains` in `ca.ts` tries to match `CN=` from this string.
  // The server's `finalize` endpoint converts this base64url string to a PEM string for `issueCertificateFromCsrByRootCA`.
  return arrayBufferToBase64Url(new TextEncoder().encode(pseudoCsrContent).buffer);
}

/**
 * Generates a key authorization string for a challenge token and account JWK.
 * keyAuthorization = token + "." + base64url(thumbprint(accountKey))
 * This must match the server's `lib/acme.ts#generateKeyAuthorization` (simplified version)
 * @param token The challenge token.
 * @param accountJwk The account's public JWK.
 */
export async function generateClientKeyAuthorization(token: string, accountJwk: JsonWebKey): Promise<string> {
  // Simplified thumbprint: SHA-256 hash of the JSON-stringified JWK (sorted by key for consistency if possible)
  // A proper thumbprint (RFC 7638) requires specific canonicalization of the JWK.
  // For simulation, ensure this matches the server's expectation.
  const jwkForThumbprint: any = {
    crv: accountJwk.crv,
    kty: accountJwk.kty,
    x: accountJwk.x,
    y: accountJwk.y,
    // Include other keys if present and used by server's thumbprint logic (e.g. e, n for RSA)
  };
  const jwkString = JSON.stringify(jwkForThumbprint); // Sorting keys would be more robust
  const thumbprintBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(jwkString).buffer);
  const thumbprint = arrayBufferToBase64Url(thumbprintBuffer);
  return `${token}.${thumbprint}`;
}
