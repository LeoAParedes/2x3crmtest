import { describe, expect, it } from 'vitest'

import { normalizeSaleItems, validateCashPayment } from '@/src/lib/pos/sale-service'

describe('sale service rules', () => {
  it('merges duplicate products before decrementing stock', () => {
    expect(
      normalizeSaleItems([
        { inventoryItemId: 'item-1', quantity: 2 },
        { inventoryItemId: 'item-1', quantity: 3 },
        { inventoryItemId: 'item-2', quantity: 1 }
      ])
    ).toEqual([
      { inventoryItemId: 'item-1', quantity: 5 },
      { inventoryItemId: 'item-2', quantity: 1 }
    ])
  })

  it('rejects cash received below total', () => {
    expect(() => validateCashPayment('cash', 20, 19.99)).toThrow('INSUFFICIENT_PAYMENT')
  })
})
