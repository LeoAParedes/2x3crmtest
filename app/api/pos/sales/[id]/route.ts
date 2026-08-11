import { jsonError, jsonOk } from '@/src/lib/http/json-response'
import { getSaleTicket } from '@/src/lib/pos/sale-service'
import { requireApiAccess } from '@/src/lib/security/api-auth'

type RouteContext = {
  params: Promise<{ id: string }>
}

export async function GET(request: Request, context: RouteContext) {
  const access = await requireApiAccess(request, {
    allowedRoles: ['admin', 'cashier']
  })
  if (!access.ok) return access.response

  const { id } = await context.params
  if (!id || id.trim().length < 8) {
    return jsonError('Identificador de venta inválido', 400, {
      code: 'SALE_ID_INVALID',
      requestId: access.context.requestId
    })
  }

  try {
    const ticket = await getSaleTicket(id, access.context.actor)
    if (!ticket) {
      return jsonError('No se encontró el ticket de esta venta', 404, {
        code: 'SALE_TICKET_NOT_FOUND',
        requestId: access.context.requestId
      })
    }

    return jsonOk({
      success: true,
      ticket
    })
  } catch (error) {
    return jsonError('No fue posible cargar el ticket', 503, {
      code: 'SALE_TICKET_UNAVAILABLE',
      details: error instanceof Error ? error.message : 'unknown error',
      requestId: access.context.requestId
    })
  }
}
