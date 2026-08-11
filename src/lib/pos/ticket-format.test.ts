import { describe, expect, it } from 'vitest'

import {
  buildSaleTicketText,
  formatTicketQuantity,
  labelAmountLine,
  printerColumns
} from '@/src/lib/pos/ticket-format'

describe('ticket formatter', () => {
  it('formats weighted and piece quantities', () => {
    expect(formatTicketQuantity({ quantity: 750, unitMode: 'weight' })).toBe('0.750kg')
    expect(formatTicketQuantity({ quantity: 3, unitMode: 'piece' })).toBe('3pz')
  })

  it('keeps label left and amount right on the same padded line', () => {
    const columns = printerColumns['80mm']
    const line = labelAmountLine('Subtotal', 10, columns)

    expect(line).toHaveLength(columns)
    expect(line.startsWith('Subtotal')).toBe(true)
    expect(line.trimEnd().endsWith('$10.00')).toBe(true)
    expect(line.includes('\n')).toBe(false)
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

    const columns = printerColumns['58mm']
    const lines = text.split('\n')
    const subtotalLine = lines.find(line => line.includes('Subtotal'))

    expect(text).toContain('Venta: SALE-001')
    expect(text).toContain('Cajero: cashier01')
    expect(text).toContain('Recibido')
    expect(text).toContain('Cambio')
    expect(subtotalLine).toBeDefined()
    expect(subtotalLine).toHaveLength(columns)
    expect(subtotalLine?.includes('$10.00')).toBe(true)
    expect(lines.some(line => line.trim() === '2x3 CRM Store' || line.includes('2x3 CRM Store'))).toBe(true)
  })

  it('centers header within the ticket column width', () => {
    const text = buildSaleTicketText(
      {
        saleNumber: 'SALE-002',
        createdAt: '2026-08-10T12:00:00.000Z',
        cashierUsername: 'cashier01',
        items: [],
        subtotal: 0,
        tax: 0,
        total: 0,
        paymentMethod: 'card',
        amountReceived: null,
        changeDue: 0
      },
      {
        printerWidth: '80mm',
        storeHeader: ['2x3 CRM TEST', 'Ticket de venta']
      }
    )

    const columns = printerColumns['80mm']
    const [headerLine] = text.split('\n')
    expect(headerLine).toHaveLength(columns)
    expect(headerLine.trim()).toBe('2x3 CRM TEST')
    expect(headerLine.startsWith(' ')).toBe(false)
    // Centered with NBSP padding on both sides
    expect(headerLine.startsWith('\u00A0')).toBe(true)
    expect(headerLine.endsWith('\u00A0')).toBe(true)
  })
})
