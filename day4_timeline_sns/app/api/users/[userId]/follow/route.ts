import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

// フォローする
export async function POST(request: Request, context: { params: { userId: string } }) {
    const currentUserId = parseInt(context.params.userId, 10);
    if (isNaN(currentUserId)) {
        return NextResponse.json({ error: 'Invalid current user ID' }, { status: 400 });
    }

    let targetUserId: number;
    try {
        const body = await request.json();
        targetUserId = body.targetUserId;
        if (typeof targetUserId !== 'number') {
            throw new Error('Invalid targetUserId');
        }
    } catch (error) {
        return NextResponse.json({ error: 'Invalid request body or targetUserId' }, { status: 400 });
    }

    if (currentUserId === targetUserId) {
        return NextResponse.json({ error: 'Cannot follow yourself' }, { status: 400 });
    }

    try {
        // ユーザー存在チェック (任意だが推奨)
        const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } });
        if (!targetUser) {
            return NextResponse.json({ error: 'Target user not found' }, { status: 404 });
        }

        await prisma.follows.create({
            data: {
                followerId: currentUserId,
                followingId: targetUserId,
            },
        });
        console.log(`User ${currentUserId} followed User ${targetUserId}`);
        return NextResponse.json({ message: 'Successfully followed' }, { status: 201 });

    } catch (error) {
        // Prismaエラーコード P2002 はユニーク制約違反 (既にフォローしている場合)
        if (error instanceof PrismaClientKnownRequestError && error.code === 'P2002') {
            return NextResponse.json({ error: 'Already following this user' }, { status: 409 }); // Conflict
        }
        console.error(`Error following user: ${error}`);
        return NextResponse.json({ error: 'Failed to follow user' }, { status: 500 });
    }
}

// アンフォローする
export async function DELETE(request: Request, context: { params: { userId: string } }) {
    const currentUserId = parseInt(context.params.userId, 10);
    if (isNaN(currentUserId)) {
        return NextResponse.json({ error: 'Invalid current user ID' }, { status: 400 });
    }

    let targetUserId: number;
    try {
        // DELETEリクエストでもボディから取得する場合
        // もしクエリパラメータ等で渡す場合はここの実装を変更
        const body = await request.json();
        targetUserId = body.targetUserId;
        if (typeof targetUserId !== 'number') {
            throw new Error('Invalid targetUserId');
        }
    } catch (error) {
        return NextResponse.json({ error: 'Invalid request body or targetUserId' }, { status: 400 });
    }

     if (currentUserId === targetUserId) {
        // 自分自身への操作は意味がないが、エラーにするかは要件次第 (今回は許可しない)
        return NextResponse.json({ error: 'Cannot unfollow yourself' }, { status: 400 });
    }

    try {
        const result = await prisma.follows.delete({
            where: {
                followerId_followingId: {
                    followerId: currentUserId,
                    followingId: targetUserId,
                },
            },
        });
        console.log(`User ${currentUserId} unfollowed User ${targetUserId}`);
        return NextResponse.json({ message: 'Successfully unfollowed' }, { status: 200 });

    } catch (error) {
        // Prismaエラーコード P2025 は削除対象が見つからない場合 (既にフォローしていない)
        if (error instanceof PrismaClientKnownRequestError && error.code === 'P2025') {
            return NextResponse.json({ error: 'Not following this user' }, { status: 404 });
        }
        console.error(`Error unfollowing user: ${error}`);
        return NextResponse.json({ error: 'Failed to unfollow user' }, { status: 500 });
    }
}
