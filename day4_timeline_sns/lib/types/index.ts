import {
  User as PrismaUser,
  Post as PrismaPost,
  Follows as PrismaFollows,
} from '@app/generated/prisma';

// Prisma のモデルに対応する基本的な型定義

// 基本のユーザー型 (Prisma生成型をそのまま利用)
export type User = PrismaUser;

// 基本の投稿型 (Prisma生成型に関連ユーザー情報を追加)
// 注意: PrismaClientのクエリで `include` または `select` を使わないと
// `user` プロパティは実際には含まれない可能性がある。
// APIレスポンスで整形することを前提とする。
export type Post = PrismaPost & {
  user: {
    name: string;
    emoji: string;
  };
};

// フォロー情報を含むユーザー型
export type UserWithFollow = User & {
  isFollowing?: boolean; // APIからオプショナルで追加される
};

// フォロー関係の型 (Prisma生成型をそのまま利用)
export type Follows = PrismaFollows;
