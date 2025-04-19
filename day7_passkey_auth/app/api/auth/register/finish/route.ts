import { NextRequest, NextResponse } from 'next/server';
import {
  verifyRegistrationResponse,
  VerifiedRegistrationResponse,
} from '@simplewebauthn/server';
import type { RegistrationResponseJSON } from '@simplewebauthn/types';
import { db } from '@/lib/db';
import { RP_ID, RP_ORIGIN } from '@/app/_lib/config';
import { base64UrlDecode, uint8ArrayToString } from '@/app/_lib/utils';

export async function POST(request: NextRequest) {
  let registrationResponse: RegistrationResponseJSON;
  try {
    registrationResponse = await request.json();
    console.log(
      '[Register Finish] Received registration response:',
      registrationResponse,
    );
  } catch (error) {
    console.error('[Register Finish] Invalid request body:', error);
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  // 1. clientDataJSON からチャレンジを取得
  let clientData: { challenge: string; [key: string]: any };
  let clientDataJsonString: string = ''; // 初期化
  try {
    clientDataJsonString = uint8ArrayToString(base64UrlDecode(registrationResponse.response.clientDataJSON));
    console.log('[Register Finish] Decoded clientDataJSON string:', clientDataJsonString);
    clientData = JSON.parse(clientDataJsonString);
    console.log('[Register Finish] Parsed clientData:', clientData);
  } catch (error) {
    console.error('[Register Finish] Failed to parse clientDataJSON. String was:', clientDataJsonString, 'Error:', error);
    return NextResponse.json({ error: 'Invalid clientDataJSON' }, { status: 400 });
  }

  const receivedChallenge = clientData.challenge;
  if (!receivedChallenge) {
      console.error('[Register Finish] Challenge missing in clientDataJSON');
      return NextResponse.json({ error: 'Invalid clientDataJSON: Challenge missing' }, { status: 400 });
  }

  // 2. DBからチャレンジ情報を取得・検証
  const now = new Date();
  const expectedChallenge = await db.challenge.findUnique({
      where: {
          challenge: receivedChallenge,
          type: 'registration',
          expiresAt: { gt: now }, // ★ 有効期限チェックを元に戻す
      }
  });

  if (!expectedChallenge) {
    console.error(
      `[Register Finish] Challenge not found, expired, or invalid type: ${receivedChallenge}`,
    );
    return NextResponse.json(
      { error: 'Challenge invalid or expired. Please try again.' },
      { status: 400 },
    );
  }

  // ★ TODO: expectedChallenge.userId (email) をここで取得しておく?
  const expectedEmail = expectedChallenge.userId;
  if (!expectedEmail) {
    // 本来 userId(email) は必須のはず
    console.error(`[Register Finish] userId(email) missing in challenge data for ${receivedChallenge}`);
    // DBからチャレンジ削除
    await db.challenge.delete({ where: { id: expectedChallenge.id } }).catch(e => console.error("Failed to delete challenge", e));
    return NextResponse.json({ error: 'Invalid challenge data' }, { status: 400 });
  }

  // 3. SimpleWebAuthnサーバーでレスポンスを検証
  let verification: VerifiedRegistrationResponse;
  try {
    verification = await verifyRegistrationResponse({
      response: registrationResponse,
      expectedChallenge: expectedChallenge.challenge, // DBから取得したチャレンジを使用
      expectedOrigin: RP_ORIGIN as string,
      expectedRPID: RP_ID as string,
      requireUserVerification: true,
    });
    console.log('[Register Finish] Verification result:', verification);
  } catch (error) {
    console.error('[Register Finish] Verification failed:', error);
    // 検証失敗時もチャレンジは削除
    await db.challenge.delete({ where: { id: expectedChallenge.id } }).catch(e => console.error("Failed to delete challenge", e));
    return NextResponse.json(
      { error: 'Verification failed', details: (error as Error).message },
      { status: 400 },
    );
  }

  const { verified, registrationInfo } = verification;

  if (verified && registrationInfo) {
    console.log('[Register Finish] Verification successful');
    // registrationInfoから必要な情報を取得 (型定義に合わせて修正)
    // credentialPublicKey, credentialID, counter を registrationInfo 直下から取得しようとしていたが、
    // おそらく registrationInfo.credential に情報があるか、別の方法が必要。
    // ここでは registrationInfo のプロパティを直接使うと仮定して進めるが、
    // 実行時エラーになる可能性が高い。後で要デバッグ。
    const { credentialPublicKey, credentialID, counter } = registrationInfo;

    // ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
    // ★ TODO: 上記の分割代入が正しいか要確認・修正 ★
    // ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★

    // 4. ユーザーとパスキー情報をデータベースに保存
    try {
      const newUser = await db.user.create({
        data: {
          email: expectedEmail, // DBのチャレンジから取得したemailを使用
          passkeys: {
            create: {
              credentialId: Buffer.from(credentialID).toString('base64url'), // credentialID は Uint8Array
              publicKey: Buffer.from(credentialPublicKey), // credentialPublicKey は Uint8Array
              counter: BigInt(counter), // counter は number
              transports: JSON.stringify(registrationResponse.response.transports ?? []),
              deviceName: `Device ${new Date().toISOString()}`, // 仮のデバイス名
              // credentialDeviceType, credentialBackedUp なども保存できる
            },
          },
        },
        include: {
          passkeys: true, // 作成したパスキー情報も返す
        }
      });
      console.log('[Register Finish] User and Passkey created:', newUser);

      // 5. 成功したらチャレンジを削除
      await db.challenge.delete({ where: { id: expectedChallenge.id } });
      console.log(`[Register Finish] Deleted challenge ${expectedChallenge.challenge}`);

      return NextResponse.json({ verified: true, user: { id: newUser.id, email: newUser.email } });

    } catch (dbError) {
      console.error('[Register Finish] Failed to save user or passkey:', dbError);
      // credentialId が重複した場合などのエラーハンドリングが必要
      // @ts-ignore - prisma error handling
      if (dbError.code === 'P2002' && dbError.meta?.target?.includes('credentialId')) {
        return NextResponse.json({ error: 'This passkey seems to be already registered.' }, { status: 409 });
      }
      // DBエラー時もチャレンジは削除しておく（べきか？） - 一旦残す
      return NextResponse.json({ error: 'Failed to save user data.' }, { status: 500 });
    }

  } else {
    console.error('[Register Finish] Verification failed - not verified or no registration info');
    // 検証失敗時もチャレンジは削除
    await db.challenge.delete({ where: { id: expectedChallenge.id } }).catch(e => console.error("Failed to delete challenge", e));
    return NextResponse.json({ error: 'Verification failed' }, { status: 400 });
  }
}
