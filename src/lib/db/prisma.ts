import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const getPrisma = async () => {
  if (globalForPrisma.prisma) {
    return globalForPrisma.prisma
  }

  const connectionString = process.env.DATABASE_URL?.trim()
  if (!connectionString) {
    throw new Error('DATABASE_URL is required')
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString })
  })

  globalForPrisma.prisma = prisma

  return prisma
}
