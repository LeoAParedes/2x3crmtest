import { describe, expect, it, vi } from 'vitest'

import { bootstrapInitialUsers } from '@/scripts/bootstrap-users'

describe('bootstrapInitialUsers', () => {
  it('rejects missing passwords before calling providers', async () => {
    const listUsers = vi.fn()

    await expect(
      bootstrapInitialUsers({
        adminPassword: '',
        cashierPassword: '',
        listUsers,
        createUser: vi.fn(),
        updateUser: vi.fn(),
        upsertProfile: vi.fn(),
        log: vi.fn()
      })
    ).rejects.toThrow('Bootstrap passwords are required')
    expect(listUsers).not.toHaveBeenCalled()
  })

  it('creates identities and profiles without logging passwords', async () => {
    const log = vi.fn()
    const createUser = vi
      .fn()
      .mockResolvedValueOnce({ id: '11111111-1111-1111-1111-111111111111' })
      .mockResolvedValueOnce({ id: '22222222-2222-2222-2222-222222222222' })
    const upsertProfile = vi.fn()

    await bootstrapInitialUsers({
      adminPassword: 'secret-admin',
      cashierPassword: 'secret-cashier',
      listUsers: vi.fn().mockResolvedValue([]),
      createUser,
      updateUser: vi.fn(),
      upsertProfile,
      log
    })

    expect(upsertProfile).toHaveBeenCalledWith(
      expect.objectContaining({ username: 'admin', role: 'admin' })
    )
    expect(upsertProfile).toHaveBeenCalledWith(
      expect.objectContaining({ username: 'cajero', role: 'cashier' })
    )
    expect(createUser).toHaveBeenNthCalledWith(1, {
      email: 'admin@2x3crmtest.local',
      password: 'secret-admin',
      appMetadata: { user_role: 'admin' }
    })
    expect(createUser).toHaveBeenNthCalledWith(2, {
      email: 'cajero@2x3crmtest.local',
      password: 'secret-cashier',
      appMetadata: { user_role: 'cashier' }
    })
    expect(JSON.stringify(log.mock.calls)).not.toContain('secret-')
  })
})
