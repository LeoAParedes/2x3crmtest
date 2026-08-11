import { ZodError } from 'zod'

import { deletePromotion, updatePromotion } from '@/src/lib/finance/promotions-service'
import { jsonError, jsonOk } from '@/src/lib/http/json-response'
import { requireApiAccess } from '@/src/lib/security/api-auth'

type RouteContext = {
  params: Promise<{ id: string }>
}

export async function PATCH(request: Request, context: RouteContext) {
  const access = await requireApiAccess(request, {
    allowedRoles: ['admin'],
    requiredPermission: 'finance:view'
  })
  if (!access.ok) return access.response

  const { id } = await context.params

  try {
    const promotion = await updatePromotion(id, await request.json(), access.context.actor)
    return jsonOk({ success: true, promotion })
  } catch (error) {
    if (error instanceof ZodError) {
      return jsonError('Datos de promoción inválidos', 422, {
        code: 'FINANCE_PROMOTION_INVALID',
        details: error.flatten(),
        requestId: access.context.requestId
      })
    }
    if (error instanceof Error && error.message === 'PROMOTION_NOT_FOUND') {
      return jsonError('Promoción no encontrada', 404, {
        code: 'FINANCE_PROMOTION_NOT_FOUND',
        requestId: access.context.requestId
      })
    }

    return jsonError('No fue posible actualizar la promoción', 503, {
      code: 'FINANCE_PROMOTION_UPDATE_FAILED',
      details: error instanceof Error ? error.message : 'unknown error',
      requestId: access.context.requestId
    })
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const access = await requireApiAccess(request, {
    allowedRoles: ['admin'],
    requiredPermission: 'finance:view'
  })
  if (!access.ok) return access.response

  const { id } = await context.params

  try {
    await deletePromotion(id, access.context.actor)
    return jsonOk({ success: true, message: 'Promoción eliminada' })
  } catch (error) {
    if (error instanceof Error && error.message === 'PROMOTION_NOT_FOUND') {
      return jsonError('Promoción no encontrada', 404, {
        code: 'FINANCE_PROMOTION_NOT_FOUND',
        requestId: access.context.requestId
      })
    }

    return jsonError('No fue posible eliminar la promoción', 503, {
      code: 'FINANCE_PROMOTION_DELETE_FAILED',
      details: error instanceof Error ? error.message : 'unknown error',
      requestId: access.context.requestId
    })
  }
}
