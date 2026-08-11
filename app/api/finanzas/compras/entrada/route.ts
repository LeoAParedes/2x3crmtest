import {
  createPurchaseEntry,
  listRecentPurchases
} from '@/src/lib/finance/purchase-service'
import { jsonError, jsonOk } from '@/src/lib/http/json-response'
import { requireApiAccess } from '@/src/lib/security/api-auth'

export async function GET(request: Request) {
  const access = await requireApiAccess(request, {
    allowedRoles: ['admin'],
    requiredPermission: 'finance:view'
  })
  if (!access.ok) return access.response

  try {
    const purchases = await listRecentPurchases(25)
    return jsonOk({ success: true, purchases })
  } catch (error) {
    return jsonError('No fue posible cargar compras', 503, {
      code: 'PURCHASES_UNAVAILABLE',
      details: error instanceof Error ? error.message : 'unknown',
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
    const body = await request.json()
    const purchase = await createPurchaseEntry(body, access.context.actor)
    return jsonOk({
      success: true,
      message:
        purchase.paymentStatus === 'paid'
          ? 'Entrada registrada (contado) y egreso en finanzas'
          : 'Entrada registrada a crédito; saldo por pagar actualizado',
      purchase
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown'
    if (message === 'SUPPLIER_REQUIRED') {
      return jsonError('Selecciona o crea un proveedor', 400, {
        code: 'SUPPLIER_REQUIRED',
        requestId: access.context.requestId
      })
    }
    if (message === 'SUPPLIER_NOT_FOUND' || message === 'INVENTORY_ITEM_NOT_FOUND') {
      return jsonError('Proveedor o producto no encontrado', 404, {
        code: message,
        requestId: access.context.requestId
      })
    }
    if (message.includes('paymentStatus') || message.includes('quantity') || message.startsWith('[')) {
      return jsonError('Datos de compra inválidos', 400, {
        code: 'PURCHASE_INVALID',
        details: message,
        requestId: access.context.requestId
      })
    }
    return jsonError('No fue posible registrar la entrada', 503, {
      code: 'PURCHASE_ENTRY_FAILED',
      details: message,
      requestId: access.context.requestId
    })
  }
}
