import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(
  request: NextRequest,
  context: { params: { requestId: string } },
) {
  // params を非同期として扱う
  const { requestId } = context.params;

  if (!requestId) {
    return NextResponse.json({ error: 'Request ID is required' }, { status: 400 });
  }

  console.log(`[User Info] Fetching user info for approval request ${requestId}`);

  try {
    // 1. 承認リクエストを検索
    const approvalRequest = await db.deviceApprovalRequest.findUnique({
      where: {
        id: requestId,
        status: 'approved', // 承認済みのリクエストのみ
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });

    if (!approvalRequest) {
      console.error(`[User Info] Approval request not found or not approved: ${requestId}`);
      return NextResponse.json(
        { error: 'Approval request not found or not approved' },
        { status: 404 },
      );
    }

    if (!approvalRequest.user) {
      console.error(`[User Info] User not found for approval request: ${requestId}`);
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    console.log(`[User Info] Found user info for request ${requestId}:`, {
      userId: approvalRequest.user.id,
      email: approvalRequest.user.email,
    });

    // 2. ユーザー情報を返す
    return NextResponse.json({
      userId: approvalRequest.user.id,
      email: approvalRequest.user.email,
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('[User Info] Failed to fetch user info:', error);
    return NextResponse.json(
      { error: 'Failed to fetch user information', details: (error as Error).message },
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json'
        }
      },
    );
  }
}
