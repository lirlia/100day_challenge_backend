import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { verifyJws, generateNonce, generateKeyAuthorization, type Jwk, type AcmeOrder, type AcmeAuthorization, type AcmeChallenge } from '@/lib/acme';
import crypto from 'node:crypto';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001';
const ORDER_LIFETIME_DAYS = 7;
const AUTHZ_LIFETIME_DAYS = 7;
const CHALLENGE_TOKEN_LENGTH = 32; // bytes

interface NewOrderPayloadIdentifier {
  type: 'dns';
  value: string;
}

interface NewOrderPayload {
  identifiers: NewOrderPayloadIdentifier[];
  notBefore?: string; // ISO 8601 date
  notAfter?: string;  // ISO 8601 date
}

function generateChallengeToken(): string {
  return crypto.randomBytes(CHALLENGE_TOKEN_LENGTH).toString('base64url');
}

export async function POST(request: Request) {
  const newNonce = generateNonce();
  const responseHeaders = new Headers({
    'Replay-Nonce': newNonce,
    'Cache-Control': 'no-store',
    'Content-Type': 'application/problem+json', // Default for errors
  });

  // 1. JWSパースと検証準備
  let jwsFlattenedJson: any;
  try {
    jwsFlattenedJson = await request.json();
  } catch (e) {
    return NextResponse.json({ type: 'urn:ietf:params:acme:error:malformed', detail: 'Failed to parse JWS' }, { status: 400, headers: responseHeaders });
  }

  const { protected: protectedHeaderB64, payload: payloadB64, signature } = jwsFlattenedJson;
  if (!protectedHeaderB64 || !payloadB64 || !signature) {
    return NextResponse.json({ type: 'urn:ietf:params:acme:error:malformed', detail: 'Invalid JWS structure' }, { status: 400, headers: responseHeaders });
  }

  let protectedHeader: any;
  let orderPayload: NewOrderPayload;
  try {
    protectedHeader = JSON.parse(Buffer.from(protectedHeaderB64, 'base64url').toString('utf8'));
    orderPayload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch (e) {
    return NextResponse.json({ type: 'urn:ietf:params:acme:error:malformed', detail: 'Failed to parse JWS components' }, { status: 400, headers: responseHeaders });
  }

  // 2. アカウントID特定とJWS検証
  const accountUrl = protectedHeader.kid as string;
  if (!accountUrl || !accountUrl.startsWith(`${BASE_URL}/api/acme/account/`)) {
    return NextResponse.json({ type: 'urn:ietf:params:acme:error:malformed', detail: 'Invalid kid in protected header' }, { status: 400, headers: responseHeaders });
  }
  const accountId = accountUrl.split('/').pop();
  if (!accountId) {
    return NextResponse.json({ type: 'urn:ietf:params:acme:error:malformed', detail: 'Could not extract accountId from kid' }, { status: 400, headers: responseHeaders });
  }

  const accountStmt = db.prepare('SELECT id, publicKeyJwk, status FROM AcmeAccounts WHERE id = ?');
  const account = accountStmt.get(accountId) as { id: string; publicKeyJwk: string; status: string } | undefined;
  if (!account || account.status !== 'valid') {
    return NextResponse.json({ type: 'urn:ietf:params:acme:error:unauthorized', detail: 'Account not found or not valid' }, { status: 401, headers: responseHeaders });
  }

  if (protectedHeader.url !== `${BASE_URL}/api/acme/new-order`) {
    return NextResponse.json({ type: 'urn:ietf:params:acme:error:malformed', detail: `Invalid JWS protected header URL. Expected ${BASE_URL}/api/acme/new-order` }, { status: 400, headers: responseHeaders });
  }

  if (!await verifyJws(protectedHeader, orderPayload, signature, accountId)) {
    return NextResponse.json({ type: 'urn:ietf:params:acme:error:unauthorized', detail: 'JWS verification failed' }, { status: 401, headers: responseHeaders });
  }

  // 3. ペイロード検証 (識別子など)
  if (!orderPayload.identifiers || orderPayload.identifiers.length === 0) {
    return NextResponse.json({ type: 'urn:ietf:params:acme:error:malformed', detail: 'Missing identifiers in payload' }, { status: 400, headers: responseHeaders });
  }
  for (const id of orderPayload.identifiers) {
    if (id.type !== 'dns') {
      return NextResponse.json({ type: 'urn:ietf:params:acme:error:malformed', detail: 'Only dns identifiers are supported' }, { status: 400, headers: responseHeaders });
    }
    if (!id.value || id.value.includes('*')) { // ワイルドカードはここでは非対応（より複雑なDNS-01が必要）
        return NextResponse.json({ type: 'urn:ietf:params:acme:error:malformed', detail: 'Invalid or wildcard domain name in identifier' }, { status: 400, headers: responseHeaders });
    }
  }

  // 4. オーダー、Authorizations、Challengesの作成とDB保存
  const orderId = crypto.randomUUID();
  const orderExpires = new Date(Date.now() + ORDER_LIFETIME_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const authorizationUrls: string[] = [];
  const authzObjectsForResponse: AcmeAuthorization[] = [];

  const dbRun = db.transaction(() => {
    const insertOrderStmt = db.prepare(
      'INSERT INTO AcmeOrders (id, accountId, status, expires, identifiers, notBefore, notAfter, finalizeUrl) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );
    insertOrderStmt.run(
      orderId,
      accountId,
      'pending', // 初期ステータス
      orderExpires,
      JSON.stringify(orderPayload.identifiers),
      orderPayload.notBefore || null,
      orderPayload.notAfter || null,
      `${BASE_URL}/api/acme/order/${orderId}/finalize`
    );

    for (const identifier of orderPayload.identifiers) {
      const authzId = crypto.randomUUID();
      const authzUrl = `${BASE_URL}/api/acme/authz/${authzId}`;
      authorizationUrls.push(authzUrl);
      const authzExpires = new Date(Date.now() + AUTHZ_LIFETIME_DAYS * 24 * 60 * 60 * 1000).toISOString();

      const challengeToken = generateChallengeToken();
      const challengeIdHttp01 = crypto.randomUUID();
      const challengeUrlHttp01 = `${BASE_URL}/api/acme/challenge/${challengeIdHttp01}`;
      // const accountJwk = JSON.parse(account.jwk) as Jwk;
      // const keyAuth = await generateKeyAuthorization(challengeToken, accountJwk); // これはクライアント側で生成

      const challengesForDb: Omit<AcmeChallenge, 'url' | 'id'>[] = [
        { type: 'http-01', status: 'pending', token: challengeToken },
        // 他のチャレンジタイプ(dns-01など)も追加可能だが、シミュレーターではhttp-01のみ
      ];

      const insertAuthzStmt = db.prepare(
        'INSERT INTO AcmeAuthorizations (id, orderId, identifierType, identifierValue, status, expires, wildcard) VALUES (?, ?, ?, ?, ?, ?, ?)'
      );
      insertAuthzStmt.run(authzId, orderId, identifier.type, identifier.value, 'pending', authzExpires, 0); // wildcard=0 (false)

      const challengesForResponse: AcmeChallenge[] = [];
      for (const ch of challengesForDb) {
        const currentChallengeId = ch.type === 'http-01' ? challengeIdHttp01 : crypto.randomUUID(); // IDを割り当て
        const currentChallengeUrl = `${BASE_URL}/api/acme/challenge/${currentChallengeId}`;
        const insertChallengeStmt = db.prepare(
            'INSERT INTO AcmeChallenges (id, authorizationId, type, url, token, status, validationPayload) VALUES (?, ?, ?, ?, ?, ?, ?)'
        );
        insertChallengeStmt.run(currentChallengeId, authzId, ch.type, currentChallengeUrl, ch.token, 'pending', null);
        challengesForResponse.push({ ...ch, id: currentChallengeId, url: currentChallengeUrl });
      }

      authzObjectsForResponse.push({
        id: authzId,
        status: 'pending',
        expires: authzExpires,
        identifier: identifier,
        challenges: challengesForResponse,
        wildcard: false,
      });
    }
    // AcmeOrder の authorizations カラムを更新
    const updateOrderAuthzStmt = db.prepare('UPDATE AcmeOrders SET authorizations = ? WHERE id = ?');
    updateOrderAuthzStmt.run(JSON.stringify(authorizationUrls), orderId);
  });

  try {
    dbRun();
  } catch (dbError: any) {
    console.error('Database error during order creation:', dbError);
    return NextResponse.json({ type: 'urn:ietf:params:acme:error:serverInternal', detail: 'Database operation failed' }, { status: 500, headers: responseHeaders });
  }

  // 5. レスポンス作成
  const orderUrl = `${BASE_URL}/api/acme/order/${orderId}`;
  const responseBody: AcmeOrder = {
    id: orderId,
    status: 'pending',
    expires: orderExpires,
    identifiers: orderPayload.identifiers,
    notBefore: orderPayload.notBefore,
    notAfter: orderPayload.notAfter,
    authorizations: authorizationUrls,
    finalize: `${BASE_URL}/api/acme/order/${orderId}/finalize`,
    // certificate: undefined, // まだ発行されていない
  };

  responseHeaders.set('Location', orderUrl);
  responseHeaders.set('Content-Type', 'application/json');
  return NextResponse.json(responseBody, { status: 201, headers: responseHeaders });
}
