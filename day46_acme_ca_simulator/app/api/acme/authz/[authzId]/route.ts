import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { verifyJws, generateNonce, type AcmeAuthorization, type AcmeChallenge } from '@/lib/acme';
import crypto from 'node:crypto';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001';

// DBからのAcmeAuthorizationsテーブルの行を表す型
interface DbAuthzResult {
  id: string;
  orderId: string;
  identifierType: string;
  identifierValue: string;
  status: AcmeAuthorization['status'];
  expires: string | null;
  wildcard: number; // 0 or 1
}

// DBからのAcmeChallengesテーブルの行を表す型
interface DbChallengeResult {
  id: string;
  authzId: string;
  type: AcmeChallenge['type'];
  url: string;
  token: string;
  status: AcmeChallenge['status'];
  validated: string | null;
  validationPayload: string | null; // JSON string of error or other info
}

export async function POST(request: Request, { params }: { params: { authzId: string } }) {
  const resolvedParams = await params;
  const authzId = resolvedParams.authzId;
  const newNonce = generateNonce();
  const responseHeaders = new Headers({
    'Replay-Nonce': newNonce,
    'Cache-Control': 'no-store',
    'Content-Type': 'application/problem+json',
  });

  // 1. JWSパースと検証準備 (POST-as-GETなのでペイロードは空のはず)
  let jwsFlattenedJson: any;
  try {
    jwsFlattenedJson = await request.json();
  } catch (e) {
    return NextResponse.json({ type: 'urn:ietf:params:acme:error:malformed', detail: 'Failed to parse JWS' }, { status: 400, headers: responseHeaders });
  }
  const { protected: protectedHeaderB64, payload: payloadB64, signature } = jwsFlattenedJson;
  if (!protectedHeaderB64 || !signature) {
    return NextResponse.json({ type: 'urn:ietf:params:acme:error:malformed', detail: 'Invalid JWS structure' }, { status: 400, headers: responseHeaders });
  }
  let protectedHeader: any;
  let getAuthzPayload: any = {};
  try {
    protectedHeader = JSON.parse(Buffer.from(protectedHeaderB64, 'base64url').toString('utf8'));
    if (payloadB64) {
        const payloadString = Buffer.from(payloadB64, 'base64url').toString('utf8');
        if (payloadString && payloadString.trim() !== "") getAuthzPayload = JSON.parse(payloadString);
        else getAuthzPayload = {};
    }
  } catch (e) {
    console.error('Error parsing JWS payload/protected header in authz:', e, { protectedHeaderB64, payloadB64 });
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
  const accountStmt = db.prepare('SELECT id, status FROM AcmeAccounts WHERE id = ?');
  const account = accountStmt.get(accountId) as { id: string; status: string } | undefined;
  // Authz取得はオーダーを作成したアカウントである必要がある。オーダー経由でアカウントを検証。
  const authzForAccountCheckStmt = db.prepare('SELECT o.accountId FROM AcmeAuthorizations az JOIN AcmeOrders o ON az.orderId = o.id WHERE az.id = ?');
  const orderAccountIdResult = authzForAccountCheckStmt.get(authzId) as { accountId: string} | undefined;
  if (!account || account.status !== 'valid' || !orderAccountIdResult || orderAccountIdResult.accountId !== accountId) {
    return NextResponse.json({ type: 'urn:ietf:params:acme:error:unauthorized', detail: 'Account not authorized for this authorization' }, { status: 401, headers: responseHeaders });
  }

  const requestUrl = `${BASE_URL}/api/acme/authz/${authzId}`;
  if (protectedHeader.url !== requestUrl) {
    return NextResponse.json({ type: 'urn:ietf:params:acme:error:malformed', detail: `Invalid JWS protected header URL. Expected ${requestUrl}` }, { status: 400, headers: responseHeaders });
  }
  if (!await verifyJws(protectedHeader, getAuthzPayload, signature, accountId)) {
    return NextResponse.json({ type: 'urn:ietf:params:acme:error:unauthorized', detail: 'JWS verification failed' }, { status: 401, headers: responseHeaders });
  }

  // 3. Authorization情報取得
  try {
    const authzStmt = db.prepare('SELECT id, orderId, identifierType, identifierValue, status, expires, wildcard FROM AcmeAuthorizations WHERE id = ?');
    const authz = authzStmt.get(authzId) as DbAuthzResult | undefined;

    if (!authz) {
      return NextResponse.json({ type: 'urn:ietf:params:acme:error:malformed', detail: 'Authorization not found' }, { status: 404, headers: responseHeaders });
    }

    // 4. チャレンジ情報を取得してレスポンスに含める
    // 注意: AcmeChallenges テーブルの authzId カラムは実際には authorizationId かもしれない。スキーマを確認。
    // validated カラムも validatedAt かもしれない。
    const challengesStmt = db.prepare(
      'SELECT id, type, url, token, status, validatedAt FROM AcmeChallenges WHERE authorizationId = ?'
    );
    const challengesRaw = challengesStmt.all(authzId) as Omit<DbChallengeResult, 'authorizationId' | 'validationPayload'>[];

    const challengesForResponse: AcmeChallenge[] = challengesRaw.map(ch => ({
      id: ch.id,
      type: ch.type,
      url: ch.url,
      token: ch.token,
      status: ch.status,
      validated: ch.validated || undefined,
    }));

    const responseBody: AcmeAuthorization = {
      id: authz.id,
      status: authz.status,
      expires: authz.expires || undefined,
      identifier: { type: authz.identifierType as 'dns', value: authz.identifierValue },
      challenges: challengesForResponse,
      wildcard: authz.wildcard === 1,
    };

    responseHeaders.set('Content-Type', 'application/json');
    return NextResponse.json(responseBody, { status: 200, headers: responseHeaders });

  } catch (dbError: any) {
    console.error('Database error fetching authorization:', dbError);
    return NextResponse.json({ type: 'urn:ietf:params:acme:error:serverInternal', detail: 'Database operation failed' }, { status: 500, headers: responseHeaders });
  }
}
