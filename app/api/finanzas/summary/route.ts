import { getFinanceDashboard } from '@/src/lib/finance/finance-service'
import { getCustomBounds, isFinancePeriod } from '@/src/lib/finance/period'
import { jsonError, jsonOk } from '@/src/lib/http/json-response'
import { requireApiAccess } from '@/src/lib/security/api-auth'

export async function GET(request: Request) {
  const access = await requireApiAccess(request, {
    allowedRoles: ['admin'],
    requiredPermission: 'finance:view'
  })
  if (!access.ok) return access.response

  const { searchParams } = new URL(request.url)
  const periodParam = searchParams.get('period') || 'day'
  if (!isFinancePeriod(periodParam)) {
    return jsonError('Periodo inválido. Usa day, week o month', 400, {
      code: 'FINANCE_PERIOD_INVALID',
      requestId: access.context.requestId
    })
  }

  const from = searchParams.get('from')
  const to = searchParams.get('to')
  let customRange: { start: Date; end: Date } | undefined
  if (from && to) {
    try {
      customRange = getCustomBounds(from, to)
    } catch {
      return jsonError('Rango de fechas inválido', 400, {
        code: 'FINANCE_CUSTOM_RANGE_INVALID',
        requestId: access.context.requestId
      })
    }
  }

  try {
    const dashboard = await getFinanceDashboard(periodParam, customRange)
    return jsonOk({
      success: true,
      ...dashboard
    })
  } catch (error) {
    return jsonError('No fue posible cargar el resumen financiero', 503, {
      code: 'FINANCE_SUMMARY_UNAVAILABLE',
      details: error instanceof Error ? error.message : 'unknown error',
      requestId: access.context.requestId
    })
  }
}
