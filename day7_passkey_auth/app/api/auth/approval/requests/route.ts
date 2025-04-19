import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// ユーザーIDの取得: ヘッダーまたはクエリパラメータから取得
// 本来はセッションやトークンで認証する
function getUserIdFromRequest(request: NextRequest): string | null {
  // リクエストURLをログ出力
  console.log('[getUserIdFromRequest] Request URL:', request.url);

  // ヘッダーから取得
  const userIdFromHeader = request.headers.get('x-user-id');
  console.log('[getUserIdFromRequest] User ID from header:', userIdFromHeader);
  if (userIdFromHeader) return userIdFromHeader;

  // クエリパラメータから取得
  const url = new URL(request.url);
  const userIdFromQuery = url.searchParams.get('userId');
  console.log('[getUserIdFromRequest] User ID from query:', userIdFromQuery);
  return userIdFromQuery;
}

export async function GET(request: NextRequest) {
  console.log('[Approval Requests GET] Request received:', request.url);

  const userId = getUserIdFromRequest(request);

  console.log('[Approval Requests GET] User ID extracted:', userId);

  if (!userId) {
    console.log('[Approval Requests GET] No user ID provided, returning 401');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log(`[Approval Requests GET] Fetching for user: ${userId}`);

  try {
    const now = new Date();
    console.log(`[Approval Requests GET] Current time: ${now.toISOString()}`);

    // クエリ条件をログ出力
    const queryCondition = {
      userId: userId,
      status: 'pending',
      expiresAt: { gt: now }
    };
    console.log('[Approval Requests GET] Query condition:', JSON.stringify(queryCondition));

    const requests = await db.deviceApprovalRequest.findMany({
      where: queryCondition,
      select: {
        id: true,
        requestingDeviceId: true,
        status: true, // ステータスも取得するように追加
        createdAt: true,
        expiresAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    console.log(`[Approval Requests GET] Found ${requests.length} pending requests for user ${userId}`);
    console.log('[Approval Requests GET] Requests data:', JSON.stringify(requests));

    return NextResponse.json({ requests });

  } catch (error) {
    console.error('[Approval Requests GET] Failed to fetch requests:', error);
    return NextResponse.json(
      { error: 'Failed to fetch approval requests', details: (error as Error).message },
      { status: 500 },
    );
  }
}
