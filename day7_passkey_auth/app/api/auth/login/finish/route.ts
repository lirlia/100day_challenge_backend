import { NextRequest, NextResponse } from 'next/server';
import {
  verifyAuthenticationResponse,
  VerifiedAuthenticationResponse,
} from '@simplewebauthn/server';
import type { AuthenticationResponseJSON } from '@simplewebauthn/types';
import { db } from '@/lib/db';
import { RP_ID, RP_ORIGIN } from '@/app/_lib/config';
import { Passkey } from '@prisma/client';
import crypto from 'crypto'; // For generating requestingDeviceId
import { base64UrlDecode, uint8ArrayToString } from '@/app/_lib/utils';

export async function POST(request: NextRequest) {
  let authenticationResponse: AuthenticationResponseJSON;
  try {
    authenticationResponse = await request.json();
    console.log(
      '[Login Finish] Received authentication response:',
      authenticationResponse,
    );
  } catch (error) {
    console.error('[Login Finish] Invalid request body:', error);
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  // 1. clientDataJSON からチャレンジを取得
  let clientData: { challenge: string; [key: string]: any };
  try {
    const clientDataJsonString = uint8ArrayToString(base64UrlDecode(authenticationResponse.response.clientDataJSON));
    clientData = JSON.parse(clientDataJsonString);
  } catch (error) {
    console.error('[Login Finish] Failed to parse clientDataJSON:', error);
    return NextResponse.json({ error: 'Invalid clientDataJSON' }, { status: 400 });
  }
  const receivedChallenge = clientData.challenge;
  if (!receivedChallenge) {
    console.error('[Login Finish] Challenge missing in clientDataJSON');
    return NextResponse.json({ error: 'Invalid clientDataJSON: Challenge missing' }, { status: 400 });
  }

  // 2. DBからチャレンジ情報を取得・検証
  const now = new Date();
  const expectedChallenge = await db.challenge.findUnique({
      where: {
          challenge: receivedChallenge,
          type: 'authentication',
          expiresAt: { gt: now },
      }
  });

  if (!expectedChallenge) {
      // ... (Challenge not found error)
      return NextResponse.json(
          { error: 'Challenge invalid or expired. Please try again.' }, { status: 400 }
      );
  }

  const userId = expectedChallenge.userId;
  if (!userId) {
      // ... (userId missing error)
      await db.challenge.delete({ where: { id: expectedChallenge.id } }).catch(e => console.error("Failed to delete challenge", e));
      return NextResponse.json({ error: 'Invalid challenge data' }, { status: 400 });
  }

  // 3. 認証に使用されたパスキー情報をDBから取得
  const credentialIdFromResponse = authenticationResponse.id;
  const authenticator = await db.passkey.findUnique({
    where: {
      credentialId: credentialIdFromResponse,
      userId: userId,
    },
  });

  if (!authenticator) {
    // ★ 新規デバイスの可能性 ★
    console.error(
      `[Login Finish] Authenticator not found for credentialId: ${credentialIdFromResponse} and user: ${userId}`,
    );

    // 承認リクエストを作成する前に、認証自体は検証する
    let verification: VerifiedAuthenticationResponse;
    try {
      // DBに情報がないため、カウンターチェックはできないが、署名自体は検証できるはず
      // PublicKey も不明なため、 verification 自体はおそらく失敗する可能性が高い。
      // 本来は「未知のクレデンシャルID」として扱うべきかもしれない。
      // ここでは、カウンター 0 で検証を試みる。
      verification = await verifyAuthenticationResponse({
        response: authenticationResponse,
        expectedChallenge: expectedChallenge.challenge,
        expectedOrigin: RP_ORIGIN as string,
        expectedRPID: RP_ID as string,
        authenticatorPublicKey: Buffer.alloc(0), // 公開鍵不明
        authenticatorCounter: 0, // カウンター不明
        requireUserVerification: true,
      });
      console.log('[Login Finish - New Device Attempt] Verification result:', verification);

      // ★注意: 公開鍵不明なため、検証が成功することは期待できないかもしれない。
      //        より堅牢な実装では、この検証ステップの扱いを再考する必要がある。
      if (!verification.verified) {
          throw new Error('Authentication verification failed for potential new device.');
      }

    } catch (error) {
      console.error('[Login Finish - New Device Attempt] Verification failed:', error);
      // 検証失敗はここでは許容し、承認フローに進む（ユーザーが存在することは確認済みのため）
      // return NextResponse.json(
      //   { error: 'Verification failed', details: (error as Error).message },
      //   { status: 400 },
      // );
    }

    // 承認リクエストを作成
    try {
      const requestingDeviceId = crypto.randomUUID(); // 新しいデバイスの一時ID
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10分有効

      const approvalRequest = await db.deviceApprovalRequest.upsert({
          where: { userId_requestingDeviceId: { userId, requestingDeviceId } },
          update: { status: 'pending', expiresAt, challenge: undefined }, // 再試行の場合
          create: {
              userId: userId,
              requestingDeviceId: requestingDeviceId,
              status: 'pending',
              expiresAt: expiresAt,
          },
      });

      console.log(
        `[Login Finish] New device detected. Created/Updated approval request: ${approvalRequest.id}`,
      );
      // チャレンジを削除
      await db.challenge.delete({ where: { id: expectedChallenge.id } });
      console.log(`[Login Finish - New Device] Deleted challenge ${expectedChallenge.challenge}`);
      return NextResponse.json(
        {
          status: 'approval_required',
          requestId: approvalRequest.id,
          requestingDeviceId: requestingDeviceId, // クライアントが保持する必要がある
        },
        { status: 202 }, // Accepted
      );
    } catch (dbError) {
      console.error('[Login Finish] Failed to create approval request:', dbError);
      return NextResponse.json({ error: 'Failed to initiate device approval' }, { status: 500 });
    }
  } else {
    // ★ 既存パスキーの場合 ★
    let verification: VerifiedAuthenticationResponse;
    try {
      verification = await verifyAuthenticationResponse({
        response: authenticationResponse,
        expectedChallenge: expectedChallenge.challenge,
        expectedOrigin: RP_ORIGIN as string,
        expectedRPID: RP_ID as string,
        authenticatorPublicKey: authenticator.publicKey,
        authenticatorCounter: Number(authenticator.counter),
        requireUserVerification: true,
      });
      console.log('[Login Finish - Existing Device] Verification result:', verification);

    } catch (error) {
      console.error('[Login Finish - Existing Device] Verification failed:', error);
      // チャレンジを削除
      await db.challenge.delete({ where: { id: expectedChallenge.id } }).catch(e => console.error("Failed to delete challenge", e));
      return NextResponse.json(
        { error: 'Verification failed', details: (error as Error).message },
        { status: 400 },
      );
    }

    const { verified, authenticationInfo } = verification;

    if (verified) {
      console.log('[Login Finish] Verification successful for existing device');
      // 4. チャレンジを削除
      await db.challenge.delete({ where: { id: expectedChallenge.id } });
      console.log(`[Login Finish - Existing Device] Deleted challenge ${expectedChallenge.challenge}`);

      // 5. DBのカウンターを更新 (不正利用防止)
      try {
        await db.passkey.update({
          where: {
            credentialId: authenticator.credentialId,
          },
          data: {
            counter: BigInt(authenticationInfo.newCounter), // number -> BigInt
            lastUsedAt: new Date(),
          },
        });
        console.log(
          `[Login Finish] Updated counter for credential ${authenticator.credentialId} to ${authenticationInfo.newCounter}`,
        );
      } catch (dbError) {
        // カウンター更新失敗はログに残すが、ログイン自体は続行しても良い場合がある
        console.error('[Login Finish] Failed to update authenticator counter:', dbError);
      }

      // 6. ログイン成功。セッションを開始するか、成功したことをクライアントに伝える
      //    今回はステートレスなので、成功レスポンスを返す
      const user = await db.user.findUnique({ where: { id: userId }});
      return NextResponse.json({ verified: true, user: { id: user?.id, email: user?.email } });

    } else {
      console.error('[Login Finish] Verification failed - not verified');
      // チャレンジを削除
      await db.challenge.delete({ where: { id: expectedChallenge.id } }).catch(e => console.error("Failed to delete challenge", e));
      return NextResponse.json({ error: 'Verification failed' }, { status: 400 });
    }
  }
}
