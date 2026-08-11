import { describe, expect, it, vi } from 'vitest'

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn()
}))

vi.mock('@/src/lib/config/env', () => ({
  getPublicSupabaseEnv: () => ({
    url: 'https://example.supabase.co',
    publishableKey: 'pub-key'
  })
}))

vi.mock('@/src/lib/db/prisma', () => ({
  getPrisma: vi.fn()
}))

import { createClient } from '@supabase/supabase-js'
import { getPrisma } from '@/src/lib/db/prisma'
import { verifyAdminPassword } from '@/src/lib/pos/admin-override'

describe('verifyAdminPassword', () => {
  it('accepts active admin credentials', async () => {
    const signInWithPassword = vi.fn().mockResolvedValue({
      data: { user: { id: 'auth-admin-1' } },
      error: null
    })
    const signOut = vi.fn().mockResolvedValue({})
    vi.mocked(createClient).mockReturnValue({
      auth: { signInWithPassword, signOut }
    } as never)
    vi.mocked(getPrisma).mockResolvedValue({
      userProfile: {
        findUnique: vi.fn().mockResolvedValue({
          role: 'admin',
          isActive: true,
          username: 'admin'
        })
      }
    } as never)

    const result = await verifyAdminPassword({
      username: 'admin',
      password: 'secure-password',
      reason: 'Remover producto del carrito POS'
    })

    expect(result.adminUsername).toBe('admin')
    expect(signOut).toHaveBeenCalled()
  })

  it('rejects non-admin credentials', async () => {
    const signInWithPassword = vi.fn().mockResolvedValue({
      data: { user: { id: 'auth-cashier-1' } },
      error: null
    })
    const signOut = vi.fn().mockResolvedValue({})
    vi.mocked(createClient).mockReturnValue({
      auth: { signInWithPassword, signOut }
    } as never)
    vi.mocked(getPrisma).mockResolvedValue({
      userProfile: {
        findUnique: vi.fn().mockResolvedValue({
          role: 'cashier',
          isActive: true,
          username: 'cajero'
        })
      }
    } as never)

    await expect(
      verifyAdminPassword({
        username: 'cajero',
        password: 'secure-password'
      })
    ).rejects.toThrow('ADMIN_CREDENTIALS_INVALID')
  })
})
