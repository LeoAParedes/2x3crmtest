import { getCashierRuntimeState } from '@/src/lib/caja/cash-session-service'
import { jsonError, jsonOk } from '@/src/lib/http/json-response'
import { requireApiAccess } from '@/src/lib/security/api-auth'

export async function GET(request: Request) {
  const access = await requireApiAccess(request, { allowedRoles: ['admin', 'cashier'] })
  if (!access.ok) return access.response

  try {
    const state = await getCashierRuntimeState(access.context.actor)
    return jsonOk({ success: true, ...state })
  } catch (error) {
    return jsonError('No fue posible cargar el turno de caja', 500, {
      details: error instanceof Error ? error.message : 'unknown'
    })
  }
}
