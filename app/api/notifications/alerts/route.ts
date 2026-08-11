import { jsonError, jsonOk } from '@/src/lib/http/json-response'
import { listUnifiedWorkspaceAlerts } from '@/src/lib/inventory/lot-service'
import { requireApiAccess } from '@/src/lib/security/api-auth'

export async function GET(request: Request) {
  const access = await requireApiAccess(request, { allowedRoles: ['admin', 'cashier'] })
  if (!access.ok) return access.response

  try {
    const alerts = await listUnifiedWorkspaceAlerts()
    return jsonOk(
      { success: true, ...alerts },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          Pragma: 'no-cache'
        }
      }
    )
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'ALERTS_FAILED', 500)
  }
}
