import { deleteExpense } from '@/src/lib/finance/finance-service'
import { jsonError, jsonOk } from '@/src/lib/http/json-response'
import { requireApiAccess } from '@/src/lib/security/api-auth'

type RouteContext = {
  params: Promise<{ id: string }>
}

export async function DELETE(request: Request, context: RouteContext) {
  const access = await requireApiAccess(request, {
    allowedRoles: ['admin'],
    requiredPermission: 'finance:view'
  })
  if (!access.ok) return access.response

  const { id } = await context.params

  try {
    await deleteExpense(id, access.context.actor)
    return jsonOk({ success: true, message: 'Gasto eliminado' })
  } catch (error) {
    if (error instanceof Error && error.message === 'EXPENSE_NOT_FOUND') {
      return jsonError('Gasto no encontrado', 404, {
        code: 'FINANCE_EXPENSE_NOT_FOUND',
        requestId: access.context.requestId
      })
    }

    return jsonError('No fue posible eliminar el gasto', 503, {
      code: 'FINANCE_EXPENSE_DELETE_FAILED',
      details: error instanceof Error ? error.message : 'unknown error',
      requestId: access.context.requestId
    })
  }
}
