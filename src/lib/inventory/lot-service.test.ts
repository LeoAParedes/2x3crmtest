import { describe, expect, it } from 'vitest'

import { FINANCE_TIME_ZONE, getTimeZoneParts } from '@/src/lib/finance/period'
import { parseExpiresOnInput, wasteLotSchema } from '@/src/lib/inventory/lot-service'

describe('parseExpiresOnInput', () => {
  it('stores a calendar expiry date in America/Los_Angeles', () => {
    const date = parseExpiresOnInput('2026-08-20')
    const parts = getTimeZoneParts(date, FINANCE_TIME_ZONE)
    expect(parts.year).toBe(2026)
    expect(parts.month).toBe(8)
    expect(parts.day).toBe(20)
  })

  it('rejects malformed dates', () => {
    expect(() => parseExpiresOnInput('20-08-2026')).toThrow()
  })
})

describe('wasteLotSchema', () => {
  it('requires positive quantity and lot id', () => {
    const parsed = wasteLotSchema.parse({
      lotId: 'lot1',
      quantity: 3,
      reason: 'Caducado'
    })
    expect(parsed.quantity).toBe(3)
  })
})
