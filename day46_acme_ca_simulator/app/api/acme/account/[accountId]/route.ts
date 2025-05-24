import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { verifyJws, generateNonce, type Jwk } from '@/lib/acme';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001';

interface AccountUpdatePayload {
  contact?: string[];
  status?: 'valid' | 'deactivated'; // アカウントのdeactivateもここで行えるようにする
  // 他、更新可能なフィールドがあれば
}

interface AcmeAccountForResponse {
  id: string;
  kid: string; // Account URL, this endpoint itself
  status: 'valid' | 'deactivated' | 'revoked';
  contact?: string[];
  termsOfServiceAgreed?: boolean;
  orders: string; // URL to list orders for this account
  jwk: Jwk; // The JWK associated with this account
}

export async function POST(request: Request, { params }: { params: { accountId: string } }) {
  const accountId = params.accountId;
  const newNonce = generateNonce();
  const responseHeaders = new Headers({
    'Replay-Nonce': newNonce,
    'Cache-Control': 'no-store',
    'Content-Type': 'application/problem+json', // Default for errors
  });

  // 1. アカウント存在確認
  const accountStmt = db.prepare(
    'SELECT id, jwk, status, contact, termsOfServiceAgreed FROM AcmeAccounts WHERE id = ?'
  );
  const account = accountStmt.get(accountId) as {
    id: string;
    jwk: string; // Stored as JSON string
    status: 'valid' | 'deactivated' | 'revoked';
    contact: string | null; // Stored as JSON string
    termsOfServiceAgreed: number;
  } | undefined;

  if (!account) {
    return NextResponse.json({ type: 'urn:ietf:params:acme:error:accountDoesNotExist', detail: 'Account not found' }, { status: 404, headers: responseHeaders });
  }

  // 2. JWSパース
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
  let payload: AccountUpdatePayload;
  try {
    protectedHeader = JSON.parse(Buffer.from(protectedHeaderB64, 'base64url').toString('utf8'));
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch (e) {
    return NextResponse.json({ type: 'urn:ietf:params:acme:error:malformed', detail: 'Failed to parse JWS components' }, { status: 400, headers: responseHeaders });
  }

  // 3. JWS検証 (kidがアカウントIDと一致すること、URLが正しいこと、Nonceが正しいことを含む)
  const requestUrl = `${BASE_URL}/api/acme/account/${accountId}`;
  if (protectedHeader.url !== requestUrl) {
    return NextResponse.json({ type: 'urn:ietf:params:acme:error:malformed', detail: `Invalid JWS protected header URL. Expected ${requestUrl}` }, { status: 400, headers: responseHeaders });
  }
  if (protectedHeader.kid !== requestUrl) { // kid must match the account URL
    return NextResponse.json({ type: 'urn:ietf:params:acme:error:malformed', detail: `Invalid JWS protected header kid. Expected ${requestUrl}` }, { status: 400, headers: responseHeaders });
  }

  if (!await verifyJws(protectedHeader, payload, signature, accountId)) {
    return NextResponse.json({ type: 'urn:ietf:params:acme:error:unauthorized', detail: 'JWS verification failed' }, { status: 401, headers: responseHeaders });
  }

  // 4. アカウント処理 (情報取得または更新)
  try {
    let updatedContactJson: string | null = account.contact;
    let updatedStatus: string = account.status;

    // ペイロードに更新情報があれば適用
    if (Object.keys(payload).length > 0) {
      if (payload.contact) {
        updatedContactJson = JSON.stringify(payload.contact);
      }
      if (payload.status && (payload.status === 'valid' || payload.status === 'deactivated')) {
        // ここでは revoked への変更は許可しない (別のフローを想定)
        if (account.status === 'revoked') {
            return NextResponse.json({ type: 'urn:ietf:params:acme:error:unauthorized', detail: 'Cannot modify a revoked account' }, { status: 403, headers: responseHeaders });
        }
        updatedStatus = payload.status;
      }

      const updateStmt = db.prepare(
        'UPDATE AcmeAccounts SET contact = ?, status = ? WHERE id = ?'
      );
      updateStmt.run(updatedContactJson, updatedStatus, accountId);
    }

    // 最新のアカウント情報をDBから再取得 (または更新された値をそのまま使う)
    const finalAccountStmt = db.prepare('SELECT id, jwk, status, contact, termsOfServiceAgreed FROM AcmeAccounts WHERE id = ?');
    const finalAccount = finalAccountStmt.get(accountId) as any; // Cast for simplicity

    const accountUrl = `${BASE_URL}/api/acme/account/${finalAccount.id}`;
    const responseBody: AcmeAccountForResponse = {
      id: finalAccount.id,
      kid: accountUrl,
      status: finalAccount.status,
      contact: finalAccount.contact ? JSON.parse(finalAccount.contact) : undefined,
      termsOfServiceAgreed: finalAccount.termsOfServiceAgreed === 1,
      orders: `${accountUrl}/orders`,
      jwk: JSON.parse(finalAccount.jwk) as Jwk, // Parse JWK string back to object
    };

    responseHeaders.set('Content-Type', 'application/json');
    return NextResponse.json(responseBody, { status: 200, headers: responseHeaders });

  } catch (dbError: any) {
    console.error('Database error during account update/retrieval:', dbError);
    return NextResponse.json({ type: 'urn:ietf:params:acme:error:serverInternal', detail: 'Database operation failed' }, { status: 500, headers: responseHeaders });
  }
}
