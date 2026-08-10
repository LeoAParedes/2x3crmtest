import { z } from 'zod'

import { getPrisma } from '@/src/lib/db/prisma'
import { jsonError, jsonOk } from '@/src/lib/http/json-response'
import {
  buildMovementTimeline,
  type MovementOperationType,
  type MovementCategory
} from '@/src/lib/inventory/movement-timeline'
import { requireApiAccess } from '@/src/lib/security/api-auth'

const operationTypes: [MovementOperationType, ...MovementOperationType[]] = ['sale.create', 'inventory.import.csv']

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(100),
  operationType: z.union([z.enum(operationTypes), z.literal('all')]).default('all'),
  category: z.union([z.literal('all'), z.literal('sales'), z.literal('inventory')]).default('all')
})

export async function GET(request: Request) {
  const access = await requireApiAccess(request, { allowedRoles: ['admin', 'cashier'] })
  if (!access.ok) {
    return access.response
  }

  const { searchParams } = new URL(request.url)
  const parsedQuery = querySchema.safeParse({
    limit: searchParams.get('limit') || undefined,
    operationType: searchParams.get('operationType') || undefined,
    category: searchParams.get('category') || undefined
  })

  if (!parsedQuery.success) {
    return jsonError('Parámetros inválidos para consultar movimientos', 400, {
      code: 'INVENTORY_MOVEMENTS_QUERY_INVALID',
      details: parsedQuery.error.flatten(),
      requestId: access.context.requestId
    })
  }

  try {
    const prisma = await getPrisma()
    const logs = await prisma.systemActionLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: parsedQuery.data.limit * 3
    })

    const timeline = buildMovementTimeline(logs, {
      operationType: parsedQuery.data.operationType
    }).filter(entry => {
      if (parsedQuery.data.category === 'all') return true
      return entry.category === parsedQuery.data.category
    })

    const grouped = {
      sales: timeline.filter(entry => entry.category === 'sales'),
      inventory: timeline.filter(entry => entry.category === 'inventory')
    } satisfies Record<MovementCategory, typeof timeline>

    return jsonOk({
      success: true,
      filters: parsedQuery.data,
      operationTypes,
      grouped,
      items: timeline.slice(0, parsedQuery.data.limit)
    })
  } catch (error) {
    return jsonError('No fue posible cargar movimientos', 503, {
      code: 'INVENTORY_MOVEMENTS_UNAVAILABLE',
      details: error instanceof Error ? error.message : 'unknown error',
      requestId: access.context.requestId
    })
  }
}
