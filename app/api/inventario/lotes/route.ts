import { jsonError, jsonOk } from '@/src/lib/http/json-response'
import {
  listActiveLots,
  listUnifiedWorkspaceAlerts,
  wasteLotQuantity
} from '@/src/lib/inventory/lot-service'
import { requireApiAccess } from '@/src/lib/security/api-auth'

export async function GET(request: Request) {
  const access = await requireApiAccess(request, { allowedRoles: ['admin', 'cashier'] })
  if (!access.ok) return access.response

  try {
    const url = new URL(request.url)
    const mode = url.searchParams.get('mode')
    if (mode === 'alerts') {
      const alerts = await listUnifiedWorkspaceAlerts()
      return jsonOk({ success: true, ...alerts })
    }

    const inventoryItemId = url.searchParams.get('inventoryItemId') || undefined
    const lots = await listActiveLots(inventoryItemId)
    return jsonOk({ success: true, lots })
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'LOT_LIST_FAILED', 500)
  }
}

export async function POST(request: Request) {
  const access = await requireApiAccess(request, { allowedRoles: ['admin', 'cashier'] })
  if (!access.ok) return access.response

  try {
    const body = await request.json()
    const result = await wasteLotQuantity(body, access.context.actor)
    return jsonOk({
      success: true,
      message: 'Salida de lote registrada',
      ...result
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'LOT_WASTE_FAILED'
    const status =
      message === 'LOT_NOT_FOUND' || message === 'LOT_NOT_ACTIVE'
        ? 404
        : message === 'LOT_INSUFFICIENT_QUANTITY' || message === 'INSUFFICIENT_STOCK'
          ? 400
          : 500
    return jsonError(message, status)
  }
}
