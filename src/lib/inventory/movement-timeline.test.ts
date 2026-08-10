import { describe, expect, it } from 'vitest'

import {
  buildMovementTimeline,
  getAvailableMovementOperationTypes,
  type SystemActionLogMovementRow
} from '@/src/lib/inventory/movement-timeline'

const baseRows: SystemActionLogMovementRow[] = [
  {
    id: 'log-sale-2',
    action: 'sale.create',
    status: 'success',
    actorUsername: 'cajero',
    actorRole: 'cashier',
    metadata: {
      saleNumber: 'SALE-002',
      paymentMethod: 'cash',
      itemCount: 2
    },
    createdAt: new Date('2026-08-10T18:00:00.000Z')
  },
  {
    id: 'log-import-1',
    action: 'inventory.import.csv',
    status: 'success',
    actorUsername: 'admin',
    actorRole: 'admin',
    metadata: {
      created: 10,
      updated: 4,
      failed: 1
    },
    createdAt: new Date('2026-08-10T17:30:00.000Z')
  },
  {
    id: 'log-sale-1',
    action: 'sale.create',
    status: 'success',
    actorUsername: 'cajero',
    actorRole: 'cashier',
    metadata: {
      saleNumber: 'SALE-001',
      paymentMethod: 'card',
      itemCount: 1
    },
    createdAt: new Date('2026-08-10T16:30:00.000Z')
  },
  {
    id: 'log-ignored',
    action: 'pos.draft.saved',
    status: 'success',
    actorUsername: 'cajero',
    actorRole: 'cashier',
    metadata: {},
    createdAt: new Date('2026-08-10T19:00:00.000Z')
  }
]

describe('movement-timeline', () => {
  it('excludes unsupported operations and sorts chronologically desc', () => {
    const timeline = buildMovementTimeline(baseRows, { operationType: 'all' })

    expect(timeline.map(item => item.id)).toEqual(['log-sale-2', 'log-import-1', 'log-sale-1'])
    expect(timeline.map(item => item.category)).toEqual(['sales', 'inventory', 'sales'])
  })

  it('filters by operation type', () => {
    const timeline = buildMovementTimeline(baseRows, { operationType: 'inventory.import.csv' })

    expect(timeline).toHaveLength(1)
    expect(timeline[0]?.operationType).toBe('inventory.import.csv')
    expect(timeline[0]?.category).toBe('inventory')
  })

  it('returns supported operation types catalog', () => {
    expect(getAvailableMovementOperationTypes()).toEqual(['sale.create', 'inventory.import.csv'])
  })
})
