import { NextResponse } from 'next/server';
import { generateNonce } from '@/lib/acme';

export async function GET() {
  const nonce = generateNonce();
  const headers = new Headers();
  headers.set('Replay-Nonce', nonce);
  headers.set('Cache-Control', 'no-store');
  // GETリクエストに対しては RFC 8555 Section 7.2 に従い 204 No Content が推奨される
  return new NextResponse(null, { status: 204, headers });
}

export async function HEAD() {
  const nonce = generateNonce();
  const headers = new Headers();
  headers.set('Replay-Nonce', nonce);
  headers.set('Cache-Control', 'no-store');
  return new NextResponse(null, { status: 200, headers }); // HEADは200 OKを返すのが一般的
}
