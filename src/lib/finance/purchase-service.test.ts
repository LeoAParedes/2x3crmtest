import { describe, expect, it } from 'vitest'

import { createSupplierSchema, purchaseEntrySchema } from '@/src/lib/finance/purchase-service'

describe('purchase entry schemas', () => {
  it('requires paid or credit payment status', () => {
    const parsed = purchaseEntrySchema.parse({
      inventoryItemId: 'item1',
      supplierId: 'sup1',
      quantity: 10,
      unitCost: 12.5,
      paymentStatus: 'credit',
      reason: 'Restock tomate',
      expiresOn: '2026-09-01'
    })
    expect(parsed.paymentStatus).toBe('credit')
    expect(parsed.quantity).toBe(10)
    expect(parsed.expiresOn).toBe('2026-09-01')
  })

  it('requires expiresOn for purchase lots', () => {
    expect(() =>
      purchaseEntrySchema.parse({
        inventoryItemId: 'item1',
        supplierId: 'sup1',
        quantity: 10,
        unitCost: 12.5,
        paymentStatus: 'paid',
        reason: 'Sin caducidad'
      })
    ).toThrow()
  })

  it('accepts creating a supplier with name only', () => {
    const supplier = createSupplierSchema.parse({ name: 'Abarrotes Norte' })
    expect(supplier.name).toBe('Abarrotes Norte')
  })
})
