import { createCashierAccount, listCashierAccounts } from '@/src/lib/admin/cashier-accounts'
import { jsonError, jsonOk } from '@/src/lib/http/json-response'
import { requireApiAccess } from '@/src/lib/security/api-auth'

export async function GET(request: Request) {
  const access = await requireApiAccess(request, { allowedRoles: ['admin'] })
  if (!access.ok) return access.response

  try {
    const cashiers = await listCashierAccounts()
    return jsonOk({ success: true, cashiers })
  } catch (error) {
    return jsonError('No fue posible listar cajeros', 500, {
      details: error instanceof Error ? error.message : 'unknown'
    })
  }
}

export async function POST(request: Request) {
  const access = await requireApiAccess(request, { allowedRoles: ['admin'] })
  if (!access.ok) return access.response

  try {
    const body = await request.json()
    const cashier = await createCashierAccount(body, access.context.actor)
    return jsonOk({ success: true, cashier })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown'
    if (message === 'USERNAME_TAKEN' || message === 'USERNAME_RESERVED') {
      return jsonError('Ese usuario no está disponible', 409, { code: message })
    }
    if (message === 'Usuario inválido') {
      return jsonError('Usuario inválido. Usa 3-32 caracteres: letras, números y _', 400, { code: message })
    }
    return jsonError('No fue posible crear el cajero', 400, { details: message })
  }
}
