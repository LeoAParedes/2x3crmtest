import { z } from 'zod'

import { getPrisma } from '@/src/lib/db/prisma'
import { jsonError, jsonOk } from '@/src/lib/http/json-response'
import { buildSystemLogbookEntries, type LogbookCategory } from '@/src/lib/inventory/system-logbook'
import { inferWeightSupport } from '@/src/lib/inventory/weight-units'
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

    const inventoryEntityIds = [
      ...new Set(
        logs
          .filter(
            log =>
              log.entityType === 'InventoryItem' &&
              (log.action === 'inventory.movement.entry' ||
                log.action === 'inventory.movement.exit' ||
                log.action === 'inventory.product.delete')
          )
          .map(log => log.entityId)
      )
    ]

    const inventoryItems =
      inventoryEntityIds.length > 0
        ? await prisma.inventoryItem.findMany({
            where: { id: { in: inventoryEntityIds } },
            select: { id: true, category: true, aisle: true }
          })
        : []

    const weightSupportByItemId = new Map(
      inventoryItems.map(item => [item.id, inferWeightSupport(item.category, item.aisle)] as const)
    )

    const saleIdsNeedingEnrichment = [
      ...new Set(
        logs
          .filter(log => log.action === 'sale.create')
          .filter(log => {
            const metadata = log.metadata
            if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return true
            const values = metadata as Record<string, unknown>
            return typeof values.pieceCount !== 'number' || typeof values.weightGrams !== 'number'
          })
          .map(log => log.entityId)
      )
    ]

    const salesForEnrichment =
      saleIdsNeedingEnrichment.length > 0
        ? await prisma.sale.findMany({
            where: { id: { in: saleIdsNeedingEnrichment } },
            include: {
              items: {
                include: {
                  inventoryItem: {
                    select: { category: true, aisle: true }
                  }
                }
              }
            }
          })
        : []

    const enrichedSaleMetadata = new Map(
      salesForEnrichment.map(sale => {
        let pieceCount = 0
        let weightGrams = 0
        const items = sale.items.map(item => {
          const unitMode = inferWeightSupport(item.inventoryItem.category, item.inventoryItem.aisle)
            ? ('weight' as const)
            : ('piece' as const)
          if (unitMode === 'weight') {
            weightGrams += item.quantity
          } else {
            pieceCount += item.quantity
          }
          return {
            sku: item.sku,
            productName: item.productName,
            quantity: item.quantity,
            unitMode,
            unitPrice: Number(item.unitPrice),
            lineTotal: Number(item.lineTotal)
          }
        })

        return [
          sale.id,
          {
            saleId: sale.id,
            saleNumber: sale.saleNumber,
            pieceCount,
            weightGrams,
            paymentMethod: sale.paymentMethod,
            itemCount: sale.items.length,
            subtotal: Number(sale.subtotal),
            tax: Number(sale.tax),
            total: Number(sale.total),
            amountReceived: sale.amountReceived === null ? null : Number(sale.amountReceived),
            cashierUsername: sale.cashierUsername,
            createdAt: sale.createdAt.toISOString(),
            items
          }
        ] as const
      })
    )

    const enrichedLogs = logs.map(log => {
      if (log.action !== 'sale.create') return log
      const enrichment = enrichedSaleMetadata.get(log.entityId)
      if (!enrichment) return log
      const existing =
        log.metadata && typeof log.metadata === 'object' && !Array.isArray(log.metadata)
          ? (log.metadata as Record<string, unknown>)
          : {}
      return {
        ...log,
        metadata: {
          ...existing,
          ...enrichment
        }
      }
    })

    const entries = buildSystemLogbookEntries(enrichedLogs, {
      category: parsedQuery.data.category as LogbookCategory | 'all',
      weightSupportByItemId
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
