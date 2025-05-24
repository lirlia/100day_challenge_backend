import { NextResponse } from 'next/server';
import db from '@/lib/db';
import {
  verifyJws,
  generateNonce,
  generateKeyAuthorization,
  type Jwk,
  type AcmeChallenge,
  type AcmeAuthorization,
  type AcmeOrder
} from '@/lib/acme';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001';

// DB Result Types (subset of what might be needed)
interface DbChallengeResult {
  id: string; authzId: string; type: AcmeChallenge['type']; url: string; token: string; status: AcmeChallenge['status']; validated: string | null; validationPayload: string | null;
}
interface DbAuthzResult {
  id: string; orderId: string; identifierValue: string; status: AcmeAuthorization['status'];
}
interface DbOrderResult {
  id: string; accountId: string; status: AcmeOrder['status']; authorizations: string; // JSON string of URLs
}
interface DbAccountResult {
  id: string; jwk: string; // JSON string
}


async function updateOrderStatus(orderId: string) {
  const orderAuthzsStmt = db.prepare('SELECT id, status FROM AcmeAuthorizations WHERE orderId = ?');
  const authzs = orderAuthzsStmt.all(orderId) as Pick<AcmeAuthorization, 'id' | 'status'>[];

  if (authzs.every(authz => authz.status === 'valid')) {
    db.prepare("UPDATE AcmeOrders SET status = 'ready' WHERE id = ? AND status = 'pending'").run(orderId);
    console.log(`Order ${orderId} is now ready.`);
  } else if (authzs.some(authz => authz.status === 'invalid')) {
    db.prepare("UPDATE AcmeOrders SET status = 'invalid' WHERE id = ?").run(orderId);
    console.log(`Order ${orderId} is now invalid due to an invalid authorization.`);
  }
}

async function updateAuthzStatus(authzId: string, orderId: string) {
  const authzChallengesStmt = db.prepare('SELECT id, status FROM AcmeChallenges WHERE authzId = ?');
  const challenges = authzChallengesStmt.all(authzId) as Pick<AcmeChallenge, 'id' | 'status'>[];

  if (challenges.every(ch => ch.status === 'valid')) {
    db.prepare("UPDATE AcmeAuthorizations SET status = 'valid' WHERE id = ? AND status = 'pending'").run(authzId);
    console.log(`Authorization ${authzId} is now valid.`);
    await updateOrderStatus(orderId); // Check if order can be updated
  } else if (challenges.some(ch => ch.status === 'invalid')) {
    db.prepare("UPDATE AcmeAuthorizations SET status = 'invalid' WHERE id = ?").run(authzId);
    console.log(`Authorization ${authzId} is now invalid due to an invalid challenge.`);
    await updateOrderStatus(orderId); // Check if order should be updated to invalid
  }
}

export async function POST(request: Request, { params }: { params: { challengeId: string } }) {
  const challengeId = params.challengeId;
  const newNonce = generateNonce();
  const responseHeaders = new Headers({
    'Replay-Nonce': newNonce,
    'Cache-Control': 'no-store',
    'Content-Type': 'application/problem+json',
  });

  // 1. JWSパース (ペイロードは通常空か `{}`)
  let jwsFlattenedJson: any;
  try { jwsFlattenedJson = await request.json(); } catch (e) {
    return NextResponse.json({ type: 'urn:ietf:params:acme:error:malformed', detail: 'Failed to parse JWS' }, { status: 400, headers: responseHeaders });
  }
  const { protected: protectedHeaderB64, payload: payloadB64, signature } = jwsFlattenedJson;
  if (!protectedHeaderB64 || !signature) {
    return NextResponse.json({ type: 'urn:ietf:params:acme:error:malformed', detail: 'Invalid JWS structure' }, { status: 400, headers: responseHeaders });
  }
  let protectedHeader: any, challengePayload: any = {};
  try {
    protectedHeader = JSON.parse(Buffer.from(protectedHeaderB64, 'base64url').toString('utf8'));
    // RFC 8555 Section 7.5: payload for challenge response is an empty JSON object {}
    // some clients might send empty string for payloadB64 if payload is empty object.
    const payloadString = payloadB64 ? Buffer.from(payloadB64, 'base64url').toString('utf8') : '';
    if (payloadString && payloadString.trim() !== "" && payloadString.trim() !== "{}") {
        challengePayload = JSON.parse(payloadString);
    } else {
        challengePayload = {}; // Empty or {} payload
    }
    // Key authorization can be sent in payload by some clients, e.g. { keyAuthorization: "..." }
    // but for HTTP-01, it's usually implicitly through the HTTP request to the .well-known URL.
    // For this API call, the payload is usually just {}.

  } catch (e) {
    console.error('Error parsing JWS in challenge response:', e);
    return NextResponse.json({ type: 'urn:ietf:params:acme:error:malformed', detail: 'Failed to parse JWS components for challenge' }, { status: 400, headers: responseHeaders });
  }

  // 2. アカウントID特定とJWS検証
  const accountUrl = protectedHeader.kid as string;
  if (!accountUrl || !accountUrl.startsWith(`${BASE_URL}/api/acme/account/`)) { /* ... error ... */
    return NextResponse.json({ type: 'urn:ietf:params:acme:error:malformed', detail: 'Invalid kid in protected header' }, { status: 400, headers: responseHeaders });
  }
  const accountId = accountUrl.split('/').pop();
  if (!accountId) { /* ... error ... */
    return NextResponse.json({ type: 'urn:ietf:params:acme:error:malformed', detail: 'Could not extract accountId from kid' }, { status: 400, headers: responseHeaders });
  }

  const challengeStmt = db.prepare(
    `SELECT c.id, c.authzId, c.type, c.url, c.token, c.status, c.validationPayload,
            az.orderId, az.identifierValue,
            o.accountId as orderAccountId,
            acc.jwk as accountJwkString
     FROM AcmeChallenges c
     JOIN AcmeAuthorizations az ON c.authzId = az.id
     JOIN AcmeOrders o ON az.orderId = o.id
     JOIN AcmeAccounts acc ON o.accountId = acc.id
     WHERE c.id = ?`
  );
  const challengeInfo = challengeStmt.get(challengeId) as (DbChallengeResult & { orderId: string; identifierValue: string; orderAccountId: string; accountJwkString: string; }) | undefined;

  if (!challengeInfo || challengeInfo.orderAccountId !== accountId) {
    return NextResponse.json({ type: 'urn:ietf:params:acme:error:unauthorized', detail: 'Challenge not found or not authorized for this account' }, { status: 401, headers: responseHeaders });
  }

  const requestUrl = `${BASE_URL}/api/acme/challenge/${challengeId}`;
  if (protectedHeader.url !== requestUrl) { /* ... error ... */
      return NextResponse.json({ type: 'urn:ietf:params:acme:error:malformed', detail: `Invalid JWS protected header URL. Expected ${requestUrl}` }, { status: 400, headers: responseHeaders });
  }
  if (!await verifyJws(protectedHeader, challengePayload, signature, accountId)) { /* ... error ... */
      return NextResponse.json({ type: 'urn:ietf:params:acme:error:unauthorized', detail: 'JWS verification failed' }, { status: 401, headers: responseHeaders });
  }

  // 3. チャレンジ処理
  if (challengeInfo.status !== 'pending') {
    // Return current state if not pending (e.g., already processing, valid, or invalid)
    responseHeaders.set('Content-Type', 'application/json');
    return NextResponse.json(challengeInfoToResponse(challengeInfo), { status: 200, headers: responseHeaders });
  }

  db.prepare("UPDATE AcmeChallenges SET status = 'processing' WHERE id = ?").run(challengeId);
  challengeInfo.status = 'processing'; // Update local copy
  console.log(`Challenge ${challengeId} status to processing.`);

  // Simulate async validation. In real world, this would be a separate worker/process.
  // For HTTP-01, validationPayload should contain the content served by the client at the HTTP challenge URL.
  // This simulator expects the client UI to *manually* set this `validationPayload` in the DB via a separate (mock) UI action.
  // Here, we check if that payload matches the expected keyAuthorization.
  (async () => {
    try {
      let isValid = false;
      if (challengeInfo.type === 'http-01') {
        const accountJwk: Jwk = JSON.parse(challengeInfo.accountJwkString);
        const expectedKeyAuth = await generateKeyAuthorization(challengeInfo.token, accountJwk);

        // Retrieve the client-provided validation content (simulated)
        // For this simulation, we assume a UI element allows the user to "confirm" file placement,
        // which then updates `validationPayload` in the DB with the *expected* keyAuth.
        // A more realistic simulation might have a specific field in the DB for the client to *actually* write to.
        const clientProvidedKeyAuth = challengeInfo.validationPayload; // This is what the client *claims* to have set up.

        if (clientProvidedKeyAuth === expectedKeyAuth) {
          isValid = true;
          console.log(`HTTP-01 challenge ${challengeId} for ${challengeInfo.identifierValue} validated successfully.`);
        } else {
          console.warn(`HTTP-01 challenge ${challengeId} for ${challengeInfo.identifierValue} FAILED. Expected '${expectedKeyAuth}', client provided (via DB mock): '${clientProvidedKeyAuth}'`);
          db.prepare("UPDATE AcmeChallenges SET validationPayload = ? WHERE id = ?").run(JSON.stringify({error: 'KeyAuthMismatch', expected: expectedKeyAuth, got: clientProvidedKeyAuth}), challengeId);
        }
      }
      // TODO: Implement other challenge types if needed (dns-01, etc.)

      const finalStatus = isValid ? 'valid' : 'invalid';
      db.prepare("UPDATE AcmeChallenges SET status = ?, validated = ? WHERE id = ?")
        .run(finalStatus, new Date().toISOString(), challengeId);
      console.log(`Challenge ${challengeId} status to ${finalStatus}.`);

      await updateAuthzStatus(challengeInfo.authzId, challengeInfo.orderId);

    } catch (validationError) {
      console.error(`Error during async validation of challenge ${challengeId}:`, validationError);
      db.prepare("UPDATE AcmeChallenges SET status = 'invalid', validationPayload = ? WHERE id = ?")
        .run(JSON.stringify({error: 'ValidationError', detail: (validationError as Error).message }), challengeId);
      await updateAuthzStatus(challengeInfo.authzId, challengeInfo.orderId);
    }
  })(); // Fire-and-forget for simulation

  // Return the challenge object in its current state (likely 'processing')
  responseHeaders.set('Content-Type', 'application/json');
  return NextResponse.json(challengeInfoToResponse(challengeInfo), { status: 200, headers: responseHeaders });
}

function challengeInfoToResponse(chInfo: DbChallengeResult & {orderId: string; identifierValue: string; orderAccountId: string; accountJwkString: string;}): AcmeChallenge {
    return {
        id: chInfo.id,
        type: chInfo.type,
        url: chInfo.url,
        status: chInfo.status,
        token: chInfo.token,
        validated: chInfo.validated || undefined,
        // error: chInfo.validationPayload && chInfo.status === 'invalid' ? JSON.parse(chInfo.validationPayload) : undefined // More robust error parsing needed
    };
}
