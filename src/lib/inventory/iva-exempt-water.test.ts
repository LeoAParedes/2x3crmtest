import { describe, expect, it } from 'vitest'

import {
  isIvaExemptWaterProduct,
  resolveEffectiveIvaRate,
  suggestedIvaRateForProduct
} from '@/src/lib/inventory/iva-exempt-water'

describe('isIvaExemptWaterProduct', () => {
  it('matches bottled drinking water', () => {
    expect(isIvaExemptWaterProduct('Agua purificada 1.5 L', 'Bebidas')).toBe(true)
    expect(isIvaExemptWaterProduct('Agua purificada garrafón 20 L', 'Bebidas')).toBe(true)
    expect(isIvaExemptWaterProduct('Agua mineral 600 ml', 'Bebidas')).toBe(true)
    expect(isIvaExemptWaterProduct('Garrafón de agua 20L', 'Bebidas')).toBe(true)
    expect(isIvaExemptWaterProduct('Agua', 'Agua')).toBe(true)
  })

  it('rejects false positives that mention agua', () => {
    expect(isIvaExemptWaterProduct('Aguacate Hass', 'Frutas y Verduras')).toBe(false)
    expect(isIvaExemptWaterProduct('Atún en agua 140 g', 'Abarrotes')).toBe(false)
    expect(isIvaExemptWaterProduct('Agua oxigenada 100 ml', 'Higiene Personal')).toBe(false)
    expect(isIvaExemptWaterProduct('Refresco cola 600 ml', 'Bebidas')).toBe(false)
  })
})

describe('resolveEffectiveIvaRate', () => {
  it('returns 0 for water when ivaRate is unset', () => {
    expect(
      resolveEffectiveIvaRate({
        productName: 'Agua purificada 1.5 L',
        category: 'Bebidas',
        ivaRate: null
      })
    ).toBe(0)
  })

  it('forces 0 for water even if a non-zero rate was stored', () => {
    expect(
      resolveEffectiveIvaRate({
        productName: 'Agua mineral 600 ml',
        category: 'Bebidas',
        ivaRate: 0.16
      })
    ).toBe(0)
  })

  it('respects an explicit rate on non-water products', () => {
    expect(
      resolveEffectiveIvaRate({
        productName: 'Refresco cola 600 ml',
        category: 'Bebidas',
        ivaRate: 0.08
      })
    ).toBe(0.08)
  })

  it('returns null for non-water so default IVA applies', () => {
    expect(
      resolveEffectiveIvaRate({
        productName: 'Refresco cola 600 ml',
        category: 'Bebidas',
        ivaRate: null
      })
    ).toBeNull()
  })

  it('canonicalizes legacy percent values', () => {
    expect(
      resolveEffectiveIvaRate({
        productName: 'Leche',
        category: 'Lácteos',
        ivaRate: 16
      })
    ).toBe(0.16)
  })
})

describe('suggestedIvaRateForProduct', () => {
  it('suggests 0 for water and null otherwise', () => {
    expect(suggestedIvaRateForProduct('Agua purificada 1.5 L', 'Bebidas')).toBe(0)
    expect(suggestedIvaRateForProduct('Refresco cola 600 ml', 'Bebidas')).toBeNull()
  })
})
