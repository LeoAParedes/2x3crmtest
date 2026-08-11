import { openCashSession } from '@/src/lib/caja/cash-session-service'
import { jsonError, jsonOk } from '@/src/lib/http/json-response'
import { requireApiAccess } from '@/src/lib/security/api-auth'

export async function POST(request: Request) {
  const access = await requireApiAccess(request, { allowedRoles: ['admin', 'cashier'] })
  if (!access.ok) return access.response

  try {
    const body = await request.json()
    const session = await openCashSession(body, access.context.actor)
    return jsonOk({ success: true, session })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown'
    if (message === 'CASH_SESSION_ALREADY_OPEN') {
      return jsonError('Ya tienes un turno abierto', 409, { code: message })
    }
    if (message === 'CASH_SESSION_MUST_LOGOUT') {
      return jsonError('Debes cerrar sesión después del corte antes de abrir otro turno', 409, { code: message })
    }
    return jsonError('No fue posible abrir el turno', 400, { details: message })
  }
}
