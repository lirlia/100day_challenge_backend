import { prisma } from '@/lib/db';
import { emitter } from '@/lib/emitter';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const posts = await prisma.post.findMany({
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        user: {
          select: {
            name: true,
          },
        },
      },
    });
    return NextResponse.json(posts);
  } catch (error) {
    console.error('Error fetching posts:', error);
    console.error('Full error object (posts GET):', JSON.stringify(error, null, 2));
    return NextResponse.json(
      { error: 'Failed to fetch posts' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { content, userId } = body;

    if (!content || !userId) {
      return NextResponse.json(
        { error: 'Missing content or userId' },
        { status: 400 }
      );
    }

    // TODO: userIdの存在チェック (今回は省略)

    const newPost = await prisma.post.create({
      data: {
        content,
        userId,
      },
      include: {
        user: {
          select: {
            name: true,
          },
        },
      },
    });

    // SSE に新しい投稿を通知
    emitter.emit('newPost', newPost);

    return NextResponse.json(newPost, { status: 201 });
  } catch (error) {
    console.error('Error creating post:', error);
    return NextResponse.json(
      { error: 'Failed to create post' },
      { status: 500 }
    );
  }
}
