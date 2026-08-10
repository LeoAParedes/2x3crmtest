import { jsonOk } from '@/src/lib/http/json-response'
import { getCrmMetricsSnapshot } from '@/src/lib/observability/metrics-store'
import { requireApiAccess } from '@/src/lib/security/api-auth'

export async function GET(request: Request) {
  const access = await requireApiAccess(request, { allowedRoles: ['admin'] })
  if (!access.ok) {
    return access.response
  }

  return jsonOk({
    success: true,
    metrics: await getCrmMetricsSnapshot()
  })
}
