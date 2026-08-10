'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'

import { getPrisma } from '@/src/lib/db/prisma'
import { parseCrmRole } from '@/src/lib/security/rbac'
import { parseLoginUsername, usernameToInternalEmail } from '@/src/lib/security/username'
import { createServerSupabaseClient } from '@/src/lib/supabase/server'

const loginSchema = z.object({
  username: z.unknown().transform(parseLoginUsername),
  password: z.string().min(8).max(128)
})

export type LoginState = {
  error?: string
}

type AuthenticationDependencies = {
  signIn: (input: { email: string; password: string }) => Promise<{ userId: string | null }>
  findProfile: (userId: string) => Promise<{ role: unknown; isActive: boolean } | null>
}

export const authenticateCredentials = async (
  input: unknown,
  dependencies: AuthenticationDependencies
): Promise<{ error: string } | { destination: '/admin' | '/pos' }> => {
  const parsed = loginSchema.safeParse(input)
  if (!parsed.success) {
    return { error: 'Usuario o contraseña incorrectos' }
  }

  const session = await dependencies.signIn({
    email: usernameToInternalEmail(parsed.data.username),
    password: parsed.data.password
  })
  if (!session.userId) {
    return { error: 'Usuario o contraseña incorrectos' }
  }

  const profile = await dependencies.findProfile(session.userId)
  const role = parseCrmRole(typeof profile?.role === 'string' ? profile.role : undefined)
  if (!profile?.isActive || !role) {
    return { error: 'Usuario o contraseña incorrectos' }
  }

  return { destination: role === 'admin' ? '/admin' : '/pos' }
}

export const loginAction = async (_previousState: LoginState, formData: FormData): Promise<LoginState> => {
  const supabase = await createServerSupabaseClient()
  const prisma = await getPrisma()
  const result = await authenticateCredentials(
    {
      username: formData.get('username'),
      password: formData.get('password')
    },
    {
      signIn: async ({ email, password }) => {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password })
        return { userId: error ? null : data.user?.id || null }
      },
      findProfile: async userId => {
        const profile = await prisma.userProfile.findUnique({
          where: { authUserId: userId },
          select: { role: true, isActive: true }
        })
        return profile
      }
    }
  )

  if ('error' in result) {
    await supabase.auth.signOut()
    return result
  }

  redirect(result.destination)
}
