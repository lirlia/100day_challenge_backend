import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { swiperUserId, swipedUserId, action } = body;

    // Basic validation
    if (!swiperUserId || !swipedUserId || !action) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    if (action !== 'like' && action !== 'skip') {
      return NextResponse.json({ error: 'Invalid action type' }, { status: 400 });
    }
    if (swiperUserId === swipedUserId) {
      return NextResponse.json({ error: 'Cannot swipe yourself' }, { status: 400 });
    }

    // Check if swipe already exists
    const existingSwipe = await prisma.swipe.findUnique({
        where: {
            swiperUserId_swipedUserId: {
                swiperUserId: swiperUserId,
                swipedUserId: swipedUserId,
            }
        }
    });

    if (existingSwipe) {
        return NextResponse.json({ error: 'Swipe already exists' }, { status: 409 }); // Conflict
    }

    // Create the swipe action
    const newSwipe = await prisma.swipe.create({
      data: {
        swiperUserId: swiperUserId,
        swipedUserId: swipedUserId,
        action: action,
      },
    });

    let isMatch = false;

    // If action is 'like', check for a mutual like
    if (action === 'like') {
      const mutualLike = await prisma.swipe.findUnique({
        where: {
          swiperUserId_swipedUserId: {
            swiperUserId: swipedUserId, // The swiped user...
            swipedUserId: swiperUserId, // ...swiped the current user back
          },
          action: 'like', // and the action was also a like
        },
      });

      if (mutualLike) {
        isMatch = true;
        // Create a match record
        // Ensure user1Id < user2Id to prevent duplicate matches in different orders
        const user1Id = Math.min(swiperUserId, swipedUserId);
        const user2Id = Math.max(swiperUserId, swipedUserId);

        // Check if match already exists before creating
        const existingMatch = await prisma.match.findUnique({
            where: {
                user1Id_user2Id: {
                    user1Id: user1Id,
                    user2Id: user2Id
                }
            }
        });

        if (!existingMatch) {
            await prisma.match.create({
                data: {
                    user1Id: user1Id,
                    user2Id: user2Id,
                },
            });
        }
        // If match already exists, do nothing extra, the swipe is still recorded
      }
    }

    return NextResponse.json({ success: true, isMatch: isMatch, swipe: newSwipe }, { status: 201 });

  } catch (error) {
    console.error('Failed to record swipe:', error);
    // Check for specific Prisma errors if needed, e.g., unique constraint violation
    // if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    //     return NextResponse.json({ error: 'Swipe already exists' }, { status: 409 });
    // }
    return NextResponse.json({ error: 'Failed to record swipe' }, { status: 500 });
  }
}
