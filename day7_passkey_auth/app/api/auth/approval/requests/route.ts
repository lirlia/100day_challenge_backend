import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// 仮のユーザー認証: ヘッダーから 'x-user-id' を取得
// 本来はセッションやトークンで認証する
function getUserIdFromRequest(request: NextRequest): string | null {
  return request.headers.get('x-user-id');
}

export async function GET(request: NextRequest) {
  const userId = getUserIdFromRequest(request);

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log(`[Approval Requests GET] Fetching for user: ${userId}`);

  try {
    const now = new Date();
    const requests = await db.deviceApprovalRequest.findMany({
      where: {
        userId: userId,
        status: 'pending', // 保留中のリクエストのみ
        expiresAt: { gt: now }, // 有効期限内のもののみ
      },
      select: {
        id: true,
        requestingDeviceId: true, // どのデバイスからのリクエストか
        createdAt: true,
        expiresAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    console.log(`[Approval Requests GET] Found ${requests.length} pending requests for user ${userId}`);
    return NextResponse.json(requests);

  } catch (error) {
    console.error('[Approval Requests GET] Failed to fetch requests:', error);
    return NextResponse.json(
      { error: 'Failed to fetch approval requests' },
      { status: 500 },
    );
  }
}
