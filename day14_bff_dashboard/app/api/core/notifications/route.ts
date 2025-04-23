import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const notifications = await prisma.notification.findMany({
      orderBy: { publishedAt: 'desc' },
      take: 3,
    });

    return NextResponse.json(notifications);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
