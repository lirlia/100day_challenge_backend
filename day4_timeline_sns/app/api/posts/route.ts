import { prisma } from '@/lib/db';
import { emitter } from '@/lib/emitter';
import { NextResponse } from 'next/server';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limitParam = searchParams.get('limit');
  const cursorParam = searchParams.get('cursor');

  const limit = limitParam ? parseInt(limitParam, 10) : 10;
  const cursor = cursorParam ? parseInt(cursorParam, 10) : undefined;

  if (isNaN(limit)) {
    return NextResponse.json({ error: 'Invalid limit parameter' }, { status: 400 });
  }
  if (cursorParam && isNaN(cursor!)) {
    return NextResponse.json({ error: 'Invalid cursor parameter' }, { status: 400 });
  }

  try {
    const posts = await prisma.post.findMany({
      take: limit,
      skip: cursor ? 1 : 0,
      cursor: cursor ? { id: cursor } : undefined,
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        user: {
          select: {
            name: true,
            emoji: true,
          },
        },
      },
    });

    let nextCursor: typeof cursor | null = null;
    if (posts.length === limit) {
      const lastPost = posts[limit - 1];
      nextCursor = lastPost.id;
    }

    return NextResponse.json({ posts, nextCursor });
  } catch (error) {
    console.error('Error fetching posts:', error);
    if (error instanceof PrismaClientKnownRequestError) {
      console.error('Prisma Error Code:', error.code);
    }
    console.error('Full error object (posts GET):', JSON.stringify(error, null, 2));
    return NextResponse.json(
      { error: 'Failed to fetch posts' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    if (!rawBody) {
      return NextResponse.json(
        { error: 'Request body is empty' },
        { status: 400 }
      );
    }

    let body;
    try {
      body = JSON.parse(rawBody);
    } catch (parseError) {
      console.error('Failed to parse JSON body:', parseError);
      return NextResponse.json(
        { error: 'Invalid JSON format in request body' },
        { status: 400 }
      );
    }

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
            emoji: true,
          },
        },
      },
    });

    // SSE に新しい投稿を通知
    emitter.emit('newPost', newPost);

    return NextResponse.json(newPost, { status: 201 });
  } catch (error) {
    console.error('Error creating post:', error);
    if (error instanceof PrismaClientKnownRequestError) {
      console.error('Prisma Error Code (POST):', error.code);
    }
    return NextResponse.json(
      { error: 'Failed to create post' },
      { status: 500 }
    );
  }
}
