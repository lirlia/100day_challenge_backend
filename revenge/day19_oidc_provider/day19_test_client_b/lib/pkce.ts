// Helper functions for PKCE (Proof Key for Code Exchange)

// Generates a secure random string for the code verifier
export function generateCodeVerifier(length = 64): string {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let text = '';
  const randomValues = new Uint8Array(length);
  window.crypto.getRandomValues(randomValues);
  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(randomValues[i] / (256 / possible.length)));
  }
  return text;
}

// Calculates the SHA256 hash of the code verifier and returns it base64url encoded
export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await window.crypto.subtle.digest('SHA-256', data);

  // Base64url encode the digest
  // 1. Convert ArrayBuffer to byte array
  const byteArray = new Uint8Array(digest);
  // 2. Convert byte array to string using Latin1 encoding (each byte becomes a char)
  const byteString = String.fromCharCode(...byteArray);
  // 3. Base64 encode the string
  const base64String = btoa(byteString);
  // 4. Convert base64 to base64url
  const base64urlString = base64String
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  return base64urlString;
}

// Generates a secure random string for state and nonce
export function generateRandomString(length = 32): string {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let text = '';
  const randomValues = new Uint8Array(length);
  window.crypto.getRandomValues(randomValues);
  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(randomValues[i] / (256 / possible.length)));
  }
  return text;
}
