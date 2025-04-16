import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
// Removed Prisma namespace import as utility types were causing issues

// Define the expected structure of the included user object
type IncludedUser = {
  id: number;
  name: string;
  profileImageUrl: string | null;
};

// Define the expected structure of the match object returned by findMany
type MatchWithIncludedUsers = {
  id: number;
  user1Id: number;
  user2Id: number;
  createdAt: Date;
  user1: IncludedUser;
  user2: IncludedUser;
};

export async function GET(
  request: Request,
  context: { params: { userId: string } }
) {
  const { userId: userIdString } = context.params;
  const userId = parseInt(userIdString, 10);

  if (isNaN(userId)) {
    return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 });
  }

  try {
    const matches = await prisma.match.findMany({
      where: {
        OR: [
          { user1Id: userId },
          { user2Id: userId },
        ],
      },
      include: {
        user1: {
          select: { id: true, name: true, profileImageUrl: true },
        },
        user2: {
          select: { id: true, name: true, profileImageUrl: true },
        },
      },
      orderBy: {
        createdAt: 'desc',
      }
    });

    // Return the other user in each match, using the defined type
    const matchedUsers = (matches as MatchWithIncludedUsers[]).map((match) => {
        return match.user1Id === userId ? match.user2 : match.user1;
    });

    return NextResponse.json(matchedUsers);
  } catch (error) {
    console.error('Error fetching matches:', error);
    return NextResponse.json({ error: 'Failed to fetch matches' }, { status: 500 });
  }
}
