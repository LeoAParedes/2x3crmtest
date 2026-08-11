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
    ).toEqual({ subtotal: 25.5, tax: 0, total: 25.5, lines: expect.any(Array) })
  })

  it('calculates IVA per line when enabled', () => {
    expect(
      calculateSaleTotals(
        [
          { quantity: 2, unitPrice: 100, unitMode: 'piece' },
          { quantity: 1, unitPrice: 50, unitMode: 'piece' }
        ],
        { showIvaOnReceipt: true, defaultIvaRate: 0.16 }
      )
    ).toEqual({ subtotal: 250, tax: 40, total: 290, lines: expect.any(Array) })
  })

  it('applies 0 IVA when product rate is explicitly exempt', () => {
    expect(
      calculateSaleTotals(
        [
          { quantity: 1, unitPrice: 45, unitMode: 'piece', ivaRate: 0 },
          { quantity: 1, unitPrice: 100, unitMode: 'piece', ivaRate: null }
        ],
        { showIvaOnReceipt: true, defaultIvaRate: 0.16 }
      )
    ).toEqual({
      subtotal: 145,
      tax: 16,
      total: 161,
      lines: [
        { lineSubtotal: 45, lineTax: 0, lineTotalWithTax: 45 },
        { lineSubtotal: 100, lineTax: 16, lineTotalWithTax: 116 }
      ]
    })
  })

  it('bills weight quantities in kilograms not grams', () => {
    // 2.50 kg stored as 2500 grams at $89/kg → $222.50
    expect(calculateLineTotal(2500, 89, 'weight')).toBe(222.5)
    expect(
      calculateSaleTotals([
        { quantity: 29, unitPrice: 16.5, unitMode: 'piece' },
        { quantity: 2500, unitPrice: 89, unitMode: 'weight' }
      ])
    ).toEqual({ subtotal: 701, tax: 0, total: 701, lines: expect.any(Array) })
  })
})
