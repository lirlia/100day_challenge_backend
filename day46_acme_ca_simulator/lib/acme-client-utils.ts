import type { Jwk } from '@/components/acme/AcmeClientFlow'; // 型定義をインポート

// Base64 URLエンコード/デコード
function base64UrlEncode(data: string | ArrayBuffer): string {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

// Function to compute JWK thumbprint (RFC 7638)
async function calculateJwkThumbprint(jwk: Jwk): Promise<string> {
  // Create a canonical representation of the JWK
  // For EC keys (P-256, P-384, P-521), required members are crv, kty, x, y
  const canonicalJwk: { crv?: string; kty?: string; x?: string; y?: string } = {};
  if (jwk.kty === 'EC') {
    canonicalJwk.crv = jwk.crv;
    canonicalJwk.kty = jwk.kty;
    canonicalJwk.x = jwk.x;
    canonicalJwk.y = jwk.y;
  } else {
    // For other key types, you would need different canonicalization rules.
    // This example primarily supports EC keys as used in previous steps.
    throw new Error('Unsupported JWK type for thumbprint calculation. Only EC is supported.');
  }
  // Order of members MUST be lexicographical
  const sortedCanonicalJwk = JSON.stringify(
    Object.fromEntries(Object.entries(canonicalJwk).sort(([keyA], [keyB]) => keyA.localeCompare(keyB)))
  );

  const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sortedCanonicalJwk));
  return base64UrlEncode(hashBuffer);
}

export async function getKeyAuthorization(token: string, accountKeyJwk: Jwk): Promise<string> {
  const thumbprint = await calculateJwkThumbprint(accountKeyJwk);
  return `${token}.${thumbprint}`;
}

// JWS (JSON Web Signature) の作成
export async function createJws(
  payload: object | string,
  privateKeyJwk: Jwk,
  protectedHeader: object,
  keyId?: string // kid (Key ID), アカウント登録後はアカウントURLになる
): Promise<string> {
  const alg = privateKeyJwk.crv === 'P-256' ? 'ES256' :
              privateKeyJwk.crv === 'P-384' ? 'ES384' :
              privateKeyJwk.crv === 'P-521' ? 'ES512' : undefined;
  if (!alg) throw new Error('Unsupported curve for JWS signing');

  const finalProtectedHeader = { ...protectedHeader, alg, kid: keyId };
  const protectedHeaderString = base64UrlEncode(JSON.stringify(finalProtectedHeader));
  const payloadString = base64UrlEncode(typeof payload === 'string' ? payload : JSON.stringify(payload));

  const dataToSign = `${protectedHeaderString}.${payloadString}`;
  const signature = await window.crypto.subtle.sign(
    { name: 'ECDSA', hash: { name: 'SHA-256' } }, // algに応じてhashも変更すべきだが、P-256ならSHA-256
    await window.crypto.subtle.importKey(
      'jwk',
      privateKeyJwk,
      { name: 'ECDSA', namedCurve: privateKeyJwk.crv! },
      false,
      ['sign']
    ),
    new TextEncoder().encode(dataToSign)
  );

  return JSON.stringify({
    protected: protectedHeaderString,
    payload: payloadString,
    signature: base64UrlEncode(signature),
  });
}

// Nonceの取得
// let latestNonce: string | null = null; // This global cache can cause issues.
export async function getNonce(directoryUrl: string): Promise<string> {
  // if (latestNonce) { // Always fetch a fresh nonce.
  //   const nonce = latestNonce;
  //   latestNonce = null; // 一度使ったらクリア
  //   return nonce;
  // }
  // まずディレクトリ情報を取得してnewNonceエンドポイントURLを得る
  console.log('[ACME Client Util] Fetching directory from:', directoryUrl); // デバッグログ追加
  const dirRes = await fetch(directoryUrl);
  if (!dirRes.ok) throw new Error(`Failed to fetch directory: ${dirRes.status}`);
  const directory = await dirRes.json();
  console.log('[ACME Client Util] Directory content:', directory); // デバッグログ追加
  const newNonceUrl = directory.newNonce;
  console.log('[ACME Client Util] New Nonce URL:', newNonceUrl); // デバッグログ追加
  if (!newNonceUrl) throw new Error('newNonce URL not found in directory');

  const res = await fetch(newNonceUrl, { method: 'HEAD' });
  if (!res.ok) throw new Error(`Failed to get nonce: ${res.status}`);
  const nonceFromHeader = res.headers.get('Replay-Nonce');
  if (!nonceFromHeader) throw new Error('Replay-Nonce header not found');
  // latestNonce = nonceFromHeader; // No need to cache it here if we fetch fresh every time.
  return nonceFromHeader;
}

// ACME APIへの署名付きリクエスト送信
export async function postAsJws(
  url: string,
  payload: object | string,
  privateKeyJwk: Jwk,
  publicKeyJwk: Jwk, // JWKをprotected headerに含める場合
  directoryUrl: string, // Nonce取得用
  accountId?: string // アカウント登録後のリクエストではkidとして使用
): Promise<{ response: Response; body: any; nonce: string | null }> {
  const nonce = await getNonce(directoryUrl);
  console.log('[ACME Client Util] Nonce received from getNonce:', nonce); // ★ 追加：getNonce直後のnonce

  const protectedHeader: any = { nonce, url, jwk: accountId ? undefined : publicKeyJwk, kid: accountId };

  // jwkとkidはどちらか一方のみを含むべき
  if (accountId) {
    delete protectedHeader.jwk;
  } else {
    delete protectedHeader.kid;
  }

  console.log('[ACME Client Util] JWS protected header (before createJws):', protectedHeader); // ★ 修正：createJws直前のprotectedHeader

  const jws = await createJws(payload, privateKeyJwk, protectedHeader, accountId);

  console.log('[ACME Client Util] Posting JWS to:', url); // デバッグログ追加
  console.log('[ACME Client Util] JWS payload:', payload); // デバッグログ追加
  console.log('[ACME Client Util] JWS protected header:', protectedHeader); // デバッグログ追加

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/jose+json',
    },
    body: jws,
  });

  // latestNonce = response.headers.get('Replay-Nonce'); // No need to cache response nonce on client side.
  let responseBody = null;
  const contentType = response.headers.get('content-type');
  if (contentType && (contentType.includes('application/json') || contentType.includes('application/problem+json'))) {
    responseBody = await response.json();
  }

  if (!response.ok && responseBody && responseBody.detail) {
    throw new Error(`ACME Error: ${responseBody.type} - ${responseBody.detail} (Status: ${response.status})`);
  }
  if (!response.ok) {
     throw new Error(`ACME Request Failed: ${response.status} ${response.statusText}`);
  }

  return { response, body: responseBody, nonce: null };
}
