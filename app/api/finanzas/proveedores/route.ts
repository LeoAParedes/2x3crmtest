import {
  createSupplier,
  listSuppliers
} from '@/src/lib/finance/purchase-service'
import { jsonError, jsonOk } from '@/src/lib/http/json-response'
import { requireApiAccess } from '@/src/lib/security/api-auth'

export async function GET(request: Request) {
  const access = await requireApiAccess(request, {
    allowedRoles: ['admin'],
    requiredPermission: 'finance:view'
  })
  if (!access.ok) return access.response

  const { searchParams } = new URL(request.url)
  const query = searchParams.get('q') || undefined

  try {
    const suppliers = await listSuppliers(query)
    return jsonOk({ success: true, suppliers })
  } catch (error) {
    return jsonError('No fue posible cargar proveedores', 503, {
      code: 'SUPPLIERS_UNAVAILABLE',
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
    const supplier = await createSupplier(body, access.context.actor)
    return jsonOk({ success: true, supplier })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown'
    if (message.includes('email') || message.startsWith('[')) {
      return jsonError('Datos de proveedor inválidos', 400, {
        code: 'SUPPLIER_INVALID',
        details: message,
        requestId: access.context.requestId
      })
    }
    return jsonError('No fue posible crear el proveedor', 503, {
      code: 'SUPPLIER_CREATE_FAILED',
      details: message,
      requestId: access.context.requestId
    })
  }
}
