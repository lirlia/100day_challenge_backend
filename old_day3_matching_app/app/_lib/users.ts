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
    // console.error("Failed to fetch all users:", error);
    // エラーメッセージとスタックトレースを分けて出力
    console.error("Failed to fetch all users:");
    if (error instanceof Error) {
      console.error("Error message:", error.message);
      console.error("Stack trace:", error.stack);
    } else {
      console.error("Caught error is not an instance of Error:", error);
    }
    return []; // エラー時は空配列を返す
  }
}
