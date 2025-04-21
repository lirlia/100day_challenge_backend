// 生成されたPrisma Clientをインポート
import { PrismaClient } from '../app/generated/prisma'

// 環境変数が読み込まれているか確認
// console.log('DATABASE_URL in lib/db.ts:', process.env.DATABASE_URL);

// Use a single instance of PrismaClient across the app
// datasources を指定せず、Prisma の自動 .env 読み込みに任せる
const prisma = new PrismaClient()

export default prisma
