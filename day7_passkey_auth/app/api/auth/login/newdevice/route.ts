import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import crypto from 'crypto'; // For generating requestingDeviceId

export async function POST(request: NextRequest) {
  let email: string;
  try {
    const body = await request.json();
    email = body.email;
    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }
    console.log(`[New Device Login] Received request for email: ${email}`);
  } catch (error) {
    console.error('[New Device Login] Invalid request body:', error);
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  try {
    // ユーザーが存在するかチェック
    const user = await db.user.findUnique({
      where: { email },
    });

    if (!user) {
      console.log(`[New Device Login] User not found: ${email}`);
      // セキュリティのため、ユーザーが見つからない場合も遅延を入れる
      await new Promise(resolve => setTimeout(resolve, 500));
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userId = user.id;

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
        `[New Device Login] Created/Updated approval request: ${approvalRequest.id}`,
      );

      return NextResponse.json(
        {
          status: 'approval_required',
          requestId: approvalRequest.id,
          requestingDeviceId: requestingDeviceId,
        },
        { status: 202 }, // Accepted
      );
    } catch (dbError) {
      console.error('[New Device Login] Failed to create approval request:', dbError);
      return NextResponse.json({ error: 'Failed to initiate device approval' }, { status: 500 });
    }
  } catch (error) {
    console.error('[New Device Login] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
