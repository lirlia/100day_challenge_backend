import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const userId = searchParams.get('userId');

  if (!userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }

  const userIdInt = parseInt(userId);
  if (isNaN(userIdInt)) {
    return NextResponse.json({ error: 'Invalid userId' }, { status: 400 });
  }

  try {
    // Find matches where the user is either user1 or user2
    const matches = await prisma.match.findMany({
      where: {
        OR: [
          { user1Id: userIdInt },
          { user2Id: userIdInt },
        ],
      },
      include: {
        // Include the user data for both users in the match
        user1: {
          select: { id: true, name: true, profileImageUrl: true }, // Select specific fields
        },
        user2: {
          select: { id: true, name: true, profileImageUrl: true }, // Select specific fields
        },
      },
      orderBy: {
        createdAt: 'desc', // Order by most recent match
      },
    });

    // Filter the results to return only the *other* user in each match
    // Define a simple type for the matched user
    type MatchedUser = {
      id: number;
      name: string;
      profileImageUrl: string | null;
    };
    // Define a simple type for the match with included users
    type MatchWithSimpleUsers = {
        id: number;
        user1Id: number;
        user2Id: number;
        createdAt: Date;
        user1: MatchedUser | null;
        user2: MatchedUser | null;
    };

    const matchedUsers: (MatchedUser | null)[] = matches.map((match: MatchWithSimpleUsers) => {
        if (match.user1Id === userIdInt) {
            return match.user2; // Return user2 if the current user is user1
        } else {
            return match.user1; // Return user1 if the current user is user2
        }
    });

    return NextResponse.json(matchedUsers);

  } catch (error) {
    console.error('Failed to fetch matches:', error);
    return NextResponse.json({ error: 'Failed to fetch matches' }, { status: 500 });
  }
}
