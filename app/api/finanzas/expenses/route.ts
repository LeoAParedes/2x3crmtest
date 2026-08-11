import { ZodError } from 'zod'

import { createExpense, listExpenses } from '@/src/lib/finance/finance-service'
import { isFinancePeriod } from '@/src/lib/finance/period'
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

  try {
    const expenses = await listExpenses(periodParam)
    return jsonOk({
      success: true,
      period: periodParam,
      expenses
    })
  } catch (error) {
    return jsonError('No fue posible cargar gastos', 503, {
      code: 'FINANCE_EXPENSES_UNAVAILABLE',
      details: error instanceof Error ? error.message : 'unknown error',
      requestId: access.context.requestId
    })
  }
}

export async function POST(request: Request) {
  const access = await requireApiAccess(request, {
    allowedRoles: ['admin'],
    requiredPermission: 'finance:view'
  })
  if (!access.ok) return access.response

  try {
    const expense = await createExpense(await request.json(), access.context.actor)
    return jsonOk({ success: true, expense }, { status: 201 })
  } catch (error) {
    if (error instanceof ZodError) {
      return jsonError('Datos de gasto inválidos', 422, {
        code: 'FINANCE_EXPENSE_INVALID',
        details: error.flatten(),
        requestId: access.context.requestId
      })
    }

    return jsonError('No fue posible registrar el gasto', 503, {
      code: 'FINANCE_EXPENSE_CREATE_FAILED',
      details: error instanceof Error ? error.message : 'unknown error',
      requestId: access.context.requestId
    })
  }
}
