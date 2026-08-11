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

    expect(result).toEqual({ destination: '/caja' })
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

  it('propagates unexpected errors from findProfile so loginAction catch can sign the user out', async () => {
    // signIn succeeds (session cookie would be set), then profile lookup throws.
    // authenticateCredentials must NOT swallow the error — it should propagate so
    // loginAction's catch block can call supabase.auth.signOut() and clear the session.
    await expect(
      authenticateCredentials(
        { username: 'admin', password: 'secure-password' },
        {
          signIn: vi.fn().mockResolvedValue({ userId: 'user-1' }),
          findProfile: vi.fn().mockRejectedValue(new Error('DB connection failed'))
        }
      )
    ).rejects.toThrow('DB connection failed')
  })
})
