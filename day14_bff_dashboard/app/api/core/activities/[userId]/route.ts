import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(req: NextRequest, { params }: { params: { userId: string } }) {
  try {
    const awaitedParams = await params;
    const userId = parseInt(awaitedParams.userId, 10);
    if (isNaN(userId)) {
      return NextResponse.json({ error: 'Invalid userId' }, { status: 400 });
    }

    const activities = await prisma.activity.findMany({
      where: { userId },
      orderBy: { timestamp: 'desc' },
      take: 5,
    });

    return NextResponse.json(activities);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
