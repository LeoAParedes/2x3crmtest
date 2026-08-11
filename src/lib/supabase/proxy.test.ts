import { describe, expect, it } from 'vitest'

import { getAuthenticatedHomePath } from '@/src/lib/supabase/proxy'

describe('getAuthenticatedHomePath', () => {
  it('routes admin claims to the administration area', () => {
    expect(getAuthenticatedHomePath('admin')).toBe('/admin')
  })

  it('routes cashier claims to the point of sale', () => {
    expect(getAuthenticatedHomePath('cashier')).toBe('/pos')
  })

  it('rejects legacy and unknown role claims', () => {
    expect(getAuthenticatedHomePath('supervisor')).toBeNull()
    expect(getAuthenticatedHomePath(undefined)).toBeNull()
  })
})
