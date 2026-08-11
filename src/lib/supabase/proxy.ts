import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

import { getPublicSupabaseEnv } from '@/src/lib/config/env'
import { parseCrmRole } from '@/src/lib/security/rbac'

const protectedPaths = [
  '/admin',
  '/pos',
  '/inventario',
  '/caja',
  '/finanzas',
  '/bitacora',
  '/operaciones',
  '/configuracion'
]

export const getAuthenticatedHomePath = (roleClaim: unknown): '/admin' | '/pos' | null => {
  const role = parseCrmRole(typeof roleClaim === 'string' ? roleClaim : undefined)
  if (role === 'admin') {
    return '/admin'
  }
  if (role === 'cashier') {
    return '/pos'
  }
  return null
}

export const updateSession = async (request: NextRequest) => {
  let response = NextResponse.next({ request })
  const { url, publishableKey } = getPublicSupabaseEnv()
  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: cookiesToSet => {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value)
        }
        response = NextResponse.next({ request })
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options)
        }
      }
    }
  })

  const {
    data: { user }
  } = await supabase.auth.getUser()
  const path = request.nextUrl.pathname
  const requiresAuthentication = protectedPaths.some(prefix => path === prefix || path.startsWith(`${prefix}/`))

  if (!user && requiresAuthentication) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.searchParams.set('next', path)
    return NextResponse.redirect(loginUrl)
  }

  if (user && path === '/login') {
    const homePath = getAuthenticatedHomePath(user.app_metadata.user_role)
    if (homePath) {
      const homeUrl = request.nextUrl.clone()
      homeUrl.pathname = homePath
      homeUrl.search = ''
      return NextResponse.redirect(homeUrl)
    }
  }

  return response
}
