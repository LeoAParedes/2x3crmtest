import { describe, expect, it } from 'vitest'

import { shouldBlockCashierOpenForExclusiveSession } from '@/src/lib/caja/cash-session-service'

describe('exclusive cashier session', () => {
  it('blocks a cashier when another cashier session is open', () => {
    expect(shouldBlockCashierOpenForExclusiveSession('cashier', 'cajero')).toBe(true)
  })

  it('allows a cashier when no cashier session is open', () => {
    expect(shouldBlockCashierOpenForExclusiveSession('cashier', null)).toBe(false)
  })

  it('never blocks an admin even if a cashier session is open', () => {
    expect(shouldBlockCashierOpenForExclusiveSession('admin', 'cajero')).toBe(false)
  })
})
