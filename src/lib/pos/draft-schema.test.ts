import { describe, expect, it } from 'vitest'

import { draftPayloadSchema } from '@/src/lib/pos/draft-schema'

describe('draftPayloadSchema', () => {
  it('accepts empty cart drafts', () => {
    const parsed = draftPayloadSchema.safeParse({
      cart: [],
      paymentMethod: 'cash',
      amountReceived: null,
      updatedAt: new Date().toISOString()
    })
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.amountReceived).toBeNull()
  })

  it('coerces empty quantityInput while typing', () => {
    const parsed = draftPayloadSchema.safeParse({
      cart: [
        {
          inventoryItemId: 'cm12345678901234567890123',
          sku: 'AGU-01',
          productName: 'Agua',
          unitPrice: 10,
          supportsWeight: false,
          ivaRate: null,
          unitMode: 'piece',
          quantityInput: ''
        },
        {
          inventoryItemId: 'cm12345678901234567890124',
          sku: 'AVO-01',
          productName: 'Aguacate',
          unitPrice: 89,
          supportsWeight: true,
          ivaRate: 0.16,
          unitMode: 'weight',
          quantityInput: ''
        }
      ],
      paymentMethod: 'cash',
      amountReceived: 100
    })
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.cart[0].quantityInput).toBe('1')
    expect(parsed.data.cart[1].quantityInput).toBe('0.25')
  })

  it('canonicalizes legacy percent ivaRate values', () => {
    const parsed = draftPayloadSchema.safeParse({
      cart: [
        {
          inventoryItemId: 'cm12345678901234567890123',
          sku: 'AGU-01',
          productName: 'Agua',
          unitPrice: '12.5',
          unitMode: 'piece',
          quantityInput: '2',
          ivaRate: 16
        }
      ],
      paymentMethod: 'card',
      amountReceived: null
    })
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.cart[0].unitPrice).toBe(12.5)
    expect(parsed.data.cart[0].ivaRate).toBe(0.16)
  })
})
