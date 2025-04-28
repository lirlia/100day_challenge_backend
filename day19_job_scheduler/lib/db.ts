import { PrismaClient } from '../app/generated/prisma'

// PrismaClientのグローバルインスタンスを宣言
declare global {
  var prisma: PrismaClient | undefined;
}

// 開発環境での重複インスタンス化を防ぐ
export const prisma =
  global.prisma ||
  new PrismaClient({
    log: ['error'],
  });

// 開発環境でHMRを使用するときのみグローバル変数に代入
if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}
