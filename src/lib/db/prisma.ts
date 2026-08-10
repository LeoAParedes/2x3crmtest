import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

const normalizePostgresConnectionString = (input: string) => {
  try {
    const parsed = new URL(input)
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
      return input
    }

    // Keep secure TLS while restoring standard libpq semantics for sslmode=require on node-postgres.
    if (!parsed.searchParams.get('sslmode')) {
      parsed.searchParams.set('sslmode', 'require')
    }
    if (!parsed.searchParams.get('uselibpqcompat')) {
      parsed.searchParams.set('uselibpqcompat', 'true')
    }

    return parsed.toString()
  } catch {
    return input
  }
}

export const getPrisma = async () => {
  if (globalForPrisma.prisma) {
    return globalForPrisma.prisma
  }

  const connectionString =
    process.env.DATABASE_URL?.trim() || process.env.POSTGRES_PRISMA_URL?.trim() || process.env.POSTGRES_URL?.trim()
  if (!connectionString) {
    throw new Error('DATABASE_URL is required (or POSTGRES_PRISMA_URL / POSTGRES_URL)')
  }

  const normalizedConnectionString = normalizePostgresConnectionString(connectionString)

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: normalizedConnectionString })
  })

  globalForPrisma.prisma = prisma

  return prisma
}
