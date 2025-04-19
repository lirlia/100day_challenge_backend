import { NextRequest, NextResponse } from 'next/server';
import {
  verifyRegistrationResponse,
  VerifiedRegistrationResponse,
} from '@simplewebauthn/server';
import type { RegistrationResponseJSON } from '@simplewebauthn/types';
import { db } from '@/lib/db';
import { RP_ID, RP_ORIGIN } from '@/app/_lib/config';
import { base64UrlDecode, uint8ArrayToString } from '@/app/_lib/utils';

// 仮のユーザー認証: ヘッダーから 'x-user-id' を取得
function getUserIdFromRequest(request: NextRequest): string | null {
  return request.headers.get('x-user-id');
}

export async function POST(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  let registrationResponse: RegistrationResponseJSON;

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    registrationResponse = await request.json();
    console.log(
      `[Passkey Register Finish] User ${userId} finishing passkey registration with response:`, registrationResponse,
    );
  } catch (error) {
    console.error('[Passkey Register Finish] Invalid request body:', error);
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  // 1. clientDataJSON からチャレンジを取得
  let clientData: { challenge: string; [key: string]: any };
  try {
    clientData = JSON.parse(uint8ArrayToString(registrationResponse.response.clientDataJSON));
  } catch (error) {
    console.error('[Passkey Register Finish] Invalid clientDataJSON:', error);
    return NextResponse.json({ error: 'Invalid clientDataJSON' }, { status: 400 });
  }
  const receivedChallenge = clientData.challenge;

  // 2. DBからチャレンジ情報を取得・検証
  const now = new Date();
  const expectedChallenge = await db.challenge.findUnique({
      where: {
          challenge: receivedChallenge,
          userId: userId, // ユーザーIDも一致確認
          type: 'registration', // registration タイプ
          expiresAt: { gt: now },
      }
  });

  if (!expectedChallenge) {
    console.error(
      `[Passkey Register Finish] Challenge not found, expired, or userId mismatch for user ${userId}`,
    );
    return NextResponse.json(
      { error: 'Challenge invalid or expired. Please try again.' },
      { status: 400 },
    );
  }

  // 3. SimpleWebAuthnサーバーでレスポンスを検証
  let verification: VerifiedRegistrationResponse;
  try {
    verification = await verifyRegistrationResponse({
      response: registrationResponse,
      expectedChallenge: expectedChallenge.challenge,
      expectedOrigin: RP_ORIGIN as string,
      expectedRPID: RP_ID as string,
      requireUserVerification: true,
    });
    console.log('[Passkey Register Finish] Verification result:', verification);
  } catch (error) {
    console.error('[Passkey Register Finish] Verification failed:', error);
    await db.challenge.delete({ where: { id: expectedChallenge.id } }).catch(e => console.error("Failed to delete challenge", e));
    return NextResponse.json(
      { error: 'Verification failed', details: (error as Error).message },
      { status: 400 },
    );
  }

  const { verified, registrationInfo } = verification;

  if (verified && registrationInfo) {
    console.log('[Passkey Register Finish] Verification successful');
    const { credentialPublicKey, credentialID, counter } = registrationInfo;

    // ★ TODO: register/finish と同様の型エラーが発生する可能性。要確認・修正 ★

    // 4. 新しいパスキー情報をデータベースに保存
    try {
      const newPasskey = await db.passkey.create({
        data: {
          userId: userId,
          credentialId: Buffer.from(credentialID).toString('base64url'),
          publicKey: Buffer.from(credentialPublicKey),
          counter: BigInt(counter),
          transports: JSON.stringify(registrationResponse.response.transports ?? []),
          deviceName: `Device ${new Date().toISOString()}`, // 仮のデバイス名
        },
      });
      console.log(
        `[Passkey Register Finish] New passkey ${newPasskey.id} created for user ${userId}`,
      );

      // 5. 成功したらチャレンジを削除
      await db.challenge.delete({ where: { id: expectedChallenge.id } });
      console.log(`[Passkey Register Finish] Deleted challenge ${expectedChallenge.challenge}`);

      return NextResponse.json({ verified: true, passkey: { id: newPasskey.id } });

    } catch (dbError) {
      console.error('[Passkey Register Finish] Failed to save passkey:', dbError);
      // @ts-ignore - prisma error handling
      if (dbError.code === 'P2002' && dbError.meta?.target?.includes('credentialId')) {
        return NextResponse.json({ error: 'This passkey seems to be already registered.' }, { status: 409 });
      }
      return NextResponse.json({ error: 'Failed to save passkey data.' }, { status: 500 });
    }
  } else {
    console.error('[Passkey Register Finish] Verification failed - not verified or no registration info');
    await db.challenge.delete({ where: { id: expectedChallenge.id } }).catch(e => console.error("Failed to delete challenge", e));
    return NextResponse.json({ error: 'Verification failed' }, { status: 400 });
  }
}
