import { listCashSessions } from '@/src/lib/caja/cash-session-service'
import { jsonError, jsonOk } from '@/src/lib/http/json-response'
import { requireApiAccess } from '@/src/lib/security/api-auth'

export async function GET(request: Request) {
  const access = await requireApiAccess(request, {
    allowedRoles: ['admin'],
    requiredPermission: 'finance:view'
  })
  if (!access.ok) return access.response

  try {
    const sessions = await listCashSessions(60)
    return jsonOk({ success: true, sessions })
  } catch (error) {
    return jsonError('No fue posible listar cortes', 500, {
      details: error instanceof Error ? error.message : 'unknown'
    })
  }
}
