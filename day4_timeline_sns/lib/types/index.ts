// Prisma のモデルに対応する基本的な型定義

export interface User {
  id: number;
  name: string;
  createdAt: string; // または Date
}

export interface Post {
  id: number;
  content: string;
  createdAt: string; // または Date
  userId: number;
  user: {
    // 関連ユーザーの情報 (APIレスポンスに含める場合)
    name: string;
  };
}
