import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { getPublicSupabaseEnv } from '@/src/lib/config/env'
import { getPrisma } from '@/src/lib/db/prisma'
import { parseCrmRole } from '@/src/lib/security/rbac'
import { parseLoginUsername, usernameToInternalEmail } from '@/src/lib/security/username'

const adminAuthorizeSchema = z.object({
  username: z.unknown().transform(value => {
    if (typeof value === 'string' && value.trim()) return parseLoginUsername(value)
    return 'admin'
  }),
  password: z.string().min(8).max(128),
  reason: z.string().min(3).max(240).default('Remover producto del carrito POS')
})

export type AdminAuthorizeInput = z.infer<typeof adminAuthorizeSchema>

/** Verifies admin credentials without touching the active browser session cookies. */
export const verifyAdminPassword = async (rawInput: unknown) => {
  const input = adminAuthorizeSchema.parse(rawInput)
  const { url, publishableKey } = getPublicSupabaseEnv()
  const supabase = createClient(url, publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  })

  const email = usernameToInternalEmail(input.username)
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: input.password
  })

  if (error || !data.user) {
    throw new Error('ADMIN_CREDENTIALS_INVALID')
  }

  const prisma = await getPrisma()
  const profile = await prisma.userProfile.findUnique({
    where: { authUserId: data.user.id },
    select: { role: true, isActive: true, username: true }
  })

  await supabase.auth.signOut().catch(() => {})

  const role = parseCrmRole(profile?.role)
  if (!profile?.isActive || role !== 'admin') {
    throw new Error('ADMIN_CREDENTIALS_INVALID')
  }

  return {
    adminUsername: profile.username,
    reason: input.reason
  }
}
