import { describe, expect, it } from 'vitest'

import {
  calculateBillableAmount,
  formatStockQuantityLabel,
  formatUnitCostLabel
} from '@/src/lib/inventory/logbook-quantity'
import { buildSystemLogbookEntries, type SystemActionLogRow } from '@/src/lib/inventory/system-logbook'

describe('billable purchase amounts', () => {
  it('uses kilograms for weight stock totals', () => {
    expect(calculateBillableAmount(5000, 389, true)).toBe(1945)
    expect(calculateBillableAmount(30000, 185, true)).toBe(5550)
  })

  it('keeps piece totals 1:1', () => {
    expect(calculateBillableAmount(40, 12.5, false)).toBe(500)
  })

  it('formats unit cost with kg or pz', () => {
    expect(formatUnitCostLabel(389, true)).toBe('389.00 MXN / kg')
    expect(formatUnitCostLabel(185, false)).toBe('185.00 MXN / pz')
  })
})

describe('purchase and waste logbook details', () => {
  const rows: SystemActionLogRow[] = [
    {
      id: 'p1',
      action: 'finance.purchase.entry',
      status: 'success',
      actorUsername: 'admin',
      actorRole: 'admin',
      entityType: 'Purchase',
      entityId: 'purchase-1',
      metadata: {
        inventoryItemId: 'item-fish',
        sku: 'PESC-01',
        productName: 'Salmón fresco',
        quantity: 5000,
        unitCost: 389,
        totalAmount: 1_945_000,
        paymentStatus: 'paid',
        expiresOn: '2026-08-20',
        supplierName: 'Mariscos del Norte',
        supportsWeight: true
      },
      createdAt: new Date('2026-08-11T12:00:00.000Z')
    },
    {
      id: 'w1',
      action: 'inventory.lot.waste',
      status: 'success',
      actorUsername: 'admin',
      actorRole: 'admin',
      entityType: 'InventoryLot',
      entityId: 'lot-1',
      metadata: {
        inventoryItemId: 'item-fish',
        sku: 'PESC-01',
        productName: 'Salmón fresco',
        quantity: 2,
        remaining: 4998,
        reason: 'Merma por caducidad',
        supportsWeight: true
      },
      createdAt: new Date('2026-08-11T13:00:00.000Z')
    },
    {
      id: 'p2',
      action: 'finance.purchase.entry',
      status: 'success',
      actorUsername: 'admin',
      actorRole: 'admin',
      entityType: 'Purchase',
      entityId: 'purchase-2',
      metadata: {
        inventoryItemId: 'item-piece',
        sku: 'REF-01',
        productName: 'Refresco 600ml',
        quantity: 40,
        unitCost: 12.5,
        totalAmount: 500,
        paymentStatus: 'credit',
        supportsWeight: false,
        supplierName: 'Bebidas SA'
      },
      createdAt: new Date('2026-08-11T11:00:00.000Z')
    }
  ]

  it('humanizes weight purchase rows with kg and corrected total', () => {
    const entries = buildSystemLogbookEntries(rows, { category: 'inventory' })
    const purchase = entries.find(entry => entry.id === 'p1')
    expect(purchase?.actionLabel).toBe('Compra a proveedor')
    expect(purchase?.details).toContain('Cantidad: 5.000 kg')
    expect(purchase?.details).toContain('Costo: 389.00 MXN / kg')
    expect(purchase?.details).toContain('Total: 1945.00 MXN')
    expect(purchase?.details).not.toContain('1945000')
  })

  it('humanizes merma rows with kg remaining', () => {
    const entries = buildSystemLogbookEntries(rows, { category: 'inventory' })
    const waste = entries.find(entry => entry.id === 'w1')
    expect(waste?.actionLabel).toBe('Merma por caducidad')
    expect(waste?.details).toContain('Merma: -0.002 kg')
    expect(waste?.details).toContain('Restante del lote: 4.998 kg')
    expect(waste?.details).toContain('Motivo: Merma por caducidad')
  })

  it('keeps piece purchases in pz', () => {
    const entries = buildSystemLogbookEntries(rows, { category: 'inventory' })
    const purchase = entries.find(entry => entry.id === 'p2')
    expect(purchase?.details).toContain('Cantidad: 40 pz')
    expect(purchase?.details).toContain('Costo: 12.50 MXN / pz')
    expect(purchase?.details).toContain('Total: 500.00 MXN')
  })

  it('resolves weight support from inventoryItemId map for legacy metadata', () => {
    const legacy: SystemActionLogRow[] = [
      {
        id: 'legacy',
        action: 'inventory.lot.waste',
        status: 'success',
        actorUsername: 'admin',
        actorRole: 'admin',
        entityType: 'InventoryLot',
        entityId: 'lot-legacy',
        metadata: {
          inventoryItemId: 'item-fish',
          quantity: 2000,
          remaining: 3000,
          reason: 'Merma por caducidad'
        },
        createdAt: new Date('2026-08-11T14:00:00.000Z')
      }
    ]
    const entries = buildSystemLogbookEntries(legacy, {
      category: 'all',
      weightSupportByItemId: new Map([['item-fish', true]])
    })
    expect(entries[0]?.details).toContain(formatStockQuantityLabel(2000, true))
    expect(entries[0]?.details).toContain(formatStockQuantityLabel(3000, true))
  })
})
