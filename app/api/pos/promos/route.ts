import { listActivePromoCandidates } from '@/src/lib/finance/promotions-service'
import { jsonError, jsonOk } from '@/src/lib/http/json-response'
import { requireApiAccess } from '@/src/lib/security/api-auth'

export async function GET(request: Request) {
  const access = await requireApiAccess(request, { allowedRoles: ['admin', 'cashier'] })
  if (!access.ok) return access.response

  try {
    const promos = await listActivePromoCandidates()
    return jsonOk({
      success: true,
      promos
    })
  } catch (error) {
    return jsonError('No fue posible cargar promociones activas', 503, {
      details: error instanceof Error ? error.message : 'unknown',
      requestId: access.context.requestId
    })
  }
}
