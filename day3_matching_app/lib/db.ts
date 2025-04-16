import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

// PrismaClient is attached to the `global` object in development to prevent
// exhausting your database connection limit.
//
// Learn more: https://pris.ly/d/help/next-js-best-practices
const client = globalThis.prisma || new PrismaClient({
  // Optional: Log Prisma queries
  // log: ['query', 'info', 'warn', 'error'],
});
if (process.env.NODE_ENV !== 'production') globalThis.prisma = client;

export default client;
