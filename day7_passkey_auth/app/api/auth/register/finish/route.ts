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
    await db.challenge.delete({ where: { id: expectedChallenge.id } }).catch((e: any) => console.error("Failed to delete challenge", e));
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
    await db.challenge.delete({ where: { id: expectedChallenge.id } }).catch((e: any) => console.error("Failed to delete challenge", e));
    return NextResponse.json(
      { error: 'Verification failed', details: (error as Error).message },
      { status: 400 },
    );
  }

  const { verified, registrationInfo } = verification;

  if (verified && registrationInfo) {
    console.log('[Register Finish] Verification successful');

    // registrationInfoから正しいプロパティを取得 (ログに基づき修正)
    const credential = registrationInfo.credential;
    if (!credential) {
        console.error('[Register Finish] Missing credential object in registration info:', { registrationInfo });
        await db.challenge.delete({ where: { id: expectedChallenge.id } }).catch((e: any) => console.error("Failed to delete challenge", e));
        return NextResponse.json({ error: 'Internal Server Error: Invalid registration data format.' }, { status: 500 });
    }

    const credentialPublicKey = credential.publicKey; // Uint8Array
    const credentialID_String = credential.id;       // Base64URL String
    const counter = credential.counter;               // number
    const transports = credential.transports;         // string[] | undefined

    // 取得した値の存在チェック
    // credentialID_String は空文字列でないか、publicKey は存在するか、 counter は number か
    if (!credentialPublicKey || !credentialID_String || typeof counter !== 'number') {
        console.error('[Register Finish] Missing essential credential info:', { credential });
        await db.challenge.delete({ where: { id: expectedChallenge.id } }).catch((e: any) => console.error("Failed to delete challenge", e));
        return NextResponse.json({ error: 'Internal Server Error: Invalid credential data received after verification.' }, { status: 500 });
    }

    // 4. ユーザーとパスキー情報をデータベースに保存
    try {
      // Check if user already exists
      let user = await db.user.findUnique({
        where: { email: expectedEmail },
      });

      if (user) {
        // User exists, just add the passkey
        console.log(`[Register Finish] User ${expectedEmail} already exists. Adding new passkey.`);
        // 既存ユーザーに同じ Credential ID が登録されていないかチェック
        const existingPasskey = await db.passkey.findUnique({
            where: { credentialId: credentialID_String },
        });
        if (existingPasskey) {
            console.warn(`[Register Finish] Passkey with Credential ID ${credentialID_String} already exists for user ${existingPasskey.userId}. Aborting.`);
            // すでに登録済みの場合はエラーとする（もしくは何もしない）
            await db.challenge.delete({ where: { id: expectedChallenge.id } }).catch((e: any) => console.error("Failed to delete challenge", e));
            return NextResponse.json({ error: 'This passkey is already registered.' }, { status: 409 });
        }

        await db.passkey.create({
          data: {
            userId: user.id,
            credentialId: credentialID_String, // Base64URL String をそのまま保存
            publicKey: Buffer.from(credentialPublicKey), // Uint8ArrayをBufferに変換
            counter: BigInt(counter),
            transports: JSON.stringify(transports ?? []),
            deviceName: `Device ${new Date().toISOString()}`, // 仮のデバイス名
          },
        });
      } else {
        // User does not exist, create user and passkey together
        console.log(`[Register Finish] Creating new user ${expectedEmail} and first passkey.`);
        user = await db.user.create({
          data: {
            email: expectedEmail,
            passkeys: {
              create: {
                credentialId: credentialID_String, // Base64URL String をそのまま保存
                publicKey: Buffer.from(credentialPublicKey), // Uint8ArrayをBufferに変換
                counter: BigInt(counter),
                transports: JSON.stringify(transports ?? []),
                deviceName: `Device ${new Date().toISOString()}`, // 仮のデバイス名
              },
            },
          },
        });
      }

      console.log('[Register Finish] User/Passkey operation successful for user ID:', user.id);

      // 5. 成功したらチャレンジを削除
      await db.challenge.delete({ where: { id: expectedChallenge.id } });
      console.log(`[Register Finish] Deleted challenge ${expectedChallenge.challenge}`);

      return NextResponse.json({ verified: true, user: { id: user.id, email: user.email } });

    } catch (dbError: any) {
      console.error('[Register Finish] Failed to save user or passkey:', dbError);
      // credentialId が重複した場合などのエラーハンドリング (Prisma固有のエラーコードP2002)
      if (dbError.code === 'P2002' && dbError.meta?.target?.includes('credentialId')) {
        return NextResponse.json({ error: 'This passkey seems to be already registered.' }, { status: 409 });
      }
      // その他のDBエラー
      return NextResponse.json({ error: 'Failed to save registration data.' }, { status: 500 });
    }

  } else {
    console.error('[Register Finish] Verification failed - not verified or no registration info');
    // 検証失敗時もチャレンジは削除
    await db.challenge.delete({ where: { id: expectedChallenge.id } }).catch((e: any) => console.error("Failed to delete challenge", e));
    return NextResponse.json({ error: 'Verification failed' }, { status: 400 });
  }
}
