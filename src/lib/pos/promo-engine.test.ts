import { describe, expect, it } from 'vitest'

import {
  applyDiscountToSaleTotals,
  computePromotionDiscount,
  selectBestPromotion,
  toPromoQuantity,
  type PromoCandidate,
  type PromoCartLine
} from '@/src/lib/pos/promo-engine'

const lines: PromoCartLine[] = [
  { inventoryItemId: 'a', quantity: 3, unitPrice: 10, lineSubtotal: 30 },
  { inventoryItemId: 'b', quantity: 1, unitPrice: 20, lineSubtotal: 20 },
  { inventoryItemId: 'c', quantity: 1, unitPrice: 25, lineSubtotal: 25 }
]

describe('promo-engine', () => {
  it('converts weight grams to kg units for promo rules', () => {
    expect(toPromoQuantity(2500, 'weight')).toBe(3)
    expect(toPromoQuantity(750, 'weight')).toBe(1)
    expect(toPromoQuantity(3, 'piece')).toBe(3)
  })

  it('does not treat raw grams as 2x1 units', () => {
    const promo: PromoCandidate = {
      id: 'p-weight',
      name: '2x1 aguacate',
      type: '2x1',
      value: 0,
      minPurchase: 0,
      productIds: ['avo'],
      bundleItems: []
    }
    const gramsAsQty = computePromotionDiscount(promo, [
      { inventoryItemId: 'avo', quantity: 2500, unitPrice: 89, lineSubtotal: 222.5 }
    ])
    const kgAsQty = computePromotionDiscount(promo, [
      {
        inventoryItemId: 'avo',
        quantity: toPromoQuantity(2500, 'weight'),
        unitPrice: 89,
        lineSubtotal: 222.5
      }
    ])
    expect(gramsAsQty?.discountTotal).toBeGreaterThan(10_000)
    expect(kgAsQty?.discountTotal).toBe(89)
  })

  it('applies 3x2 as one free unit', () => {
    const promo: PromoCandidate = {
      id: 'p1',
      name: '3x2 leche',
      type: '3x2',
      value: 0,
      minPurchase: 0,
      productIds: ['a'],
      bundleItems: []
    }
    const result = computePromotionDiscount(promo, lines)
    expect(result?.discountTotal).toBe(10)
  })

  it('applies bundle fixed discount when all quantities are present', () => {
    const promo: PromoCandidate = {
      id: 'p2',
      name: 'Trio -10',
      type: 'bundle',
      value: 10,
      minPurchase: 0,
      productIds: [],
      bundleItems: [
        { inventoryItemId: 'a', requiredQty: 1 },
        { inventoryItemId: 'b', requiredQty: 1 },
        { inventoryItemId: 'c', requiredQty: 1 }
      ]
    }
    const result = computePromotionDiscount(promo, lines)
    expect(result?.discountTotal).toBe(10)
  })

  it('selects the promotion with greatest savings', () => {
    const best = selectBestPromotion(
      [
        {
          id: 'p1',
          name: '2x1',
          type: '2x1',
          value: 0,
          minPurchase: 0,
          productIds: ['a'],
          bundleItems: []
        },
        {
          id: 'p2',
          name: '10%',
          type: 'porcentaje',
          value: 10,
          minPurchase: 0,
          productIds: ['a', 'b', 'c'],
          bundleItems: []
        }
      ],
      lines
    )
    expect(best?.promotionId).toBe('p1')
    expect(best?.discountTotal).toBe(10)
  })

  it('reduces tax proportionally after discount', () => {
    const totals = applyDiscountToSaleTotals({ subtotal: 100, tax: 16, discountTotal: 25 })
    expect(totals.discountTotal).toBe(25)
    expect(totals.tax).toBe(12)
    expect(totals.total).toBe(87)
  })
})
