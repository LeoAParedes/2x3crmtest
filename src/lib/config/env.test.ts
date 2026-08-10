import { afterEach, describe, expect, it } from 'vitest'

import { env, getPublicSupabaseEnv, getServerEnv } from '@/src/lib/config/env'

describe('environment contract', () => {
  const originalEnv = process.env

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('rejects missing private server configuration', () => {
    process.env = {} as NodeJS.ProcessEnv

    expect(() => getServerEnv()).toThrow('SUPABASE_SERVICE_ROLE_KEY')
  })

  it('returns only browser-safe Supabase values', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'publishable'

    expect(getPublicSupabaseEnv()).toEqual({
      url: 'https://example.supabase.co',
      publishableKey: 'publishable'
    })
  })

  it('does not expose obsolete header-auth configuration', () => {
    expect(env).not.toHaveProperty('appInternalApiToken')
  })
})
