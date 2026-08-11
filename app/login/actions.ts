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
  redirecting?: boolean
}

type AuthenticationDependencies = {
  signIn: (input: { email: string; password: string }) => Promise<{ userId: string | null }>
  findProfile: (userId: string) => Promise<{ role: unknown; isActive: boolean } | null>
}

export const authenticateCredentials = async (
  input: unknown,
  dependencies: AuthenticationDependencies
): Promise<{ error: string } | { destination: '/admin' | '/pos' | '/caja' }> => {
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

  return { destination: role === 'admin' ? '/admin' : '/caja' }
}

export const loginAction = async (_previousState: LoginState, formData: FormData): Promise<LoginState> => {
  const rawUsername = formData.get('username')

  // destination is set outside try so redirect() is called outside the catch block.
  // redirect() throws NEXT_REDIRECT internally; if called inside catch it would be
  // swallowed and the user would see a spurious error even after a successful sign-in.
  let destination: '/admin' | '/pos' | '/caja' | null = null

  try {
    const supabase = await createServerSupabaseClient()
    const prisma = await getPrisma()

    const result = await authenticateCredentials(
      {
        username: rawUsername,
        password: formData.get('password')
      },
      {
        signIn: async ({ email, password }) => {
          const { data, error } = await supabase.auth.signInWithPassword({ email, password })
          return { userId: error ? null : (data.user?.id ?? null) }
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
      return { error: result.error }
    }

    destination = result.destination
  } catch (error) {
    console.error('[loginAction] unhandled error', {
      name: error instanceof Error ? error.name : 'unknown',
      message: error instanceof Error ? error.message : 'unknown'
    })
    return { error: 'Error interno al iniciar sesión. Revisa la configuración del servidor.' }
  }

  // Called outside try/catch so the NEXT_REDIRECT signal propagates correctly to Next.js.
  redirect(destination)
}
