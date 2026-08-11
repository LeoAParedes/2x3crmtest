import { describe, expect, it } from 'vitest'

import { BITACORA_HIDDEN_ACTIONS, dedupeLogbookRows } from '@/src/lib/inventory/logbook-cleanup'

describe('logbook cleanup', () => {
  it('hides draft and weight-normalization noise', () => {
    expect(BITACORA_HIDDEN_ACTIONS.has('pos.draft.saved')).toBe(true)
  })

  it('keeps a single row per action/entity burst', () => {
    const now = new Date('2026-08-11T12:00:00.000Z')
    const rows = [
      { action: 'sale.create', entityId: 'sale-1', status: 'success', createdAt: now },
      { action: 'sale.create', entityId: 'sale-1', status: 'success', createdAt: new Date(now.getTime() + 500) },
      { action: 'sale.create', entityId: 'sale-1', status: 'success', createdAt: new Date(now.getTime() + 900) },
      { action: 'sale.create', entityId: 'sale-2', status: 'success', createdAt: now },
      { action: 'pos.draft.saved', entityId: 'u1', status: 'success', createdAt: now }
    ]
    const deduped = dedupeLogbookRows(rows)
    expect(deduped).toHaveLength(2)
    expect(deduped.map(row => row.entityId)).toEqual(['sale-1', 'sale-2'])
  })
})
