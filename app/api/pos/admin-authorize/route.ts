import { verifyAdminPassword } from '@/src/lib/pos/admin-override'
import { getPrisma } from '@/src/lib/db/prisma'
import { jsonError, jsonOk } from '@/src/lib/http/json-response'
import { requireApiAccess } from '@/src/lib/security/api-auth'

export async function POST(request: Request) {
  const access = await requireApiAccess(request, { allowedRoles: ['admin', 'cashier'] })
  if (!access.ok) return access.response

  try {
    const body = await request.json()
    const verified = await verifyAdminPassword(body)
    const prisma = await getPrisma()

    await prisma.systemActionLog.create({
      data: {
        actorAuthUserId: access.context.actor.userId,
        actorUsername: access.context.actor.username,
        actorRole: access.context.actor.role,
        action: 'pos.admin_override.authorized',
        entityType: 'PosCart',
        entityId: access.context.actor.userId,
        status: 'success',
        metadata: {
          reason: verified.reason,
          authorizedBy: verified.adminUsername,
          scope: body?.scope || 'cart_remove_item'
        }
      }
    })

    return jsonOk({
      success: true,
      authorized: true,
      authorizedBy: verified.adminUsername
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown'
    if (message === 'ADMIN_CREDENTIALS_INVALID' || message.includes('Usuario inválido')) {
      return jsonError('Clave de administrador inválida', 403, {
        code: 'ADMIN_CREDENTIALS_INVALID',
        requestId: access.context.requestId
      })
    }
    return jsonError('No fue posible validar la clave de administrador', 400, {
      code: 'ADMIN_AUTHORIZE_FAILED',
      details: message,
      requestId: access.context.requestId
    })
  }
}
