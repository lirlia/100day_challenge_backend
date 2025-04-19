import { NextRequest, NextResponse } from 'next/server';
import {
  verifyAuthenticationResponse,
  VerifiedAuthenticationResponse,
} from '@simplewebauthn/server';
import type { AuthenticationResponseJSON } from '@simplewebauthn/types';
import { db } from '@/lib/db';
import { RP_ID, RP_ORIGIN } from '@/app/_lib/config';
import { Passkey } from '@prisma/client';
import { base64UrlDecode, uint8ArrayToString } from '@/app/_lib/utils';

// 仮のユーザー認証: ヘッダーから 'x-user-id' を取得
function getUserIdFromRequest(request: NextRequest): string | null {
  return request.headers.get('x-user-id');
}

export async function POST(
  request: NextRequest,
  { params }: { params: { requestId: string } },
) {
  const userId = getUserIdFromRequest(request); // 承認者の User ID
  const { requestId } = params;
  let authenticationResponse: AuthenticationResponseJSON;

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!requestId) {
    return NextResponse.json({ error: 'Request ID is required' }, { status: 400 });
  }

  try {
    authenticationResponse = await request.json();
    console.log(
      `[Approval Finish] User ${userId} finishing approval for request ${requestId} with response:`, authenticationResponse,
    );
  } catch (error) {
    console.error('[Approval Finish] Invalid request body:', error);
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  // 1. clientDataJSON からチャレンジを取得
  let clientData: { challenge: string; [key: string]: any };
  try {
    clientData = JSON.parse(
      uint8ArrayToString(base64UrlDecode(authenticationResponse.response.clientDataJSON))
    );
  } catch (error) {
    console.error('[Approval Finish] Invalid clientDataJSON:', error);
    return NextResponse.json({ error: 'Invalid clientDataJSON' }, { status: 400 });
  }
  const receivedChallenge = clientData.challenge;

  // 2. 承認リクエストと承認者のパスキー情報をDBから取得
  const approvalRequest = await db.deviceApprovalRequest.findUnique({
    where: {
      id: requestId,
      userId: userId,
      status: 'pending',
    },
    include: {
      user: { include: { passkeys: true } },
    },
  });

  if (!approvalRequest || !approvalRequest.challenge) {
    console.error(
      `[Approval Finish] Approval request ${requestId} not found, not pending, or challenge missing`,
    );
    return NextResponse.json(
      { error: 'Approval request not found or invalid' },
      { status: 404 },
    );
  }

  // 3. DBに保存したチャレンジとクライアントからのチャレンジが一致するか確認
  if (receivedChallenge !== approvalRequest.challenge) {
    console.error(
      `[Approval Finish] Challenge mismatch for request ${requestId}. Expected ${approvalRequest.challenge}, got ${receivedChallenge}`,
    );
    return NextResponse.json({ error: 'Challenge mismatch' }, { status: 400 });
  }

  // 4. 認証に使用されたパスキーを特定
  const credentialIdFromResponse = authenticationResponse.id;
  const authenticator = approvalRequest.user.passkeys.find(
    (pk) => pk.credentialId === credentialIdFromResponse,
  );

  if (!authenticator) {
    console.error(
      `[Approval Finish] Authenticator ${credentialIdFromResponse} not found for user ${userId}`,
    );
    return NextResponse.json({ error: 'Authenticator not found' }, { status: 400 });
  }

  // 5. 認証レスポンスを検証
  let verification: VerifiedAuthenticationResponse;
  try {
    verification = await verifyAuthenticationResponse({
      response: authenticationResponse,
      expectedChallenge: approvalRequest.challenge, // DBのチャレンジを使用
      expectedOrigin: RP_ORIGIN as string,
      expectedRPID: RP_ID as string,
      authenticatorPublicKey: authenticator.publicKey,
      authenticatorCounter: Number(authenticator.counter),
      requireUserVerification: true,
    });
    console.log('[Approval Finish] Verification result:', verification);

  } catch (error) {
    console.error('[Approval Finish] Verification failed:', error);
    return NextResponse.json(
      { error: 'Verification failed', details: (error as Error).message },
      { status: 400 },
    );
  }

  const { verified, authenticationInfo } = verification;

  if (verified) {
    console.log(`[Approval Finish] Verification successful for request ${requestId}`);
    // 7. DBのカウンターを更新
    try {
      await db.passkey.update({
        where: { credentialId: authenticator.credentialId },
        data: { counter: BigInt(authenticationInfo.newCounter) },
      });
    } catch (dbError) {
      console.error('[Approval Finish] Failed to update counter:', dbError);
      // ここでのエラーは致命的ではないかもしれない
    }

    // 8. 承認リクエストのステータスを 'approved' に更新
    try {
      await db.deviceApprovalRequest.update({
        where: { id: requestId },
        data: { status: 'approved', challenge: null }, // challenge は不要になったのでクリア
      });
      console.log(`[Approval Finish] Marked request ${requestId} as approved`);
      // 9. 成功レスポンス
      return NextResponse.json({ verified: true, status: 'approved' });

    } catch (dbError) {
       console.error('[Approval Finish] Failed to update approval request status:', dbError);
       return NextResponse.json({ error: 'Failed to finalize approval' }, { status: 500 });
    }

  } else {
    console.error('[Approval Finish] Verification failed - not verified');
    return NextResponse.json({ error: 'Verification failed' }, { status: 400 });
  }
}
