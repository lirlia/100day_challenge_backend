import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(req: NextRequest, { params }: { params: { userId: string } }) {
  try {
    const awaitedParams = await params;
    const userId = parseInt(awaitedParams.userId, 10);
    if (isNaN(userId)) {
      return NextResponse.json({ error: 'Invalid userId' }, { status: 400 });
    }

    const targetUserType = userId % 2 === 0 ? 'even' : 'odd';

    const recommendations = await prisma.recommendation.findMany({
      where: { targetUserType },
    });

    return NextResponse.json(recommendations);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
