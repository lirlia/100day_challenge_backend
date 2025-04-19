import { NextRequest, NextResponse } from 'next/server';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { db } from '@/lib/db';
import { RP_ID } from '@/app/_lib/config';
import { Passkey } from '@prisma/client';

// 仮のユーザー認証: ヘッダーから 'x-user-id' を取得
function getUserIdFromRequest(request: NextRequest): string | null {
  return request.headers.get('x-user-id');
}

export async function POST(
  request: NextRequest,
  context: { params: { requestId: string } },
) {
  const userId = getUserIdFromRequest(request);
  // params を非同期として扱う
  const { requestId } = context.params;

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!requestId) {
    return NextResponse.json({ error: 'Request ID is required' }, { status: 400 });
  }

  console.log(
    `[Approval Start] User ${userId} trying to start approval for request ${requestId}`,
  );

  try {
    // 1. 承認リクエストが存在し、ユーザーに紐づいているか確認
    const approvalRequest = await db.deviceApprovalRequest.findUnique({
      where: {
        id: requestId,
        userId: userId, // ログインユーザーが承認者であることを確認
        status: 'pending',
        expiresAt: { gt: new Date() },
      },
      include: {
        user: { include: { passkeys: true } }, // 承認者のパスキーを取得
      },
    });

    if (!approvalRequest) {
      console.log(
        `[Approval Start] Pending approval request not found for id: ${requestId} and user: ${userId}`,
      );
      return NextResponse.json(
        { error: 'Approval request not found or expired' },
        { status: 404 },
      );
    }

    // 2. 承認者のパスキー情報を取得
    const userAuthenticators = approvalRequest.user.passkeys.map((pk: Passkey) => ({
      credentialID_db: pk.credentialId,
      transports: JSON.parse(pk.transports),
    }));

    if (userAuthenticators.length === 0) {
        console.error(`[Approval Start] No passkeys found for approving user ${userId}`);
        return NextResponse.json({ error: 'No passkeys found for user to approve' }, { status: 400 });
    }

    // 3. 承認用の認証オプション（チャレンジ）を生成
    const options = await generateAuthenticationOptions({
      rpID: RP_ID as string,
      allowCredentials: userAuthenticators.map((auth) => ({
        id: auth.credentialID_db,
        type: 'public-key',
        transports: auth.transports,
      })),
      userVerification: 'required', // 承認操作なのでユーザー検証を必須にする
    });

    // 4. 生成されたチャレンジを承認リクエストレコードに保存
    try {
        await db.deviceApprovalRequest.update({
          where: { id: requestId },
          data: { challenge: options.challenge },
        });
        console.log(
          `[Approval Start] Stored approval challenge ${options.challenge} in request ${requestId}`,
        );
    } catch (dbError) {
        console.error('[Approval Start] Failed to store challenge in request:', dbError);
        return NextResponse.json({ error: 'Failed to start approval process' }, { status: 500 });
    }

    // 5. session-store への保存は不要

    console.log(
      `[Approval Start] Generated approval challenge ${options.challenge} for request ${requestId}`,
    );

    // 6. オプションをクライアント（承認者のブラウザ）に返す
    return NextResponse.json(options, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

  } catch (error) {
    console.error('[Approval Start] Failed:', error);
    return NextResponse.json(
      { error: 'Failed to start approval process' },
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json'
        }
      },
    );
  }
}
