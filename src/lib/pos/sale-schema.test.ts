import { describe, expect, it } from 'vitest'

import { calculateSaleTotals, createSaleSchema } from '@/src/lib/pos/sale-schema'

describe('createSaleSchema', () => {
  it('rejects client-controlled cashier identity', () => {
    const result = createSaleSchema.safeParse({
      items: [{ inventoryItemId: 'cm12345678901234567890123', quantity: 1 }],
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
})
