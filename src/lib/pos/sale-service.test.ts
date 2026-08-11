import { describe, expect, it } from 'vitest'

import { calculateSaleTotals } from '@/src/lib/pos/sale-schema'
import { normalizeSaleItems, validateCashPayment } from '@/src/lib/pos/sale-service'

describe('sale service rules', () => {
  it('merges duplicate products before decrementing stock', () => {
    expect(
      normalizeSaleItems([
        { inventoryItemId: 'item-1', quantity: 2, unitMode: 'piece' },
        { inventoryItemId: 'item-1', quantity: 3, unitMode: 'piece' },
        { inventoryItemId: 'item-1', quantity: 750, unitMode: 'weight' },
        { inventoryItemId: 'item-2', quantity: 1, unitMode: 'piece' }
      ])
    ).toEqual([
      { inventoryItemId: 'item-1', quantity: 5, unitMode: 'piece' },
      { inventoryItemId: 'item-1', quantity: 750, unitMode: 'weight' },
      { inventoryItemId: 'item-2', quantity: 1, unitMode: 'piece' }
    ])
  })

  it('rejects cash received below total', () => {
    expect(() => validateCashPayment('cash', 20, 19.99)).toThrow('INSUFFICIENT_PAYMENT')
  })

  it('accepts cash payment for mixed piece and weight carts', () => {
    const totals = calculateSaleTotals([
      { quantity: 29, unitPrice: 16.5, unitMode: 'piece' },
      { quantity: 2500, unitPrice: 89, unitMode: 'weight' }
    ])
    expect(totals.total).toBe(701)
    expect(() => validateCashPayment('cash', totals.total, 702)).not.toThrow()
  })
})
