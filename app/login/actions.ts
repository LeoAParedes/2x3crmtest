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

const loginDebugLog = (runId: string, hypothesisId: string, message: string, data: Record<string, unknown>) => {
  // #region agent log
  fetch('http://127.0.0.1:7470/ingest/f7f242f1-ff2d-40d4-bf0c-d535d5a2bbdb', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '449600' },
    body: JSON.stringify({
      sessionId: '449600',
      runId,
      hypothesisId,
      location: 'app/login/actions.ts',
      message,
      data,
      timestamp: Date.now()
    })
  }).catch(() => {})
  // #endregion
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
  const runId = `login-${Date.now()}`
  const rawUsername = formData.get('username')
  loginDebugLog(runId, 'H0', 'login action start', {
    hasUsername: typeof rawUsername === 'string' && rawUsername.length > 0,
    hasPassword: typeof formData.get('password') === 'string'
  })

  try {
    const supabase = await createServerSupabaseClient()
    loginDebugLog(runId, 'H1', 'supabase client created', {
      hasSupabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
      hasSupabasePublishableKey: Boolean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
    })

    const prisma = await getPrisma()
    loginDebugLog(runId, 'H2', 'prisma client created', {
      hasDatabaseUrl: Boolean(process.env.DATABASE_URL)
    })

    const result = await authenticateCredentials(
      {
        username: rawUsername,
        password: formData.get('password')
      },
      {
        signIn: async ({ email, password }) => {
          const { data, error } = await supabase.auth.signInWithPassword({ email, password })
          loginDebugLog(runId, 'H3', 'supabase signInWithPassword resolved', {
            hasError: Boolean(error),
            hasUserId: Boolean(data.user?.id)
          })
          return { userId: error ? null : data.user?.id || null }
        },
        findProfile: async userId => {
          const profile = await prisma.userProfile.findUnique({
            where: { authUserId: userId },
            select: { role: true, isActive: true }
          })
          loginDebugLog(runId, 'H4', 'profile lookup resolved', {
            foundProfile: Boolean(profile),
            isActive: profile?.isActive ?? null,
            role: typeof profile?.role === 'string' ? profile.role : null
          })
          return profile
        }
      }
    )

    if ('error' in result) {
      // #region agent log
      console.warn('[H5] login denied with controlled error', {
        runId,
        errorMessage: result.error
      })
      // #endregion
      loginDebugLog(runId, 'H5', 'login denied with controlled error', {
        errorMessage: result.error
      })
      await supabase.auth.signOut()
      return result
    }

    // #region agent log
    console.info('[H5] login about to redirect', {
      runId,
      destination: result.destination
    })
    // #endregion
    loginDebugLog(runId, 'H5', 'login redirecting to destination', {
      destination: result.destination
    })
    redirect(result.destination)
  } catch (error) {
    // #region agent log
    console.error('[HX] login action threw unhandled error', {
      runId,
      name: error instanceof Error ? error.name : 'unknown',
      message: error instanceof Error ? error.message : 'unknown',
      digest:
        typeof error === 'object' && error && 'digest' in error && typeof error.digest === 'string' ? error.digest : null
    })
    // #endregion
    loginDebugLog(runId, 'HX', 'login action threw unhandled error', {
      name: error instanceof Error ? error.name : 'unknown',
      message: error instanceof Error ? error.message : 'unknown',
      hasStack: error instanceof Error ? Boolean(error.stack) : false
    })
    return { error: 'Error interno al iniciar sesión. Revisa configuración de Supabase y base de datos.' }
  }
}
