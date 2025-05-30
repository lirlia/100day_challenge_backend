// app/api/passkeys/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// ユーザーIDの取得: ヘッダーまたはクエリパラメータから取得
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

  console.log(`[Passkeys GET] Fetching passkeys for user: ${userId}`);

  try {
    const passkeys = await db.passkey.findMany({
      where: {
        userId: userId,
      },
      select: {
        id: true, // DB上のID
        credentialId: true, // Base64URL
        deviceName: true,
        createdAt: true,
        lastUsedAt: true,
        transports: true, // JSON string
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // transports は JSON 文字列なのでパースして返す（任意）
    const formattedPasskeys = passkeys.map(pk => ({
        ...pk,
        transports: JSON.parse(pk.transports || '[]') // パース失敗時は空配列
    }));

    console.log(`[Passkeys GET] Found ${formattedPasskeys.length} passkeys for user ${userId}`);
    return NextResponse.json({ passkeys: formattedPasskeys });

  } catch (error) {
    console.error('[Passkeys GET] Failed to fetch passkeys:', error);
    return NextResponse.json(
      { error: 'Failed to fetch passkeys' },
      { status: 500 },
    );
  }
}

// POST (新しいパスキー登録開始) は別のファイル (/register/start/route.ts) に実装
// DELETE (パスキー削除) は別のファイル (/[passkeyId]/route.ts) に実装
