import { afterEach, describe, expect, it, vi } from 'vitest'

describe('getPrisma', () => {
  const originalDatabaseUrl = process.env.DATABASE_URL

  afterEach(() => {
    vi.resetModules()
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL
      return
    }
    process.env.DATABASE_URL = originalDatabaseUrl
  })

  it('fails closed when DATABASE_URL is missing', async () => {
    delete process.env.DATABASE_URL
    const { getPrisma } = await import('@/src/lib/db/prisma')

    await expect(getPrisma()).rejects.toThrow('DATABASE_URL is required')
  })
})
