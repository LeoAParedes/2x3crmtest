import { ZodError } from 'zod'

import { createPromotion, listPromotions } from '@/src/lib/finance/promotions-service'
import { jsonError, jsonOk } from '@/src/lib/http/json-response'
import { requireApiAccess } from '@/src/lib/security/api-auth'

export async function GET(request: Request) {
  const access = await requireApiAccess(request, {
    allowedRoles: ['admin'],
    requiredPermission: 'finance:view'
  })
  if (!access.ok) return access.response

  try {
    const promotions = await listPromotions()
    return jsonOk({ success: true, promotions })
  } catch (error) {
    return jsonError('No fue posible cargar promociones', 503, {
      code: 'FINANCE_PROMOTIONS_UNAVAILABLE',
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
    const promotion = await createPromotion(await request.json(), access.context.actor)
    return jsonOk({ success: true, promotion }, { status: 201 })
  } catch (error) {
    if (error instanceof ZodError) {
      return jsonError('Datos de promoción inválidos', 422, {
        code: 'FINANCE_PROMOTION_INVALID',
        details: error.flatten(),
        requestId: access.context.requestId
      })
    }

    return jsonError('No fue posible crear la promoción', 503, {
      code: 'FINANCE_PROMOTION_CREATE_FAILED',
      details: error instanceof Error ? error.message : 'unknown error',
      requestId: access.context.requestId
    })
  }
}
