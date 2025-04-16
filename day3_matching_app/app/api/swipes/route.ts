import { NextResponse } from 'next/server';
import prisma from '@/lib/db';

interface SwipeRequestBody {
  swiperUserId: number;
  swipedUserId: number;
  action: 'like' | 'skip';
}

export async function POST(request: Request) {
  try {
    const body: SwipeRequestBody = await request.json();
    const { swiperUserId, swipedUserId, action } = body;

    if (!swiperUserId || !swipedUserId || !action || !['like', 'skip'].includes(action)) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }

    // 1. Record the swipe action
    const newSwipe = await prisma.swipe.create({
      data: {
        swiperUserId,
        swipedUserId,
        action,
      },
    });

    let match = null;
    let notificationRequired = false;

    // 2. If the action was 'like', check for a mutual like (potential match)
    if (action === 'like') {
      const mutualLike = await prisma.swipe.findUnique({
        where: {
          swiperUserId_swipedUserId: {
            swiperUserId: swipedUserId, // The other user
            swipedUserId: swiperUserId, // The current user
          },
          action: 'like', // Check if the other user also liked
        },
      });

      // 3. If mutual like exists, create a Match record
      if (mutualLike) {
        // Ensure user1Id < user2Id to prevent duplicate matches with swapped IDs
        const user1Id = Math.min(swiperUserId, swipedUserId);
        const user2Id = Math.max(swiperUserId, swipedUserId);

        match = await prisma.match.create({
          data: {
            user1Id,
            user2Id,
          },
          include: { // Include user details for potential notification/UI update
            user1: { select: { id: true, name: true, profileImageUrl: true } },
            user2: { select: { id: true, name: true, profileImageUrl: true } },
          }
        });
        notificationRequired = true;
        console.log(`Match created: ${user1Id} and ${user2Id}`);
      }
    }

    return NextResponse.json({ swipe: newSwipe, match, notificationRequired });

  } catch (error: any) {
    console.error('Error processing swipe:', error);
    // Handle potential unique constraint violation (user already swiped)
    if (error.code === 'P2002') {
      return NextResponse.json({ error: 'User already swiped' }, { status: 409 }); // Conflict
    }
    return NextResponse.json({ error: 'Failed to process swipe' }, { status: 500 });
  }
}
