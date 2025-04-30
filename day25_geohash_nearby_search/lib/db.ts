import { PrismaClient } from '../app/generated/prisma'

// Use a single instance of PrismaClient across the app
const prisma = new PrismaClient()

export default prisma