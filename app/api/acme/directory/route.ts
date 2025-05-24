import { NextResponse } from 'next/server';

// このURLは、実際のデプロイ環境に合わせて調整する必要があります。
// localhost:3001 をベースURLとします。
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001';

export async function GET() {
  const directory = {
    newNonce: `${BASE_URL}/api/acme/new-nonce`,
    newAccount: `${BASE_URL}/api/acme/new-account`,
    newOrder: `${BASE_URL}/api/acme/new-order`,
    // newAuthz: `${BASE_URL}/api/acme/new-authz`, // 通常、newAuthzは非推奨か提供されない
    revokeCert: `${BASE_URL}/api/acme/revoke-cert`,
    keyChange: `${BASE_URL}/api/acme/key-change`,
    meta: {
      termsOfService: `${BASE_URL}/terms-of-service.pdf`, // ダミー
      website: BASE_URL,
      caaIdentities: ['example.com'], // CAが証明書を発行する権限を持つドメイン (ダミー)
      externalAccountRequired: false,
    },
  };
  return NextResponse.json(directory);
}
