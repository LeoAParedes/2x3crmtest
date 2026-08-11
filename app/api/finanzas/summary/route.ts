import { getFinanceDashboard, getPeriodosDashboard, listExpensesInRange } from '@/src/lib/finance/finance-service'
import {
  getCustomBounds,
  isFinancePeriod,
  normalizeCashFlowWindowDays,
  type CashFlowWindowDays
} from '@/src/lib/finance/period'
import { jsonError, jsonOk } from '@/src/lib/http/json-response'
import { requireApiAccess } from '@/src/lib/security/api-auth'

export async function GET(request: Request) {
  const access = await requireApiAccess(request, {
    allowedRoles: ['admin'],
    requiredPermission: 'finance:view'
  })
  if (!access.ok) return access.response

  const { searchParams } = new URL(request.url)
  const mode = searchParams.get('mode')

  if (mode === 'periodos') {
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const cashFlowDaysRaw = Number(searchParams.get('cashFlowDays') || 15)
    const cashFlowDays: CashFlowWindowDays = normalizeCashFlowWindowDays(cashFlowDaysRaw)

    let salesRange: { start: Date; end: Date } | undefined
    if (from && to) {
      try {
        salesRange = getCustomBounds(from, to)
      } catch {
        return jsonError('Rango de fechas inválido', 400, {
          code: 'FINANCE_CUSTOM_RANGE_INVALID',
          requestId: access.context.requestId
        })
      }
    }

    try {
      const dashboard = await getPeriodosDashboard({ salesRange, cashFlowDays })
      const expenses = await listExpensesInRange(
        new Date(dashboard.panels.cashFlow.range.start),
        new Date(dashboard.panels.cashFlow.range.end)
      )
      return jsonOk({
        success: true,
        ...dashboard,
        expenses
      })
    } catch (error) {
      return jsonError('No fue posible cargar el resumen financiero', 503, {
        code: 'FINANCE_SUMMARY_UNAVAILABLE',
        details: error instanceof Error ? error.message : 'unknown error',
        requestId: access.context.requestId
      })
    }
  }

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
