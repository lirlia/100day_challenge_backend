import prisma from '@/lib/db';

export async function getAllUsers() {
  try {
    // UserSwitcher用にidとnameのみ取得
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
      },
      orderBy: {
        id: 'asc',
      },
    });
    return users;
  } catch (error) {
    console.error("Failed to fetch all users:", error);
    return []; // エラー時は空配列を返す
  }
}
