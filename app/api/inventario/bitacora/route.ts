import { z } from 'zod'

import { getPrisma } from '@/src/lib/db/prisma'
import { jsonError, jsonOk } from '@/src/lib/http/json-response'
import { buildSystemLogbookEntries, type LogbookCategory } from '@/src/lib/inventory/system-logbook'
import { requireApiAccess } from '@/src/lib/security/api-auth'

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(300).default(150),
  action: z.string().min(1).max(120).optional(),
  status: z.union([z.literal('all'), z.literal('success'), z.literal('failed'), z.literal('pending')]).default('all'),
  category: z.union([z.literal('all'), z.literal('sales'), z.literal('inventory'), z.literal('pos'), z.literal('crm'), z.literal('system')]).default('all'),
  actor: z.string().min(1).max(80).optional()
})

export async function GET(request: Request) {
  const access = await requireApiAccess(request, { allowedRoles: ['admin', 'cashier'] })
  if (!access.ok) {
    return access.response
  }

  const { searchParams } = new URL(request.url)
  const parsedQuery = querySchema.safeParse({
    limit: searchParams.get('limit') || undefined,
    action: searchParams.get('action') || undefined,
    status: searchParams.get('status') || undefined,
    category: searchParams.get('category') || undefined,
    actor: searchParams.get('actor') || undefined
  })

  if (!parsedQuery.success) {
    return jsonError('Parámetros inválidos para consultar bitácora', 400, {
      code: 'INVENTORY_LOGBOOK_QUERY_INVALID',
      details: parsedQuery.error.flatten(),
      requestId: access.context.requestId
    })
  }

  try {
    const prisma = await getPrisma()
    const where = {
      ...(access.context.actor.role === 'cashier' ? { actorAuthUserId: access.context.actor.userId } : {}),
      ...(parsedQuery.data.action ? { action: parsedQuery.data.action } : {}),
      ...(parsedQuery.data.status !== 'all' ? { status: parsedQuery.data.status } : {}),
      ...(parsedQuery.data.actor ? { actorUsername: { contains: parsedQuery.data.actor, mode: 'insensitive' as const } } : {})
    }

    const [logs, actionsCatalog] = await Promise.all([
      prisma.systemActionLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: parsedQuery.data.limit * 2
      }),
      prisma.systemActionLog.findMany({
        where: access.context.actor.role === 'cashier' ? { actorAuthUserId: access.context.actor.userId } : undefined,
        select: { action: true },
        distinct: ['action'],
        orderBy: { action: 'asc' }
      })
    ])

    const entries = buildSystemLogbookEntries(logs, {
      category: parsedQuery.data.category as LogbookCategory | 'all'
    }).slice(0, parsedQuery.data.limit)

    return jsonOk({
      success: true,
      filters: parsedQuery.data,
      actions: actionsCatalog.map(item => item.action),
      categories: ['sales', 'inventory', 'pos', 'crm', 'system'] as const,
      items: entries
    })
  } catch (error) {
    return jsonError('No fue posible cargar bitácora', 503, {
      code: 'INVENTORY_LOGBOOK_UNAVAILABLE',
      details: error instanceof Error ? error.message : 'unknown error',
      requestId: access.context.requestId
    })
  }
}
