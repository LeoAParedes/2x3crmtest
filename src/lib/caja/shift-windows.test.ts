import { describe, expect, it } from 'vitest'

import { resolveCashShiftSlot } from '@/src/lib/caja/shift-windows'
import { zonedWallTimeToUtc } from '@/src/lib/finance/period'

describe('resolveCashShiftSlot', () => {
  it('returns morning between 06:00 and 14:00', () => {
    const now = zonedWallTimeToUtc(2026, 8, 11, 9, 30, 0)
    expect(resolveCashShiftSlot(now)).toBe('morning')
  })

  it('returns afternoon between 14:00 and 22:00', () => {
    const now = zonedWallTimeToUtc(2026, 8, 11, 18, 0, 0)
    expect(resolveCashShiftSlot(now)).toBe('afternoon')
  })

  it('returns null outside operating hours', () => {
    const now = zonedWallTimeToUtc(2026, 8, 11, 23, 10, 0)
    expect(resolveCashShiftSlot(now)).toBeNull()
  })
})
