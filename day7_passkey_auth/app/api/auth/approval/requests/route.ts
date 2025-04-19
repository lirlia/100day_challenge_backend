import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// ユーザーIDの取得: ヘッダーまたはクエリパラメータから取得
// 本来はセッションやトークンで認証する
function getUserIdFromRequest(request: NextRequest): string | null {
  // ヘッダーから取得
  const userIdFromHeader = request.headers.get('x-user-id');
  if (userIdFromHeader) return userIdFromHeader;

  // クエリパラメータから取得
  const url = new URL(request.url);
  const userIdFromQuery = url.searchParams.get('userId');
  return userIdFromQuery;
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
    return NextResponse.json({ requests });

  } catch (error) {
    console.error('[Approval Requests GET] Failed to fetch requests:', error);
    return NextResponse.json(
      { error: 'Failed to fetch approval requests' },
      { status: 500 },
    );
  }
}
