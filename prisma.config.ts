import 'dotenv/config'
import { defineConfig } from 'prisma/config'

// Migrations need a direct Postgres connection. Runtime can use the pooler (DATABASE_URL).
const migrationDatabaseUrl =
  process.env.DIRECT_URL?.trim() ||
  process.env.DATABASE_URL?.trim() ||
  'postgresql://placeholder:placeholder@localhost:5432/placeholder'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations'
  },
  datasource: {
    url: migrationDatabaseUrl
  }
})
