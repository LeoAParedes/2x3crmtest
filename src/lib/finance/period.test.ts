import { describe, expect, it } from 'vitest'

import {
  FINANCE_TIME_ZONE,
  formatBucketKey,
  getPeriodBounds,
  getPreviousMonthBounds,
  getRollingBounds,
  getYearBounds,
  isFinancePeriod,
  resolveSeriesPeriod,
  zonedWallTimeToUtc
} from '@/src/lib/finance/period'

describe('finance period helpers', () => {
  it('builds previous calendar month and year-to-date bounds', () => {
    const now = zonedWallTimeToUtc(2026, 8, 11, 12, 0, 0, FINANCE_TIME_ZONE)
    const prev = getPreviousMonthBounds(now, FINANCE_TIME_ZONE)
    expect(formatBucketKey(prev.start, 'week', FINANCE_TIME_ZONE).toLowerCase()).toMatch(/jul/)
    const ytd = getYearBounds(now, FINANCE_TIME_ZONE)
    expect(formatBucketKey(ytd.start, 'week', FINANCE_TIME_ZONE).toLowerCase()).toMatch(/ene|jan/)
  })

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
    const monday = zonedWallTimeToUtc(2026, 8, 10, 12, 0, 0, FINANCE_TIME_ZONE)
    const weekFromMonday = getPeriodBounds('week', monday, FINANCE_TIME_ZONE)
    expect(formatBucketKey(weekFromMonday.start, 'week', FINANCE_TIME_ZONE)).toMatch(/10/)

    const wednesday = zonedWallTimeToUtc(2026, 8, 12, 12, 0, 0, FINANCE_TIME_ZONE)
    const weekFromWednesday = getPeriodBounds('week', wednesday, FINANCE_TIME_ZONE)
    expect(weekFromWednesday.start.toISOString()).toBe(weekFromMonday.start.toISOString())
  })

  it('builds rolling 7-day and quincena windows from Pacific midnight', () => {
    const now = zonedWallTimeToUtc(2026, 8, 10, 18, 0, 0, FINANCE_TIME_ZONE)
    const week = getRollingBounds(7, now, FINANCE_TIME_ZONE)
    expect(week.days).toBe(7)
    expect(formatBucketKey(week.start, 'week', FINANCE_TIME_ZONE)).toMatch(/04/)

    const quincena = getRollingBounds(15, now, FINANCE_TIME_ZONE)
    expect(quincena.days).toBe(15)
    expect(quincena.end.toISOString()).toBe(now.toISOString())
  })

  it('rolling 31 natural days can span two calendar months', () => {
    // Aug 10 2026 Pacific → start Jul 11 (31 days inclusive)
    const now = zonedWallTimeToUtc(2026, 8, 10, 12, 0, 0, FINANCE_TIME_ZONE)
    const last31 = getRollingBounds(31, now, FINANCE_TIME_ZONE)
    expect(last31.days).toBe(31)
    const startLabel = formatBucketKey(last31.start, 'week', FINANCE_TIME_ZONE)
    const endLabel = formatBucketKey(last31.end, 'week', FINANCE_TIME_ZONE)
    expect(startLabel.toLowerCase()).toMatch(/jul/)
    expect(endLabel.toLowerCase()).toMatch(/ago|aug/)
  })

  it('uses daily buckets for multi-day ranges', () => {
    const start = zonedWallTimeToUtc(2026, 8, 1, 0, 0, 0, FINANCE_TIME_ZONE)
    const end = zonedWallTimeToUtc(2026, 8, 10, 12, 0, 0, FINANCE_TIME_ZONE)
    expect(resolveSeriesPeriod(start, end, FINANCE_TIME_ZONE)).toBe('week')
    expect(resolveSeriesPeriod(start, start, FINANCE_TIME_ZONE)).toBe('day')
  })
})
