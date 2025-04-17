import { prisma } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const currentUserIdParam = searchParams.get('currentUserId');
  const currentUserId = currentUserIdParam ? parseInt(currentUserIdParam, 10) : null;

  try {
    const users = await prisma.user.findMany({
      orderBy: {
        id: 'asc', // 取得順序を安定させる
      },
    });

    // currentUserId が有効な数値として指定されている場合のみ、フォロー情報を追加
    if (currentUserId !== null && !isNaN(currentUserId)) {
      // 現在のユーザーがフォローしているIDのセットを取得
      const followingRecords = await prisma.follows.findMany({
        where: { followerId: currentUserId },
        select: { followingId: true },
      });
      const followingIds = new Set(followingRecords.map(f => f.followingId));

      // 各ユーザーに isFollowing プロパティを追加
      const usersWithFollowStatus = users.map(user => ({
        ...user,
        // 自分自身はフォローできないので常に false
        isFollowing: user.id === currentUserId ? false : followingIds.has(user.id),
      }));
      return NextResponse.json(usersWithFollowStatus);

    } else {
      // currentUserId が指定されていない場合は、そのままユーザーリストを返す
      return NextResponse.json(users);
    }

  } catch (error) {
    console.error('Error fetching users:', error);
    console.error('Full error object (users):', JSON.stringify(error, null, 2));
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { name } = await request.json();
    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }
    const newUser = await prisma.user.create({
      data: {
        name,
      },
    });
    return NextResponse.json(newUser, { status: 201 });
  } catch (error) {
    console.error('Error creating user:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
