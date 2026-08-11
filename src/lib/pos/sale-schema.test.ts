import { describe, expect, it } from 'vitest'

import { calculateLineTotal, calculateSaleTotals, createSaleSchema } from '@/src/lib/pos/sale-schema'

describe('createSaleSchema', () => {
  it('rejects client-controlled cashier identity', () => {
    const result = createSaleSchema.safeParse({
      items: [{ inventoryItemId: 'cm12345678901234567890123', quantity: 1, unitMode: 'piece' }],
      paymentMethod: 'cash',
      amountReceived: 20,
      cashierAuthUserId: 'forged-admin'
    })

    expect(result.success).toBe(false)
  })

  it('calculates authoritative totals from product prices', () => {
    expect(
      calculateSaleTotals([
        { quantity: 2, unitPrice: 10 },
        { quantity: 1, unitPrice: 5.5 }
      ])
    ).toEqual({ subtotal: 25.5, tax: 0, total: 25.5 })
  })

  it('bills weight quantities in kilograms not grams', () => {
    // 2.50 kg stored as 2500 grams at $89/kg → $222.50
    expect(calculateLineTotal(2500, 89, 'weight')).toBe(222.5)
    expect(
      calculateSaleTotals([
        { quantity: 29, unitPrice: 16.5, unitMode: 'piece' },
        { quantity: 2500, unitPrice: 89, unitMode: 'weight' }
      ])
    ).toEqual({ subtotal: 701, tax: 0, total: 701 })
  })
})
