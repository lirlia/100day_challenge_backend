import { PrismaClient } from '../app/generated/prisma'

// Prisma Clientのインスタンスをグローバルに保持して再利用
// 開発環境ではHot Reloadによる複数インスタンス作成を防ぐため
const globalForPrisma = global as unknown as { prisma: PrismaClient }

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: ['error', 'warn'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
