import { ZodError } from 'zod'

import { createPromotion, listPromotions } from '@/src/lib/finance/promotions-service'
import { jsonError, jsonOk } from '@/src/lib/http/json-response'
import { requireApiAccess } from '@/src/lib/security/api-auth'

const mapPromotionValidationMessage = (error: ZodError) => {
  const issue = error.issues[0]
  if (!issue) return 'Datos de promoción inválidos'

  switch (issue.message) {
    case 'BUNDLE_REQUIRES_ITEMS':
      return 'Un paquete requiere al menos 2 productos'
    case 'BUNDLE_REQUIRES_FIXED_DISCOUNT':
      return 'Un paquete requiere un descuento fijo mayor a 0'
    case 'PROMO_REQUIRES_PRODUCTS':
      return 'Selecciona al menos un producto para esta promoción'
    case 'PROMO_STARTS_AFTER_EXPIRES':
      return 'La fecha de inicio no puede ser posterior a la de expiración'
    default:
      break
  }

  if (issue.path[0] === 'name') return 'El nombre debe tener entre 2 y 120 caracteres'
  if (issue.path[0] === 'value') return 'Indica un valor de descuento válido'
  if (issue.path[0] === 'description') return 'La descripción no puede exceder 240 caracteres'
  if (issue.path[0] === 'startsAt' || issue.path[0] === 'expiresAt') {
    return 'Las fechas de la promoción no son válidas'
  }

  return 'Datos de promoción inválidos'
}

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
      return jsonError(mapPromotionValidationMessage(error), 422, {
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
