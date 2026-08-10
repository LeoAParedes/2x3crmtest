import { describe, expect, it } from 'vitest'

import { authorizeProfile } from '@/src/lib/security/api-auth'

const cashierProfile = {
  id: 'profile-1',
  authUserId: '11111111-1111-1111-1111-111111111111',
  username: 'cajero',
  role: 'cashier' as const,
  isActive: true
}

describe('authorizeProfile', () => {
  it('returns the persisted actor when allowed', () => {
    expect(authorizeProfile(cashierProfile, { requiredPermission: 'pos:create' })).toEqual({
      userId: cashierProfile.authUserId,
      profileId: cashierProfile.id,
      username: 'cajero',
      role: 'cashier'
    })
  })

  it('rejects inactive profiles', () => {
    expect(() => authorizeProfile({ ...cashierProfile, isActive: false })).toThrow('USER_INACTIVE')
  })

  it('rejects missing permissions', () => {
    expect(() => authorizeProfile(cashierProfile, { requiredPermission: 'admin:view' })).toThrow(
      'RBAC_PERMISSION_FORBIDDEN'
    )
  })

  it('rejects legacy roles instead of treating them as authenticated actors', () => {
    expect(() => authorizeProfile({ ...cashierProfile, role: 'warehouse' as never })).toThrow(
      'RBAC_ROLE_FORBIDDEN'
    )
  })
})
