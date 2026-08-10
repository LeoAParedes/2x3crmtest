import { describe, expect, it } from 'vitest'

import { buildSystemLogbookEntries, type SystemActionLogRow } from '@/src/lib/inventory/system-logbook'

const rows: SystemActionLogRow[] = [
  {
    id: '1',
    action: 'inventory.import.csv',
    status: 'success',
    actorUsername: 'admin',
    actorRole: 'admin',
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
    metadata: { saleNumber: 'SALE-1', paymentMethod: 'cash', itemCount: 2 },
    createdAt: new Date('2026-08-10T20:02:00.000Z')
  },
  {
    id: '3',
    action: 'pos.draft.saved',
    status: 'success',
    actorUsername: 'cajero',
    actorRole: 'cashier',
    metadata: {},
    createdAt: new Date('2026-08-10T20:03:00.000Z')
  }
]

describe('system-logbook', () => {
  it('builds entries sorted by newest first', () => {
    const entries = buildSystemLogbookEntries(rows, { category: 'all' })
    expect(entries.map(item => item.id)).toEqual(['3', '2', '1'])
  })

  it('categorizes operations and keeps line-level import error details', () => {
    const entries = buildSystemLogbookEntries(rows, { category: 'inventory' })
    expect(entries).toHaveLength(1)
    expect(entries[0]?.category).toBe('inventory')
    expect(entries[0]?.details).toContain('Línea 42: Stock inválido')
  })

  it('filters by selected category', () => {
    const entries = buildSystemLogbookEntries(rows, { category: 'pos' })
    expect(entries).toHaveLength(1)
    expect(entries[0]?.action).toBe('pos.draft.saved')
  })
})
