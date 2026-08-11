import { describe, expect, it } from 'vitest'

import { buildSaleTicketText, formatTicketQuantity } from '@/src/lib/pos/ticket-format'

describe('ticket formatter', () => {
  it('formats weighted and piece quantities', () => {
    expect(formatTicketQuantity({ quantity: 750, unitMode: 'weight' })).toBe('0.750kg')
    expect(formatTicketQuantity({ quantity: 3, unitMode: 'piece' })).toBe('3pz')
  })

  it('builds a receipt with payment and change lines', () => {
    const text = buildSaleTicketText(
      {
        saleNumber: 'SALE-001',
        createdAt: '2026-08-10T12:00:00.000Z',
        cashierUsername: 'cashier01',
        items: [
          {
            sku: 'SKU-123',
            productName: 'Arroz',
            quantity: 2,
            unitMode: 'piece',
            lineTotal: 10
          }
        ],
        subtotal: 10,
        tax: 0,
        total: 10,
        paymentMethod: 'cash',
        amountReceived: 20,
        changeDue: 10
      },
      { printerWidth: '58mm' }
    )

    expect(text).toContain('Venta: SALE-001')
    expect(text).toContain('Cajero: cashier01')
    expect(text).toContain('Recibido')
    expect(text).toContain('Cambio')
  })
})
