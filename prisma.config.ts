import 'dotenv/config'
import { defineConfig } from 'prisma/config'

const placeholder = 'postgresql://placeholder:placeholder@localhost:5432/placeholder'

const isSupabaseDirectHost = (hostname: string) => /^db\.[a-z0-9]+\.supabase\.co$/i.test(hostname)

/** Session pooler (5432) works for migrate deploy from Vercel; db.*.supabase.co often does not (IPv6). */
const deriveSupabaseSessionPoolerUrl = (databaseUrl: string) => {
  try {
    const parsed = new URL(databaseUrl)
    if (!parsed.hostname.includes('pooler.supabase.com')) {
      return null
    }
    parsed.port = '5432'
    parsed.searchParams.delete('pgbouncer')
    return parsed.toString()
  } catch {
    return null
  }
}

const resolveMigrationDatabaseUrl = () => {
  const databaseUrl = process.env.DATABASE_URL?.trim()
  const directUrl = process.env.DIRECT_URL?.trim()

  if (directUrl) {
    try {
      const hostname = new URL(directUrl).hostname
      if (!isSupabaseDirectHost(hostname)) {
        return directUrl
      }
    } catch {
      return directUrl
    }
  }

  if (databaseUrl) {
    const sessionPooler = deriveSupabaseSessionPoolerUrl(databaseUrl)
    if (sessionPooler) {
      return sessionPooler
    }
    return databaseUrl
  }

  if (directUrl) {
    return directUrl
  }

  return placeholder
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations'
  },
  datasource: {
    url: resolveMigrationDatabaseUrl()
  }
})
