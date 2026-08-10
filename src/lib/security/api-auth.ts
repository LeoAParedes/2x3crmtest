import type { UserRole } from '@prisma/client'

import { getPrisma } from '@/src/lib/db/prisma'
import { jsonError } from '@/src/lib/http/json-response'
import { getClientIp, getRequestId } from '@/src/lib/security/request-context'
import { isAllowed, parseCrmRole, type CrmRole } from '@/src/lib/security/rbac'
import { createServerSupabaseClient } from '@/src/lib/supabase/server'

type ApiAccessOptions = {
  requiredPermission?: string
  allowedRoles?: CrmRole[]
}

export type AuthenticatedActor = {
  userId: string
  profileId: string
  username: string
  role: CrmRole
}

export type ApiAccessContext = {
  actor: AuthenticatedActor
  role: CrmRole
  requestId: string
  clientIp: string
}

export type ApiAccessResult = { ok: true; context: ApiAccessContext } | { ok: false; response: Response }

type PersistedProfile = {
  id: string
  authUserId: string
  username: string
  role: UserRole | CrmRole
  isActive: boolean
}

export const authorizeProfile = (
  profile: PersistedProfile,
  options: ApiAccessOptions = {}
): AuthenticatedActor => {
  const role = parseCrmRole(profile.role)
  if (!role) {
    throw new Error('RBAC_ROLE_FORBIDDEN')
  }
  if (!profile.isActive) {
    throw new Error('USER_INACTIVE')
  }
  if (options.allowedRoles && !options.allowedRoles.includes(role)) {
    throw new Error('RBAC_ROLE_FORBIDDEN')
  }
  if (options.requiredPermission && !isAllowed(role, options.requiredPermission)) {
    throw new Error('RBAC_PERMISSION_FORBIDDEN')
  }
  return {
    userId: profile.authUserId,
    profileId: profile.id,
    username: profile.username,
    role
  }
}

export const getAuthenticatedActor = async (
  options: ApiAccessOptions = {}
): Promise<AuthenticatedActor | null> => {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
    error
  } = await supabase.auth.getUser()
  if (error || !user) {
    return null
  }

  const prisma = await getPrisma()
  const profile = await prisma.userProfile.findUnique({
    where: { authUserId: user.id }
  })
  if (!profile) {
    return null
  }

  try {
    return authorizeProfile(profile, options)
  } catch {
    return null
  }
}

export const requireApiAccess = async (
  request: Request,
  options: ApiAccessOptions = {}
): Promise<ApiAccessResult> => {
  const requestId = getRequestId(request)
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
    error
  } = await supabase.auth.getUser()
  if (error || !user) {
    return {
      ok: false,
      response: jsonError('Unauthorized', 401, {
        code: 'AUTH_SESSION_INVALID',
        requestId
      })
    }
  }

  const prisma = await getPrisma()
  const profile = await prisma.userProfile.findUnique({
    where: { authUserId: user.id }
  })
  if (!profile) {
    return {
      ok: false,
      response: jsonError('Forbidden', 403, {
        code: 'AUTH_PROFILE_MISSING',
        requestId
      })
    }
  }

  let actor: AuthenticatedActor
  try {
    actor = authorizeProfile(profile, options)
  } catch (authorizationError) {
    const code = authorizationError instanceof Error ? authorizationError.message : 'RBAC_FORBIDDEN'
    return {
      ok: false,
      response: jsonError('Forbidden', 403, {
        code,
        requestId
      })
    }
  }

  return {
    ok: true,
    context: {
      actor,
      role: actor.role,
      requestId,
      clientIp: getClientIp(request)
    }
  }
}
