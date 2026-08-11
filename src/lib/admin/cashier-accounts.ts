import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { getServerEnv } from '@/src/lib/config/env'
import { getPrisma } from '@/src/lib/db/prisma'
import { parseLoginUsername, usernameToInternalEmail } from '@/src/lib/security/username'
import type { AuthenticatedActor } from '@/src/lib/security/api-auth'

export const createCashierSchema = z
  .object({
    username: z.unknown().transform(parseLoginUsername),
    password: z.string().min(8).max(128)
  })
  .strict()

export const createCashierAccount = async (rawInput: unknown, actor: AuthenticatedActor) => {
  const input = createCashierSchema.parse(rawInput)
  if (input.username === 'admin') {
    throw new Error('USERNAME_RESERVED')
  }

  const prisma = await getPrisma()
  const existingProfile = await prisma.userProfile.findUnique({ where: { username: input.username } })
  if (existingProfile) {
    throw new Error('USERNAME_TAKEN')
  }

  const env = getServerEnv()
  const supabase = createClient(env.url, env.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })

  const email = usernameToInternalEmail(input.username)
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
    app_metadata: { user_role: 'cashier' }
  })
  if (error || !data.user) {
    throw new Error(error?.message || 'AUTH_USER_CREATE_FAILED')
  }

  const profile = await prisma.userProfile.create({
    data: {
      authUserId: data.user.id,
      username: input.username,
      role: 'cashier',
      isActive: true,
      cashierGate: 'ready'
    }
  })

  await prisma.systemActionLog.create({
    data: {
      actorAuthUserId: actor.userId,
      actorUsername: actor.username,
      actorRole: actor.role,
      action: 'admin.cashier.create',
      entityType: 'UserProfile',
      entityId: profile.id,
      status: 'success',
      metadata: { username: profile.username }
    }
  })

  return {
    id: profile.id,
    username: profile.username,
    role: profile.role,
    isActive: profile.isActive
  }
}

export const listCashierAccounts = async () => {
  const prisma = await getPrisma()
  const profiles = await prisma.userProfile.findMany({
    where: { role: 'cashier' },
    orderBy: { username: 'asc' },
    select: {
      id: true,
      username: true,
      role: true,
      isActive: true,
      cashierGate: true,
      createdAt: true
    }
  })
  return profiles.map(profile => ({
    ...profile,
    createdAt: profile.createdAt.toISOString()
  }))
}
