import { closeCashSession, previewExpectedCash } from '@/src/lib/caja/cash-session-service'
import { jsonError, jsonOk } from '@/src/lib/http/json-response'
import { requireApiAccess } from '@/src/lib/security/api-auth'

export async function GET(request: Request) {
  const access = await requireApiAccess(request, { allowedRoles: ['admin', 'cashier'] })
  if (!access.ok) return access.response

  try {
    const preview = await previewExpectedCash(access.context.actor)
    return jsonOk({
      success: true,
      session: {
        ...preview.session,
        // Blind close: do not expose expectedCash to client on GET used before count submit.
        expectedCash: null
      },
      blind: true
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown'
    if (message === 'CASH_SESSION_NOT_OPEN') {
      return jsonError('No hay turno abierto', 409, { code: message })
    }
    return jsonError('No fue posible preparar el corte', 400, { details: message })
  }
}

export async function POST(request: Request) {
  const access = await requireApiAccess(request, { allowedRoles: ['admin', 'cashier'] })
  if (!access.ok) return access.response

  try {
    const body = await request.json()
    const session = await closeCashSession(body, access.context.actor)
    return jsonOk({ success: true, session })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown'
    if (message === 'CASH_SESSION_NOT_OPEN') {
      return jsonError('No hay turno abierto', 409, { code: message })
    }
    return jsonError('No fue posible cerrar el turno', 400, { details: message })
  }
}
