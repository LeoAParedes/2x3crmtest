import { describe, expect, it } from 'vitest'

import { getLogoutRedirectUrl } from '@/app/auth/logout/route'

describe('getLogoutRedirectUrl', () => {
  it('uses the configured public base URL instead of Docker internal hostname', () => {
    expect(getLogoutRedirectUrl('http://0.0.0.0:3000/auth/logout', 'http://localhost:3000').toString()).toBe(
      'http://localhost:3000/login'
    )
  })
})
