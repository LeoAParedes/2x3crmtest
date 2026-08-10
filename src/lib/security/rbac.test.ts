import { describe, expect, it } from 'vitest'

import { isAllowed, parseCrmRole } from '@/src/lib/security/rbac'

describe('ERP role permissions', () => {
  it('allows admin to perform every declared operation', () => {
    expect(isAllowed('admin', 'admin:view')).toBe(true)
    expect(isAllowed('admin', 'pos:create')).toBe(true)
    expect(isAllowed('admin', 'finance:view')).toBe(true)
  })

  it('limits cashier to POS and inventory reads', () => {
    expect(isAllowed('cashier', 'pos:create')).toBe(true)
    expect(isAllowed('cashier', 'pos:view-own')).toBe(true)
    expect(isAllowed('cashier', 'inventory:view')).toBe(true)
    expect(isAllowed('cashier', 'admin:view')).toBe(false)
    expect(isAllowed('cashier', 'finance:view')).toBe(false)
    expect(isAllowed('cashier', 'mastra:update')).toBe(false)
    expect(isAllowed('cashier', 'audit:view-all')).toBe(false)
  })

  it('rejects legacy and unknown roles', () => {
    expect(parseCrmRole('supervisor')).toBeNull()
    expect(parseCrmRole('warehouse')).toBeNull()
  })
})
