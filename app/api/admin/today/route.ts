import { getTodayHubDashboard } from '@/src/lib/admin/today-hub'
import { jsonError, jsonOk } from '@/src/lib/http/json-response'
import { requireApiAccess } from '@/src/lib/security/api-auth'

export async function GET(request: Request) {
  const access = await requireApiAccess(request, { allowedRoles: ['admin'] })
  if (!access.ok) return access.response

  try {
    const hub = await getTodayHubDashboard(access.context.actor)
    return jsonOk({ success: true, ...hub })
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'TODAY_HUB_FAILED', 500)
  }
}
