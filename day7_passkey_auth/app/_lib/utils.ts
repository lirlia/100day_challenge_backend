/**
 * Encodes a string into a Uint8Array.
 * @param str The string to encode.
 * @returns The Uint8Array representation of the string.
 */
export function stringToUint8Array(str: string): Uint8Array {
  const encoder = new TextEncoder();
  return encoder.encode(str);
}

/**
 * Decodes a Uint8Array into a string.
 * @param arr The Uint8Array to decode.
 * @returns The decoded string.
 */
export function uint8ArrayToString(arr: Uint8Array): string {
  const decoder = new TextDecoder();
  return decoder.decode(arr);
}

// Base64URL エンコーディング/デコーディング関数 (ブラウザ互換)
// これらの関数は、サーバーとクライアントの両方で必要になる可能性があるため、
// 本来は `lib/utils.ts` に配置するのが適切かもしれない。

export function base64UrlEncode(buffer: ArrayBuffer): string {
  return Buffer.from(buffer)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

export function base64UrlDecode(base64url: string): Uint8Array {
  // Replace Base64URL specific characters
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  // Pad with '=' to make the length a multiple of 4
  const paddedBase64 = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  // Decode Base64 string to binary string
  const binaryString = atob(paddedBase64);
  // Convert binary string to Uint8Array
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}
