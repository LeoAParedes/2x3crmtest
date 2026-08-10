import { describe, expect, it, vi } from 'vitest'

import { authenticateCredentials } from '@/app/login/actions'

describe('authenticateCredentials', () => {
  it('returns a generic error for invalid credentials', async () => {
    const result = await authenticateCredentials(
      { username: 'admin', password: 'wrong-password' },
      {
        signIn: vi.fn().mockResolvedValue({ userId: null }),
        findProfile: vi.fn()
      }
    )

    expect(result).toEqual({ error: 'Usuario o contraseña incorrectos' })
  })

  it('returns the role destination for an active profile', async () => {
    const result = await authenticateCredentials(
      { username: 'cajero', password: 'secure-password' },
      {
        signIn: vi.fn().mockResolvedValue({ userId: 'user-1' }),
        findProfile: vi.fn().mockResolvedValue({ role: 'cashier', isActive: true })
      }
    )

    expect(result).toEqual({ destination: '/pos' })
  })

  it('rejects a persisted legacy role after valid credentials', async () => {
    const result = await authenticateCredentials(
      { username: 'admin', password: 'secure-password' },
      {
        signIn: vi.fn().mockResolvedValue({ userId: 'user-1' }),
        findProfile: vi.fn().mockResolvedValue({ role: 'supervisor', isActive: true })
      }
    )

    expect(result).toEqual({ error: 'Usuario o contraseña incorrectos' })
  })
})
