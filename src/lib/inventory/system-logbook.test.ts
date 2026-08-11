import { describe, expect, it } from 'vitest'

import {
  formatSaleQuantitySummary,
  formatStockQuantityLabel,
  summarizeSaleQuantities
} from '@/src/lib/inventory/logbook-quantity'
import { buildSystemLogbookEntries, type SystemActionLogRow } from '@/src/lib/inventory/system-logbook'

const rows: SystemActionLogRow[] = [
  {
    id: '1',
    action: 'inventory.import.csv',
    status: 'success',
    actorUsername: 'admin',
    actorRole: 'admin',
    entityType: 'InventoryImport',
    entityId: 'import-1',
    metadata: {
      created: 20,
      updated: 3,
      failed: 1,
      errors: [{ line: 42, reason: 'Stock inválido' }]
    },
    createdAt: new Date('2026-08-10T20:01:00.000Z')
  },
  {
    id: '2',
    action: 'sale.create',
    status: 'success',
    actorUsername: 'cajero',
    actorRole: 'cashier',
    entityType: 'Sale',
    entityId: 'sale-2',
    metadata: {
      saleId: 'sale-2',
      saleNumber: 'SALE-1',
      paymentMethod: 'cash',
      itemCount: 2,
      pieceCount: 3,
      weightGrams: 2500
    },
    createdAt: new Date('2026-08-10T20:02:00.000Z')
  },
  {
    id: '3',
    action: 'pos.draft.saved',
    status: 'success',
    actorUsername: 'cajero',
    actorRole: 'cashier',
    entityType: 'PosDraft',
    entityId: 'draft-1',
    metadata: {},
    createdAt: new Date('2026-08-10T20:03:00.000Z')
  },
  {
    id: '4',
    action: 'inventory.movement.entry',
    status: 'success',
    actorUsername: 'admin',
    actorRole: 'admin',
    entityType: 'InventoryItem',
    entityId: 'item-weight',
    metadata: {
      quantity: 2500,
      unitCost: 40,
      nextUnitPrice: 42,
      reason: 'Compra',
      supportsWeight: true
    },
    createdAt: new Date('2026-08-10T20:04:00.000Z')
  }
]

describe('logbook quantity helpers', () => {
  it('summarizes piece and weight quantities separately', () => {
    expect(
      summarizeSaleQuantities([
        { quantity: 2, unitMode: 'piece' },
        { quantity: 750, unitMode: 'weight' },
        { quantity: 1, unitMode: 'piece' }
      ])
    ).toEqual({ pieceCount: 3, weightGrams: 750 })
  })

  it('formats stock and sale quantity labels with kg/pz units', () => {
    expect(formatStockQuantityLabel(2500, true)).toBe('2.500 kg')
    expect(formatStockQuantityLabel(4, false)).toBe('4 pz')
    expect(formatSaleQuantitySummary(3, 2500)).toBe('3 pz | 2.500 kg')
  })
})

describe('system-logbook', () => {
  it('builds entries sorted by newest first', () => {
    const entries = buildSystemLogbookEntries(rows, { category: 'all' })
    expect(entries.map(item => item.id)).toEqual(['4', '3', '2', '1'])
  })

  it('categorizes operations and keeps line-level import error details', () => {
    const entries = buildSystemLogbookEntries(rows, { category: 'inventory' })
    expect(entries).toHaveLength(2)
    expect(entries[1]?.category).toBe('inventory')
    expect(entries[1]?.details).toContain('Línea 42: Stock inválido')
  })

  it('filters by selected category', () => {
    const entries = buildSystemLogbookEntries(rows, { category: 'pos' })
    expect(entries).toHaveLength(1)
    expect(entries[0]?.action).toBe('pos.draft.saved')
  })

  it('shows sale piece and kilogram totals instead of line-item count', () => {
    const entries = buildSystemLogbookEntries(rows, { category: 'sales' })
    expect(entries).toHaveLength(1)
    expect(entries[0]?.details).toContain('3 pz')
    expect(entries[0]?.details).toContain('2.500 kg')
    expect(entries[0]?.details).not.toContain('Ítems:')
    expect(entries[0]?.canViewTicket).toBe(true)
    expect(entries[0]?.saleId).toBe('sale-2')
  })

  it('formats weight stock entries as kilograms', () => {
    const entries = buildSystemLogbookEntries(rows, { category: 'inventory' })
    const entry = entries.find(item => item.id === '4')
    expect(entry?.details).toContain('Entrada: +2.500 kg')
  })
})
