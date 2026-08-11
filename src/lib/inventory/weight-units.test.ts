import { describe, expect, it } from 'vitest'

import {
  gramsToKilograms,
  hasSufficientStock,
  inferWeightSupport,
  isLegacyKilogramStock,
  kilogramsToGrams,
  stockQuantityFromCsvUnit,
  toCanonicalWeightStock
} from '@/src/lib/inventory/weight-units'

describe('weight inventory units', () => {
  it('infers weight support from produce and meat categories', () => {
    expect(inferWeightSupport('Frutas y Verduras', null)).toBe(true)
    expect(inferWeightSupport('Carnes y Pescados', null)).toBe(true)
    expect(inferWeightSupport('Bebidas', null)).toBe(false)
    expect(inferWeightSupport('Perecederos', null, 'Salmón fresco')).toBe(true)
    expect(inferWeightSupport('Carnes', null, 'Carne de res molida')).toBe(true)
  })

  it('treats bottled refreshments as pieces, not weight', () => {
    expect(inferWeightSupport('Bebidas', null, 'Refresco de cola 2.5 L')).toBe(false)
    expect(inferWeightSupport('Bebidas', null, 'Refresco de cola 600 ml')).toBe(false)
    expect(inferWeightSupport('Bebidas', null, 'Agua purificada garrafón 20 L')).toBe(false)
    expect(inferWeightSupport('Bebidas', null, 'Jugo de naranja 1 L')).toBe(false)
  })

  it('converts CSV kilogram stock to grams and leaves piece stock alone', () => {
    expect(stockQuantityFromCsvUnit(60, 'kg')).toBe(60_000)
    expect(stockQuantityFromCsvUnit(0.75, 'kg')).toBe(750)
    expect(stockQuantityFromCsvUnit(500, 'g')).toBe(500)
    expect(stockQuantityFromCsvUnit(90, 'pieza')).toBe(90)
  })

  it('normalizes legacy kilogram integers into grams', () => {
    expect(isLegacyKilogramStock(60, true)).toBe(true)
    expect(isLegacyKilogramStock(60_000, true)).toBe(false)
    expect(isLegacyKilogramStock(90, false)).toBe(false)
    expect(toCanonicalWeightStock(60)).toBe(60_000)
    expect(toCanonicalWeightStock(60_000)).toBe(60_000)
  })

  it('checks weight sales against gram stock', () => {
    const stockGrams = toCanonicalWeightStock(5)
    expect(hasSufficientStock(stockGrams, kilogramsToGrams(2.5))).toBe(true)
    expect(hasSufficientStock(stockGrams, kilogramsToGrams(6))).toBe(false)
    expect(gramsToKilograms(stockGrams)).toBe(5)
  })
})
