import { describe, expect, it } from 'vitest'

import {
  FINANCE_TIME_ZONE,
  formatBucketKey,
  getPeriodBounds,
  isFinancePeriod,
  zonedWallTimeToUtc
} from '@/src/lib/finance/period'

describe('finance period helpers', () => {
  it('accepts day week and month periods', () => {
    expect(isFinancePeriod('day')).toBe(true)
    expect(isFinancePeriod('week')).toBe(true)
    expect(isFinancePeriod('month')).toBe(true)
    expect(isFinancePeriod('year')).toBe(false)
  })

  it('builds day bounds from Pacific midnight (00:00)', () => {
    const now = zonedWallTimeToUtc(2026, 8, 10, 15, 30, 0, FINANCE_TIME_ZONE)
    const bounds = getPeriodBounds('day', now, FINANCE_TIME_ZONE)
    expect(formatBucketKey(bounds.start, 'day', FINANCE_TIME_ZONE)).toBe('00')
    expect(bounds.end.toISOString()).toBe(now.toISOString())
    expect(FINANCE_TIME_ZONE).toBe('America/Los_Angeles')
  })

  it('starts week on Monday in Pacific time', () => {
    // Monday Aug 10 2026 12:00 Pacific
    const monday = zonedWallTimeToUtc(2026, 8, 10, 12, 0, 0, FINANCE_TIME_ZONE)
    const weekFromMonday = getPeriodBounds('week', monday, FINANCE_TIME_ZONE)
    expect(formatBucketKey(weekFromMonday.start, 'week', FINANCE_TIME_ZONE)).toMatch(/10/)

    // Wednesday Aug 12 2026
    const wednesday = zonedWallTimeToUtc(2026, 8, 12, 12, 0, 0, FINANCE_TIME_ZONE)
    const weekFromWednesday = getPeriodBounds('week', wednesday, FINANCE_TIME_ZONE)
    expect(weekFromWednesday.start.toISOString()).toBe(weekFromMonday.start.toISOString())
  })
})
