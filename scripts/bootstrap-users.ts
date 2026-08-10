import 'dotenv/config'
import { pathToFileURL } from 'node:url'

import { createClient } from '@supabase/supabase-js'

import { getServerEnv } from '@/src/lib/config/env'
import { getPrisma } from '@/src/lib/db/prisma'
import { usernameToInternalEmail } from '@/src/lib/security/username'

type BootstrapRole = 'admin' | 'cashier'

type ExistingUser = {
  id: string
  email?: string
}

type BootstrapDependencies = {
  adminPassword: string
  cashierPassword: string
  listUsers: () => Promise<ExistingUser[]>
  createUser: (input: {
    email: string
    password: string
    appMetadata: { user_role: BootstrapRole }
  }) => Promise<{ id: string }>
  updateUser: (id: string, input: { password: string; appMetadata: { user_role: BootstrapRole } }) => Promise<void>
  upsertProfile: (input: {
    authUserId: string
    username: 'admin' | 'cajero'
    role: BootstrapRole
  }) => Promise<void>
  log: (message: string) => void
}

export const bootstrapInitialUsers = async (dependencies: BootstrapDependencies) => {
  const { adminPassword, cashierPassword } = dependencies
  if (!adminPassword.trim() || !cashierPassword.trim()) {
    throw new Error('Bootstrap passwords are required')
  }

  const existingUsers = await dependencies.listUsers()
  const definitions = [
    { username: 'admin' as const, role: 'admin' as const, password: adminPassword },
    { username: 'cajero' as const, role: 'cashier' as const, password: cashierPassword }
  ]

  for (const definition of definitions) {
    const email = usernameToInternalEmail(definition.username)
    const existing = existingUsers.find(user => user.email?.toLowerCase() === email)
    let authUserId: string

    if (existing) {
      await dependencies.updateUser(existing.id, {
        password: definition.password,
        appMetadata: { user_role: definition.role }
      })
      authUserId = existing.id
    } else {
      const created = await dependencies.createUser({
        email,
        password: definition.password,
        appMetadata: { user_role: definition.role }
      })
      authUserId = created.id
    }

    await dependencies.upsertProfile({
      authUserId,
      username: definition.username,
      role: definition.role
    })
    dependencies.log(`Bootstrap completed for ${definition.username} (${definition.role})`)
  }
}

const run = async () => {
  const env = getServerEnv()
  const adminPassword = env.bootstrapAdminPassword
  const cashierPassword = env.bootstrapCashierPassword
  if (!adminPassword || !cashierPassword) {
    throw new Error('BOOTSTRAP_ADMIN_PASSWORD and BOOTSTRAP_CASHIER_PASSWORD are required')
  }

  const supabase = createClient(env.url, env.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
  const prisma = await getPrisma()

  await bootstrapInitialUsers({
    adminPassword,
    cashierPassword,
    listUsers: async () => {
      const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
      if (error) throw error
      return data.users
    },
    createUser: async ({ email, password, appMetadata }) => {
      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        app_metadata: appMetadata
      })
      if (error || !data.user) throw error || new Error('Supabase did not return a user')
      return { id: data.user.id }
    },
    updateUser: async (id, { password, appMetadata }) => {
      const { error } = await supabase.auth.admin.updateUserById(id, {
        password,
        email_confirm: true,
        app_metadata: appMetadata
      })
      if (error) throw error
    },
    upsertProfile: async input => {
      await prisma.userProfile.upsert({
        where: { authUserId: input.authUserId },
        update: {
          username: input.username,
          role: input.role,
          isActive: true
        },
        create: {
          authUserId: input.authUserId,
          username: input.username,
          role: input.role
        }
      })
    },
    log: message => console.info(message)
  })
}

const isDirectExecution = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isDirectExecution) {
  run().catch(error => {
    console.error(error instanceof Error ? error.message : 'Bootstrap failed')
    process.exitCode = 1
  })
}
