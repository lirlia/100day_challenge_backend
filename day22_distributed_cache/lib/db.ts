import { PrismaClient } from '../app/generated/prisma'

// グローバルスコープでPrismaClientのインスタンスを保持するための型定義
declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

// 開発環境では、高速リロードのためにグローバルオブジェクトにPrismaClientを保存
// 本番環境では新しいインスタンスを作成
export const prisma =
  global.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

// 開発環境（NODE_ENVがproductionでない）場合のみ、グローバル変数にPrismaClientを保存
if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}

export default prisma
