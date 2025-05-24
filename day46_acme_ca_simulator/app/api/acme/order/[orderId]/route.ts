import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { verifyJws, generateNonce, type AcmeOrder } from '@/lib/acme';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001';

// DBからのAcmeOrdersテーブルの行を表す型
interface DbOrderResult {
  id: string;
  status: 'pending' | 'ready' | 'processing' | 'valid' | 'invalid';
  expires: string;
  identifiers: string; // JSON string
  notBefore: string | null;
  notAfter: string | null;
  authorizations: string; // JSON string of URLs
  finalizeUrl: string;
  certificateUrl: string | null;
  error: string | null; // JSON string of ACME error or simple string
}

export async function POST(request: Request, { params }: { params: { orderId: string } }) {
  const awaitedParams = await params;
  const { orderId } = awaitedParams;
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
  if (!protectedHeaderB64 || !signature) { // Payload can be empty for POST-as-GET
    return NextResponse.json({ type: 'urn:ietf:params:acme:error:malformed', detail: 'Invalid JWS structure' }, { status: 400, headers: responseHeaders });
  }

  let protectedHeader: any;
  let getOrderPayload: any = {}; // Payload is often empty for POST-as-GET
  try {
    protectedHeader = JSON.parse(Buffer.from(protectedHeaderB64, 'base64url').toString('utf8'));
    if (payloadB64) { // Payload might not exist or be empty string if POST-as-GET
        const payloadString = Buffer.from(payloadB64, 'base64url').toString('utf8');
        if (payloadString && payloadString.trim() !== "") { // Check for non-empty, non-whitespace string
             getOrderPayload = JSON.parse(payloadString);
        } else {
            getOrderPayload = {}; // Empty or whitespace payload becomes empty object
        }
    }
  } catch (e) {
    // Log the error for debugging, as it might indicate an issue with base64url decoding or unexpected payload format
    console.error('Error parsing JWS payload/protected header:', e, { protectedHeaderB64, payloadB64 });
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
  if (!account || account.status !== 'valid') {
    return NextResponse.json({ type: 'urn:ietf:params:acme:error:unauthorized', detail: 'Account not found or not valid for this order' }, { status: 401, headers: responseHeaders });
  }

  const requestUrl = `${BASE_URL}/api/acme/order/${orderId}`;
  if (protectedHeader.url !== requestUrl) {
    return NextResponse.json({ type: 'urn:ietf:params:acme:error:malformed', detail: `Invalid JWS protected header URL. Expected ${requestUrl}` }, { status: 400, headers: responseHeaders });
  }

  if (!await verifyJws(protectedHeader, getOrderPayload, signature, accountId)) {
    return NextResponse.json({ type: 'urn:ietf:params:acme:error:unauthorized', detail: 'JWS verification failed' }, { status: 401, headers: responseHeaders });
  }

  // 3. オーダー情報取得
  try {
    const orderStmt = db.prepare(
      `SELECT id, status, expires, identifiers, notBefore, notAfter, authorizations, finalizeUrl, certificateUrl, error
       FROM AcmeOrders
       WHERE id = ? AND accountId = ?`
    );
    const order = orderStmt.get(orderId, accountId) as DbOrderResult | undefined;

    if (!order) {
      return NextResponse.json({ type: 'urn:ietf:params:acme:error:orderDoesNotExist', detail: 'Order not found or does not belong to this account' }, { status: 404, headers: responseHeaders });
    }

    const responseBody: AcmeOrder = {
      id: order.id,
      status: order.status,
      expires: order.expires,
      identifiers: JSON.parse(order.identifiers),
      notBefore: order.notBefore || undefined,
      notAfter: order.notAfter || undefined,
      authorizations: JSON.parse(order.authorizations),
      finalize: order.finalizeUrl,
      certificate: order.certificateUrl || undefined,
    };
    if (order.error) {
        try {
            responseBody.error = JSON.parse(order.error);
        } catch {
            responseBody.error = { type: 'urn:ietf:params:acme:error:serverInternal', detail: order.error };
        }
    }

    responseHeaders.set('Content-Type', 'application/json');
    return NextResponse.json(responseBody, { status: 200, headers: responseHeaders });

  } catch (dbError: any) {
    console.error('Database error fetching order:', dbError);
    return NextResponse.json({ type: 'urn:ietf:params:acme:error:serverInternal', detail: 'Database operation failed' }, { status: 500, headers: responseHeaders });
  }
}
