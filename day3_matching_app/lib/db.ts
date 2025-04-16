import { PrismaClient } from '@prisma/client'

// Use a single instance of PrismaClient across the app
const prisma = new PrismaClient()

export default prisma
