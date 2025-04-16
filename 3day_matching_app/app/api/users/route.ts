import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const currentUserId = searchParams.get('currentUserId');

  if (!currentUserId) {
    return NextResponse.json({ error: 'currentUserId is required' }, { status: 400 });
  }

  const currentUserIdInt = parseInt(currentUserId);
  if (isNaN(currentUserIdInt)) {
    return NextResponse.json({ error: 'Invalid currentUserId' }, { status: 400 });
  }

  try {
    // 1. 現在のユーザーが既にスワイプしたユーザーIDのリストを取得
    const swipedUserIds = await prisma.swipe.findMany({
      where: {
        swiperUserId: currentUserIdInt,
      },
      select: {
        swipedUserId: true,
      },
    });
    const swipedIds = swipedUserIds.map((swipe: { swipedUserId: number }) => swipe.swipedUserId);

    // 2. 自分自身と、既にスワイプしたユーザーを除外してユーザーを取得
    const users = await prisma.user.findMany({
      where: {
        id: {
          not: currentUserIdInt, // 自分自身を除外
          notIn: swipedIds,      // 既にスワイプしたユーザーを除外
        },
      },
      // 必要に応じて取得するフィールドを選択
      // select: {
      //   id: true,
      //   name: true,
      //   age: true,
      //   bio: true,
      //   profileImageUrl: true,
      // },
      orderBy: {
        // ランダムな順序で取得 (SQLiteでは `random()` が使える場合があるが、Prismaでは標準サポート外。
        // アプリケーション側でシャッフルするか、DBレベルで対応が必要なら拡張が必要)
        // 今回はID順などで代替
        id: 'asc',
      },
      take: 10, // パフォーマンスのため、一度に取得する数を制限
    });

    // 取得したユーザーリストをシャッフル (Fisher-Yates shuffle)
    for (let i = users.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [users[i], users[j]] = [users[j], users[i]];
    }

    // 最初の1件のみ返す (スワイプ画面では通常1人ずつ表示)
    const nextUser = users.length > 0 ? users[0] : null;

    return NextResponse.json(nextUser);

  } catch (error) {
    console.error('Failed to fetch users:', error);
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
  }
}
