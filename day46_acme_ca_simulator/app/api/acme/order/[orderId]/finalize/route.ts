import { NextResponse } from 'next/server';
import db from '@/lib/db';
import {
  verifyJws,
  generateNonce,
  type AcmeOrder,
  type Jwk
} from '@/lib/acme';
import { issueCertificateFromCsrByRootCA, parseCsrForDomains } from '@/lib/ca'; // parseCsrForDomainsも追加想定
import crypto from 'node:crypto';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001';

interface FinalizePayload {
  csr: string; // Base64URL encoded DER CSR
}

export async function POST(request: Request, { params }: { params: { orderId: string } }) {
  const orderId = params.orderId;
  const newNonce = generateNonce();
  const responseHeaders = new Headers({
    'Replay-Nonce': newNonce,
    'Cache-Control': 'no-store',
    'Content-Type': 'application/problem+json',
  });

  // 1. JWSパースと検証準備
  let jwsFlattenedJson: any;
  try { jwsFlattenedJson = await request.json(); } catch (e) {
    return NextResponse.json({ type: 'urn:ietf:params:acme:error:malformed', detail: 'Failed to parse JWS' }, { status: 400, headers: responseHeaders });
  }
  const { protected: protectedHeaderB64, payload: payloadB64, signature } = jwsFlattenedJson;
  if (!protectedHeaderB64 || !payloadB64 || !signature) {
    return NextResponse.json({ type: 'urn:ietf:params:acme:error:malformed', detail: 'Invalid JWS structure' }, { status: 400, headers: responseHeaders });
  }
  let protectedHeader: any, finalizePayload: FinalizePayload;
  try {
    protectedHeader = JSON.parse(Buffer.from(protectedHeaderB64, 'base64url').toString('utf8'));
    finalizePayload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch (e) {
    return NextResponse.json({ type: 'urn:ietf:params:acme:error:malformed', detail: 'Failed to parse JWS components for finalize' }, { status: 400, headers: responseHeaders });
  }

  // 2. アカウントID特定、JWS検証、オーダー状態確認
  const accountUrl = protectedHeader.kid as string;
  // ... (Account ID extraction and validation, JWS validation - similar to other POST endpoints) ...
  if (!accountUrl || !accountUrl.startsWith(`${BASE_URL}/api/acme/account/`)) { /* ... */ return NextResponse.json({ type: 'urn:ietf:params:acme:error:malformed', detail: 'Invalid kid' }, { status: 400, headers: responseHeaders });}
  const accountId = accountUrl.split('/').pop();
  if (!accountId) { /* ... */ return NextResponse.json({ type: 'urn:ietf:params:acme:error:malformed', detail: 'Invalid kid format' }, { status: 400, headers: responseHeaders });}

  const requestUrl = `${BASE_URL}/api/acme/order/${orderId}/finalize`;
  if (protectedHeader.url !== requestUrl) { /* ... */ return NextResponse.json({ type: 'urn:ietf:params:acme:error:malformed', detail: 'URL mismatch' }, { status: 400, headers: responseHeaders });}
  if (!await verifyJws(protectedHeader, finalizePayload, signature, accountId)) { /* ... */ return NextResponse.json({ type: 'urn:ietf:params:acme:error:unauthorized', detail: 'JWS verification failed' }, { status: 401, headers: responseHeaders });}

  const orderStmt = db.prepare('SELECT id, accountId, status, identifiers FROM AcmeOrders WHERE id = ?');
  const order = orderStmt.get(orderId) as { id: string, accountId: string, status: AcmeOrder['status'], identifiers: string } | undefined;

  if (!order || order.accountId !== accountId) {
    return NextResponse.json({ type: 'urn:ietf:params:acme:error:orderDoesNotExist', detail: 'Order not found or not owned by account' }, { status: 404, headers: responseHeaders });
  }
  if (order.status !== 'ready') {
    // If already valid, processing, or invalid, return current order state.
    if (order.status === 'valid' || order.status === 'processing' || order.status === 'invalid') {
        const currentOrder = db.prepare('SELECT * FROM AcmeOrders WHERE id = ?').get(orderId);
        // Construct and return full order object similar to GET /order/:orderId
        responseHeaders.set('Content-Type', 'application/json');
        // simplified response, ideally reuse logic from GET /order/:orderId
        return NextResponse.json(currentOrder, { status: 200, headers: responseHeaders});
    }
    return NextResponse.json({ type: 'urn:ietf:params:acme:error:orderNotReady', detail: `Order status is ${order.status}, must be ready.` }, { status: 403, headers: responseHeaders });
  }

  // 3. CSRパースと検証
  if (!finalizePayload.csr) {
    return NextResponse.json({ type: 'urn:ietf:params:acme:error:malformed', detail: 'Missing CSR in payload' }, { status: 400, headers: responseHeaders });
  }
  let domainsFromCsr: string[];
  try {
    // CSRはBase64URLエンコードされたDER形式。まずBase64デコード。
    const csrDer = Buffer.from(finalizePayload.csr, 'base64url');
    domainsFromCsr = await parseCsrForDomains(csrDer); // 簡易的なドメイン抽出 (CNのみなど)
  } catch (csrError: any) {
    console.error('CSR parsing error:', csrError);
    return NextResponse.json({ type: 'urn:ietf:params:acme:error:badCSR', detail: `Failed to parse CSR: ${csrError.message}` }, { status: 400, headers: responseHeaders });
  }

  const orderIdentifiers = (JSON.parse(order.identifiers) as {type: string, value: string}[]).map(id => id.value).sort();
  const sortedDomainsFromCsr = [...new Set(domainsFromCsr)].sort(); // 重複排除してソート

  if (JSON.stringify(sortedDomainsFromCsr) !== JSON.stringify(orderIdentifiers)) {
     db.prepare("UPDATE AcmeOrders SET status = 'invalid', error = ? WHERE id = ?").run(JSON.stringify({type: 'urn:ietf:params:acme:error:badCSR', detail: 'CSR domains do not match order identifiers'}), orderId);
    return NextResponse.json({ type: 'urn:ietf:params:acme:error:badCSR', detail: 'CSR domains do not match order identifiers' }, { status: 400, headers: responseHeaders });
  }

  // 4. 証明書発行とDB保存
  db.prepare("UPDATE AcmeOrders SET status = 'processing' WHERE id = ?").run(orderId);
  try {
    const csrPem = `-----BEGIN CERTIFICATE REQUEST-----\n${Buffer.from(finalizePayload.csr, 'base64url').toString('base64')}\n-----END CERTIFICATE REQUEST-----`;
    const { certificatePem, serialNumber, validFrom, validTo } = await issueCertificateFromCsrByRootCA(csrPem, 90); // 90日間有効

    const certId = crypto.randomUUID(); // Or use serialNumber if it's guaranteed unique across traditional/ACME
    const certUrl = `${BASE_URL}/api/acme/certificate/${certId}`; // certIdはDBのAcmeCertificatesのID

    db.prepare(
      'INSERT INTO AcmeCertificates (id, orderId, csrPem, certificatePem, serialNumber, issuedAt, expiresAt, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(certId, orderId, csrPem, certificatePem, serialNumber, validFrom.toISOString(), validTo.toISOString(), 'valid');

    db.prepare("UPDATE AcmeOrders SET status = 'valid', certificateUrl = ? WHERE id = ?")
      .run(certUrl, orderId);

    console.log(`Certificate ${serialNumber} issued for order ${orderId}`);

    // 5. 最新のオーダー情報を返す
    const finalOrderStmt = db.prepare('SELECT id, status, expires, identifiers, notBefore, notAfter, authorizations, finalizeUrl, certificateUrl FROM AcmeOrders WHERE id = ?');
    const finalOrder = finalOrderStmt.get(orderId) as any;
    const responseBody: AcmeOrder = {
      id: finalOrder.id,
      status: finalOrder.status,
      expires: finalOrder.expires,
      identifiers: JSON.parse(finalOrder.identifiers),
      notBefore: finalOrder.notBefore || undefined,
      notAfter: finalOrder.notAfter || undefined,
      authorizations: JSON.parse(finalOrder.authorizations),
      finalize: finalOrder.finalizeUrl,
      certificate: finalOrder.certificateUrl || undefined,
    };
    responseHeaders.set('Content-Type', 'application/json');
    responseHeaders.set('Location', `${BASE_URL}/api/acme/order/${orderId}`); // Order URL
    return NextResponse.json(responseBody, { status: 200, headers: responseHeaders });

  } catch (issueError: any) {
    console.error('Certificate issuance error:', issueError);
    db.prepare("UPDATE AcmeOrders SET status = 'invalid', error = ? WHERE id = ?").run(JSON.stringify({type: 'urn:ietf:params:acme:error:serverInternal', detail: `Issuance failed: ${issueError.message}`}), orderId);
    return NextResponse.json({ type: 'urn:ietf:params:acme:error:serverInternal', detail: `Certificate issuance failed: ${issueError.message}` }, { status: 500, headers: responseHeaders });
  }
}
