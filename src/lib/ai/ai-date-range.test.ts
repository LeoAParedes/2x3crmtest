import { describe, expect, it } from 'vitest'

import {
  parseAiPeriodFromText,
  resolveAiDateRangeFromArgs,
  resolveAiPeriodKind,
  toToolPeriodArgs
} from '@/src/lib/ai/ai-date-range'
import { resolveExpenseCategoryFromText } from '@/src/lib/ai/erp-entity-catalog'
import { FINANCE_TIME_ZONE, zonedWallTimeToUtc } from '@/src/lib/finance/period'

const fixedNow = zonedWallTimeToUtc(2026, 8, 11, 12, 0, 0, FINANCE_TIME_ZONE)

describe('parseAiPeriodFromText', () => {
  it('maps este año to year-to-date', () => {
    const range = parseAiPeriodFromText('cuanto pague de luz este año', fixedNow)
    expect(range.kind).toBe('year')
    expect(range.label).toMatch(/este año/i)
  })

  it('maps último mes to rolling 31 days', () => {
    const range = parseAiPeriodFromText('cuantas ganancias hubo en el ultimo mes', fixedNow)
    expect(range.kind).toBe('rolling')
    expect(range.rollingDays).toBe(31)
  })

  it('maps mes pasado to previous calendar month', () => {
    const range = parseAiPeriodFromText('egresos del mes pasado', fixedNow)
    expect(range.kind).toBe('last_month')
  })

  it('maps últimos N días to rolling', () => {
    const range = parseAiPeriodFromText('ventas de los últimos 15 días', fixedNow)
    expect(range.kind).toBe('rolling')
    expect(range.rollingDays).toBe(15)
  })

  it('maps esta semana and hoy', () => {
    expect(parseAiPeriodFromText('ventas esta semana', fixedNow).kind).toBe('week')
    expect(parseAiPeriodFromText('ventas de hoy', fixedNow).kind).toBe('day')
  })
})

describe('resolveAiDateRangeFromArgs', () => {
  it('resolves year and last_month kinds', () => {
    expect(resolveAiDateRangeFromArgs({ period: 'year' }, 'month', fixedNow).kind).toBe('year')
    expect(resolveAiDateRangeFromArgs({ period: 'last_month' }, 'month', fixedNow).kind).toBe(
      'last_month'
    )
  })

  it('prefers custom fromDate/toDate', () => {
    const range = resolveAiDateRangeFromArgs(
      { period: 'month', fromDate: '2026-01-01', toDate: '2026-01-31' },
      'month',
      fixedNow
    )
    expect(range.kind).toBe('custom')
    expect(range.label).toContain('2026-01-01')
  })

  it('maps tool period args for rolling', () => {
    const range = resolveAiPeriodKind('rolling', fixedNow, 31)
    expect(toToolPeriodArgs(range)).toEqual({ period: 'rolling', rollingDays: 31 })
  })
})

describe('resolveExpenseCategoryFromText', () => {
  it('resolves servicio categories from Spanish wording', () => {
    expect(resolveExpenseCategoryFromText('cuánto pagué de luz este año')).toBe('luz')
    expect(resolveExpenseCategoryFromText('pagos de agua en julio')).toBe('agua')
    expect(resolveExpenseCategoryFromText('renta del local')).toBe('renta')
    expect(resolveExpenseCategoryFromText('electricidad CFE')).toBe('luz')
  })

  it('does not treat bare servicio as a category', () => {
    expect(resolveExpenseCategoryFromText('cuánto pagué de servicio')).toBeNull()
  })
})
