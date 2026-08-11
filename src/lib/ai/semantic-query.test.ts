import { describe, expect, it } from 'vitest'

import {
  normalizeSemanticQuery,
  parseDeterministicSemanticQuery,
  semanticReadQuerySchema
} from '@/src/lib/ai/semantic-query'

const fixedNow = new Date('2026-08-11T10:00:00.000Z')

describe('parseDeterministicSemanticQuery', () => {
  it('extracts a product sales and stock request for last week', () => {
    expect(
      parseDeterministicSemanticQuery(
        'Cuántos aguacates se vendieron la semana pasada y cuánto queda?',
        fixedNow
      )
    ).toMatchObject({
      intent: 'product_sales_and_stock',
      productQuery: 'aguacates',
      dateRange: { kind: 'previous_week' },
      metrics: ['quantity', 'stock']
    })
  })

  it('extracts an explicit product sales date', () => {
    expect(
      parseDeterministicSemanticQuery('Ventas de leche el 10 de agosto', fixedNow)
    ).toMatchObject({
      intent: 'product_sales',
      productQuery: 'leche',
      dateRange: { kind: 'explicit_date', date: '2026-08-10' }
    })
  })

  it('extracts today sales for a product', () => {
    expect(
      parseDeterministicSemanticQuery('Cuántos aguacates se vendieron hoy', fixedNow)
    ).toMatchObject({
      intent: 'product_sales',
      productQuery: 'aguacates',
      dateRange: { kind: 'today' },
      metrics: ['quantity']
    })
  })

  it('extracts yesterday stock for a product', () => {
    expect(
      parseDeterministicSemanticQuery('Cuánto queda de leche ayer', fixedNow)
    ).toMatchObject({
      intent: 'product_stock',
      productQuery: 'leche',
      dateRange: { kind: 'yesterday' },
      metrics: ['stock']
    })
  })

  it('extracts current week sales', () => {
    expect(
      parseDeterministicSemanticQuery('Ventas de pan esta semana', fixedNow)
    ).toMatchObject({
      intent: 'product_sales',
      productQuery: 'pan',
      dateRange: { kind: 'week' }
    })
  })

  it('extracts current month sales', () => {
    expect(
      parseDeterministicSemanticQuery('Cuántos huevos se vendieron este mes', fixedNow)
    ).toMatchObject({
      intent: 'product_sales',
      productQuery: 'huevos',
      dateRange: { kind: 'month' },
      metrics: ['quantity']
    })
  })

  it('extracts rolling days sales', () => {
    expect(
      parseDeterministicSemanticQuery('Ventas de leche últimos 7 días', fixedNow)
    ).toMatchObject({
      intent: 'product_sales',
      productQuery: 'leche',
      dateRange: { kind: 'rolling_days', days: 7 }
    })
  })

  it('returns clarify when no product phrase remains', () => {
    expect(
      parseDeterministicSemanticQuery('Cuánto se vendió la semana pasada', fixedNow)
    ).toMatchObject({
      intent: 'clarify',
      dateRange: { kind: 'previous_week' }
    })
  })

  it('returns null for non-semantic messages', () => {
    expect(parseDeterministicSemanticQuery('hola', fixedNow)).toBeNull()
  })

  it('extracts stock count phrasing with hay de', () => {
    expect(parseDeterministicSemanticQuery('¿Cuántos hay de leche?', fixedNow)).toMatchObject({
      intent: 'product_stock',
      productQuery: 'leche',
      metrics: ['stock']
    })
  })

  it('extracts stock availability phrasing', () => {
    expect(parseDeterministicSemanticQuery('¿Hay stock de leche?', fixedNow)).toMatchObject({
      intent: 'product_stock',
      productQuery: 'leche',
      metrics: ['stock']
    })
  })

  it('returns null for non-ERP date-only social phrasing', () => {
    expect(parseDeterministicSemanticQuery('Nos vemos hoy', fixedNow)).toBeNull()
  })

  it('does not treat bare ventas hoy as a product query', () => {
    const parsed = parseDeterministicSemanticQuery('Ventas hoy', fixedNow)
    expect(parsed).not.toBeNull()
    expect(parsed && 'productQuery' in parsed ? parsed.productQuery : undefined).not.toBe('ventas')
    expect(parsed).toMatchObject({
      dateRange: { kind: 'today' }
    })
    expect(['clarify', 'sales_summary']).toContain(parsed?.intent)
  })

  it('clamps rolling days above 90 instead of throwing', () => {
    expect(
      parseDeterministicSemanticQuery('Ventas de leche últimos 91 días', fixedNow)
    ).toMatchObject({
      intent: 'product_sales',
      productQuery: 'leche',
      dateRange: { kind: 'rolling_days', days: 90 }
    })
  })

  it('extracts product query from kilos phrasing and defaults to month', () => {
    expect(
      parseDeterministicSemanticQuery('Cuantos kilos de aguacate se vendieron?', fixedNow)
    ).toMatchObject({
      intent: 'product_sales',
      productQuery: 'aguacate',
      dateRange: { kind: 'month' },
      metrics: ['quantity']
    })
  })

  it('extracts garrafones product sales without unit noise', () => {
    expect(
      parseDeterministicSemanticQuery('Cuantos garrafones se vendieron?', fixedNow)
    ).toMatchObject({
      intent: 'product_sales',
      productQuery: 'garrafones',
      dateRange: { kind: 'month' },
      metrics: ['quantity']
    })
  })

  it('extracts product query from vendimos phrasing', () => {
    expect(
      parseDeterministicSemanticQuery('Cuántos aguacates vendimos hoy', fixedNow)
    ).toMatchObject({
      intent: 'product_sales',
      productQuery: 'aguacates',
      dateRange: { kind: 'today' },
      metrics: ['quantity']
    })
  })

  it('extracts explicit date with year in Spanish phrasing', () => {
    expect(
      parseDeterministicSemanticQuery('Ventas de leche el 10 de agosto de 2025', fixedNow)
    ).toMatchObject({
      intent: 'product_sales',
      productQuery: 'leche',
      dateRange: { kind: 'explicit_date', date: '2025-08-10' }
    })
  })
})

describe('normalizeSemanticQuery', () => {
  it('validates a semantic read query', () => {
    const parsed = parseDeterministicSemanticQuery(
      'Cuántos aguacates se vendieron la semana pasada y cuánto queda?',
      fixedNow
    )
    expect(parsed).not.toBeNull()
    expect(normalizeSemanticQuery(parsed)).toMatchObject({
      intent: 'product_sales_and_stock',
      productQuery: 'aguacates'
    })
  })

  it('rejects invalid payloads', () => {
    expect(() =>
      normalizeSemanticQuery({
        intent: 'product_sales',
        dateRange: { kind: 'today' },
        metrics: []
      })
    ).toThrow()
  })
})

describe('semanticReadQuerySchema', () => {
  it('rejects unknown object keys', () => {
    expect(
      semanticReadQuerySchema.safeParse({
        intent: 'product_sales',
        productQuery: 'leche',
        dateRange: { kind: 'today' },
        metrics: ['quantity'],
        extraField: true
      }).success
    ).toBe(false)
  })

  it('rejects invalid explicit dates', () => {
    expect(
      semanticReadQuerySchema.safeParse({
        intent: 'product_sales',
        productQuery: 'leche',
        dateRange: { kind: 'explicit_date', date: '2026-02-30' },
        metrics: ['quantity']
      }).success
    ).toBe(false)
  })

  it('rejects product intents without productQuery', () => {
    expect(
      semanticReadQuerySchema.safeParse({
        intent: 'product_sales',
        dateRange: { kind: 'today' },
        metrics: ['quantity']
      }).success
    ).toBe(false)
  })

  it('accepts all date range kinds', () => {
    const kinds = [
      { kind: 'today' as const },
      { kind: 'yesterday' as const },
      { kind: 'week' as const },
      { kind: 'previous_week' as const },
      { kind: 'month' as const },
      { kind: 'rolling_days' as const, days: 14 },
      { kind: 'explicit_date' as const, date: '2026-08-10' }
    ]

    for (const dateRange of kinds) {
      expect(
        semanticReadQuerySchema.safeParse({
          intent: 'product_sales',
          productQuery: 'leche',
          dateRange,
          metrics: ['quantity']
        }).success
      ).toBe(true)
    }
  })
})
