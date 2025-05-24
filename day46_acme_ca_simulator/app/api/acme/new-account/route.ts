import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { verifyJws, generateNonce, type Jwk } from '@/lib/acme';
import crypto from 'node:crypto';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001';

interface NewAccountPayload {
  termsOfServiceAgreed?: boolean;
  contact?: string[];
  onlyReturnExisting?: boolean;
}

interface AcmeAccountForResponse {
  id: string;
  kid: string; // Account URL
  status: 'valid' | 'deactivated' | 'revoked';
  contact?: string[];
  termsOfServiceAgreed?: boolean;
  orders: string; // URL to list orders for this account
  // initialIp: string;
  // createdAt: string;
  jwk: Jwk; // For client to verify, not usually returned but useful for simulation
}

export async function POST(request: Request) {
  const newNonce = generateNonce();
  const headers = new Headers({
    'Replay-Nonce': newNonce,
    'Cache-Control': 'no-store',
    'Content-Type': 'application/problem+json', // Default for errors
  });

  let jwsFlattenedJson: any;
  try {
    jwsFlattenedJson = await request.json();
  } catch (e) {
    return NextResponse.json({ type: 'urn:ietf:params:acme:error:malformed', detail: 'Failed to parse JWS' }, { status: 400, headers });
  }

  const { protected: protectedHeaderB64, payload: payloadB64, signature } = jwsFlattenedJson;
  if (!protectedHeaderB64 || !payloadB64 || !signature) {
    return NextResponse.json({ type: 'urn:ietf:params:acme:error:malformed', detail: 'Invalid JWS structure' }, { status: 400, headers });
  }

  let protectedHeader: any;
  let payload: NewAccountPayload;
  try {
    protectedHeader = JSON.parse(Buffer.from(protectedHeaderB64, 'base64url').toString('utf8'));
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch (e) {
    return NextResponse.json({ type: 'urn:ietf:params:acme:error:malformed', detail: 'Failed to parse JWS components' }, { status: 400, headers });
  }

  // Verify JWS (simplified)
  // For new-account, accountId is undefined as it's being created.
  // The public key is in protectedHeader.jwk
  const jwk = protectedHeader.jwk as Jwk;
  if (!jwk) {
     return NextResponse.json({ type: 'urn:ietf:params:acme:error:malformed', detail: 'JWS protected header must contain jwk for new account creation' }, { status: 400, headers });
  }

  // The URL in protected header must match the request URL
  if (protectedHeader.url !== `${BASE_URL}/api/acme/new-account`) {
    return NextResponse.json({ type: 'urn:ietf:params:acme:error:malformed', detail: `Invalid JWS protected header URL. Expected ${BASE_URL}/api/acme/new-account` }, { status: 400, headers });
  }

  if (!await verifyJws(protectedHeader, payload, signature)) {
    return NextResponse.json({ type: 'urn:ietf:params:acme:error:unauthorized', detail: 'JWS verification failed' }, { status: 401, headers });
  }

  // Logic to handle account creation or return existing
  try {
    const jwkString = JSON.stringify(jwk); // Store JWK as string

    // Check if account with this JWK already exists
    const existingAccountStmt = db.prepare('SELECT id, status, contact, termsOfServiceAgreed FROM AcmeAccounts WHERE jwk = ?');
    const existingAccount = existingAccountStmt.get(jwkString) as Omit<AcmeAccountForResponse, 'kid' | 'orders' | 'jwk'> | undefined;

    if (existingAccount) {
      const accountUrl = `${BASE_URL}/api/acme/account/${existingAccount.id}`;
      const responseBody: AcmeAccountForResponse = {
        ...existingAccount,
        id: existingAccount.id,
        kid: accountUrl,
        orders: `${accountUrl}/orders`,
        jwk: jwk, // Return the JWK that was used
      };
      headers.set('Location', accountUrl);
      headers.set('Content-Type', 'application/json');
      return NextResponse.json(responseBody, { status: 200, headers });
    }

    if (payload.onlyReturnExisting) {
      return NextResponse.json({ type: 'urn:ietf:params:acme:error:accountDoesNotExist', detail: 'Account does not exist and onlyReturnExisting was set' }, { status: 400, headers });
    }

    // Create new account
    const newAccountId = crypto.randomUUID();
    const termsAgreed = payload.termsOfServiceAgreed === true; // Must be explicitly true

    const insertStmt = db.prepare(
      'INSERT INTO AcmeAccounts (id, jwk, contact, status, termsOfServiceAgreed, initialIp, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    insertStmt.run(
      newAccountId,
      jwkString,
      payload.contact ? JSON.stringify(payload.contact) : null,
      'valid',
      termsAgreed ? 1 : 0,
      request.headers.get('x-forwarded-for') || 'unknown', // Simple IP logging
      new Date().toISOString()
    );

    const accountUrl = `${BASE_URL}/api/acme/account/${newAccountId}`;
    const responseBody: AcmeAccountForResponse = {
      id: newAccountId,
      kid: accountUrl,
      status: 'valid',
      contact: payload.contact,
      termsOfServiceAgreed: termsAgreed,
      orders: `${accountUrl}/orders`,
      jwk: jwk,
    };

    headers.set('Location', accountUrl);
    headers.set('Content-Type', 'application/json');
    return NextResponse.json(responseBody, { status: 201, headers });

  } catch (dbError: any) {
    console.error('Database error during account processing:', dbError);
    return NextResponse.json({ type: 'urn:ietf:params:acme:error:serverInternal', detail: 'Database operation failed' }, { status: 500, headers });
  }
}
