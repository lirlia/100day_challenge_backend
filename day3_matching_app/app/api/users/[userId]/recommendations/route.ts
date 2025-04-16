import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
// import type { Swipe } from '@prisma/client'; // Removed unused import

export async function GET(
  request: Request,
  { params }: { params: { userId: string } }
) {
  const userId = parseInt(params.userId, 10);

  if (isNaN(userId)) {
    return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 });
  }

  try {
    // Find users that the current user has already swiped
    const swipedUserIds = await prisma.swipe.findMany({
      where: { swiperUserId: userId },
      select: { swipedUserId: true },
    });
    const swipedIds = swipedUserIds.map((swipe: { swipedUserId: number }) => swipe.swipedUserId);

    // Find users who are not the current user and have not been swiped by the current user
    const recommendations = await prisma.user.findMany({
      where: {
        id: {
          not: userId, // Exclude the current user
          notIn: swipedIds, // Exclude users already swiped
        },
      },
      // Optionally limit the number of recommendations
      // take: 10,
    });

    return NextResponse.json(recommendations);
  } catch (error) {
    console.error('Error fetching recommendations:', error);
    return NextResponse.json({ error: 'Failed to fetch recommendations' }, { status: 500 });
  }
}
