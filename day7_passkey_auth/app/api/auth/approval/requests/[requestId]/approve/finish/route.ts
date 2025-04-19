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
      `[Approval Finish] User ${userId} finishing approval for request ${requestId} with response:`,
      JSON.stringify(authenticationResponse)
    );

    // クライアントからの直接のauthenticationResponseを期待
    if (!authenticationResponse || !authenticationResponse.response || !authenticationResponse.response.clientDataJSON) {
      console.error('[Approval Finish] Invalid authentication response format:', authenticationResponse);
      return NextResponse.json({
        error: 'Invalid authentication response format',
        expected: 'AuthenticationResponseJSON object with response.clientDataJSON field'
      }, {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  } catch (error) {
    console.error('[Approval Finish] Invalid request body:', error);
    return NextResponse.json({
      error: 'Invalid request body',
      details: (error as Error).message
    }, {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
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

  console.log('[Approval Finish] Found authenticator:', {
    id: authenticator.id,
    credentialId: authenticator.credentialId,
    counter: authenticator.counter,
    hasPublicKey: !!authenticator.publicKey,
    publicKeyLength: authenticator.publicKey ? authenticator.publicKey.length : 0
  });

  // 5. 認証レスポンスを検証
  let verification: VerifiedAuthenticationResponse;
  try {
    // 認証に使用する情報を準備
    const credentialID = base64UrlDecode(authenticator.credentialId);
    const publicKey = authenticator.publicKey;
    const counter = Number(authenticator.counter || 0);

    console.log('[Approval Finish] Preparing verification with:', {
      credentialIdLength: credentialID.length,
      publicKeyLength: publicKey?.length,
      counter
    });

    // @simplewebauthn/server v13 の形式で検証
    verification = await verifyAuthenticationResponse({
      response: authenticationResponse,
      expectedChallenge: approvalRequest.challenge,
      expectedOrigin: RP_ORIGIN as string,
      expectedRPID: RP_ID as string,
      requireUserVerification: true,
      credential: {
        id: authenticator.credentialId,
        publicKey: authenticator.publicKey,
        counter: Number(authenticator.counter || 0),
        transports: authenticator.transports ? JSON.parse(authenticator.transports) : undefined,
      }
    });

    console.log('[Approval Finish] Verification succeeded:', verification);
  } catch (error) {
    console.error('[Approval Finish] Verification failed with error:', error);
    return NextResponse.json(
      { error: 'Verification failed', details: (error as Error).message },
      {
        status: 400,
        headers: {
          'Content-Type': 'application/json'
        }
      },
    );
  }

  if (!verification?.verified) {
    console.error('[Approval Finish] Verification result was not verified:', verification);
    return NextResponse.json({ error: 'Verification failed - not verified' }, {
      status: 400,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  console.log(`[Approval Finish] Verification successful for request ${requestId}`);

  // 安全にauthenticationInfoにアクセス
  const newCounter = verification.authenticationInfo?.newCounter;
  if (typeof newCounter === 'number') {
    // 7. DBのカウンターを更新
    try {
      await db.passkey.update({
        where: { credentialId: authenticator.credentialId },
        data: { counter: BigInt(newCounter) },
      });
      console.log(`[Approval Finish] Updated counter to ${newCounter} for credential ${authenticator.credentialId}`);
    } catch (dbError) {
      console.error('[Approval Finish] Failed to update counter:', dbError);
      // ここでのエラーは致命的ではないかもしれない
    }
  } else {
    console.warn('[Approval Finish] No new counter value available, skipping counter update');
  }

  // 8. 承認リクエストのステータスを 'approved' に更新
  try {
    await db.deviceApprovalRequest.update({
      where: { id: requestId },
      data: { status: 'approved', challenge: null }, // challenge は不要になったのでクリア
    });
    console.log(`[Approval Finish] Marked request ${requestId} as approved`);
    // 9. 成功レスポンス
    return NextResponse.json({ verified: true, status: 'approved' }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

  } catch (dbError) {
    console.error('[Approval Finish] Failed to update approval request status:', dbError);
    return NextResponse.json({ error: 'Failed to finalize approval' }, {
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
}
