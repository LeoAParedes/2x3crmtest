import { ZodError } from 'zod'

import { jsonError, jsonOk } from '@/src/lib/http/json-response'
import { createSale, InsufficientStockError, listSales } from '@/src/lib/pos/sale-service'
import { requireApiAccess } from '@/src/lib/security/api-auth'

export async function GET(request: Request) {
  const access = await requireApiAccess(request, {
    allowedRoles: ['admin', 'cashier']
  })
  if (!access.ok) return access.response

  return jsonOk({
    success: true,
    sales: await listSales(access.context.actor)
  })
}

export async function POST(request: Request) {
  const access = await requireApiAccess(request, { requiredPermission: 'pos:create' })
  if (!access.ok) return access.response

  try {
    const sale = await createSale(await request.json(), access.context.actor)
    return jsonOk({ success: true, sale }, { status: 201 })
  } catch (error) {
    if (error instanceof ZodError) {
      return jsonError('Datos de venta inválidos', 422, {
        code: 'SALE_INPUT_INVALID',
        details: error.flatten(),
        requestId: access.context.requestId
      })
    }
    if (error instanceof InsufficientStockError) {
      const skuSuffix = error.skus.length > 0 ? ` (${error.skus.join(', ')})` : ''
      return jsonError(`Stock insuficiente para uno o más productos del carrito${skuSuffix}`, 409, {
        code: 'INSUFFICIENT_STOCK',
        skus: error.skus,
        requestId: access.context.requestId
      })
    }
    const code = error instanceof Error ? error.message : 'SALE_CREATE_FAILED'
    const status = code === 'INSUFFICIENT_PAYMENT' ? 409 : 503
    const messageByCode: Record<string, string> = {
      INSUFFICIENT_PAYMENT: 'El monto recibido es insuficiente para el total de la venta',
      INVENTORY_ITEM_NOT_FOUND: 'Uno o más productos del carrito ya no están disponibles'
    }
    return jsonError(messageByCode[code] || 'No fue posible completar la venta', status, {
      code,
      requestId: access.context.requestId
    })
  }
}
