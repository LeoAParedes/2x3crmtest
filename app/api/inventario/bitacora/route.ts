import { appendFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { z } from 'zod'

import { getPrisma } from '@/src/lib/db/prisma'
import { jsonError, jsonOk } from '@/src/lib/http/json-response'
import {
  BITACORA_HIDDEN_ACTIONS,
  cleanupSystemActionLogNoise,
  dedupeLogbookRows
} from '@/src/lib/inventory/logbook-cleanup'
import { buildSystemLogbookEntries, type LogbookCategory } from '@/src/lib/inventory/system-logbook'
import { inferWeightSupport } from '@/src/lib/inventory/weight-units'
import { appLog } from '@/src/lib/observability/app-logger'
import { requireApiAccess } from '@/src/lib/security/api-auth'

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(300).default(150),
  action: z.string().min(1).max(120).optional(),
  status: z.union([z.literal('all'), z.literal('success'), z.literal('failed'), z.literal('pending')]).default('all'),
  category: z.union([z.literal('all'), z.literal('sales'), z.literal('inventory'), z.literal('pos'), z.literal('crm'), z.literal('system')]).default('all'),
  actor: z.string().min(1).max(80).optional()
})

// #region agent log
const writeAgentDebugLog = (payload: {
  hypothesisId: string
  location: string
  message: string
  data?: Record<string, unknown>
  runId?: string
}) => {
  const body = {
    sessionId: '449600',
    timestamp: Date.now(),
    runId: payload.runId || 'bitacora-fix',
    hypothesisId: payload.hypothesisId,
    location: payload.location,
    message: payload.message,
    data: payload.data || {}
  }
  try {
    appendFileSync(resolve(process.cwd(), '..', 'debug-449600.log'), `${JSON.stringify(body)}\n`)
  } catch {
    try {
      appendFileSync(resolve(process.cwd(), 'debug-449600.log'), `${JSON.stringify(body)}\n`)
    } catch {
      // ignore filesystem limits (e.g. Vercel)
    }
  }
  fetch('http://127.0.0.1:7470/ingest/f7f242f1-ff2d-40d4-bf0c-d535d5a2bbdb', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '449600' },
    body: JSON.stringify(body)
  }).catch(() => {})
}
// #endregion

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

    const repairedSales = await prisma.sale.updateMany({
      where: {
        AND: [
          { status: { notIn: ['completed', 'void', 'cancelled', 'refunded'] } }
        ]
      },
      data: { status: 'completed' }
    })

    const cleanup = await cleanupSystemActionLogNoise(prisma)
    if (cleanup.deletedTotal > 0 || repairedSales.count > 0 || cleanup.backfilledSaleMeta > 0) {
      appLog('info', 'Bitacora cleanup applied', {
        ...cleanup,
        repairedSales: repairedSales.count
      })
    }

    // #region agent log
    writeAgentDebugLog({
      hypothesisId: 'A',
      location: 'app/api/inventario/bitacora/route.ts:GET',
      message: 'cleanup+repair applied',
      data: {
        cleanup,
        repairedSales: repairedSales.count,
        hiddenActions: [...BITACORA_HIDDEN_ACTIONS]
      }
    })
    // #endregion

    const actionFilter = parsedQuery.data.action
      ? { equals: parsedQuery.data.action }
      : { notIn: [...BITACORA_HIDDEN_ACTIONS] }

    const where = {
      action: actionFilter,
      ...(access.context.actor.role === 'cashier' ? { actorAuthUserId: access.context.actor.userId } : {}),
      ...(parsedQuery.data.status !== 'all' ? { status: parsedQuery.data.status } : {}),
      ...(parsedQuery.data.actor
        ? { actorUsername: { contains: parsedQuery.data.actor, mode: 'insensitive' as const } }
        : {})
    }

    const [logs, actionsCatalog] = await Promise.all([
      prisma.systemActionLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: parsedQuery.data.limit * 3
      }),
      prisma.systemActionLog.findMany({
        where: {
          action: { notIn: [...BITACORA_HIDDEN_ACTIONS] },
          ...(access.context.actor.role === 'cashier' ? { actorAuthUserId: access.context.actor.userId } : {})
        },
        select: { action: true },
        distinct: ['action'],
        orderBy: { action: 'asc' }
      })
    ])

    const inventoryItemIds = [
      ...new Set(
        logs.flatMap(log => {
          const ids: string[] = []
          if (
            log.entityType === 'InventoryItem' &&
            (log.action === 'inventory.movement.entry' ||
              log.action === 'inventory.movement.exit' ||
              log.action === 'inventory.product.delete')
          ) {
            ids.push(log.entityId)
          }
          const metadata = log.metadata
          if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
            const inventoryItemId = (metadata as Record<string, unknown>).inventoryItemId
            if (typeof inventoryItemId === 'string') ids.push(inventoryItemId)
          }
          return ids
        })
      )
    ]

    const inventoryItems =
      inventoryItemIds.length > 0
        ? await prisma.inventoryItem.findMany({
            where: { id: { in: inventoryItemIds } },
            select: { id: true, category: true, aisle: true, productName: true }
          })
        : []

    const weightSupportByItemId = new Map(
      inventoryItems.map(
        item =>
          [item.id, inferWeightSupport(item.category, item.aisle, item.productName)] as const
      )
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
            status: sale.status || 'completed',
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
      if (!enrichment) {
        const existing =
          log.metadata && typeof log.metadata === 'object' && !Array.isArray(log.metadata)
            ? (log.metadata as Record<string, unknown>)
            : {}
        return {
          ...log,
          metadata: {
            ...existing,
            status: typeof existing.status === 'string' ? existing.status : 'completed'
          }
        }
      }
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

    const dedupedLogs = dedupeLogbookRows(enrichedLogs)
    const entries = buildSystemLogbookEntries(dedupedLogs, {
      category: parsedQuery.data.category as LogbookCategory | 'all',
      weightSupportByItemId
    }).slice(0, parsedQuery.data.limit)

    // #region agent log
    const actionCounts = entries.reduce<Record<string, number>>((acc, entry) => {
      acc[entry.action] = (acc[entry.action] || 0) + 1
      return acc
    }, {})
    writeAgentDebugLog({
      hypothesisId: 'A',
      location: 'app/api/inventario/bitacora/route.ts:GET:response',
      message: 'bitacora entries after hide+dedupe',
      data: {
        rawLogCount: logs.length,
        dedupedCount: dedupedLogs.length,
        entryCount: entries.length,
        actionCounts,
        draftInEntries: entries.filter(entry => entry.action === 'pos.draft.saved').length,
        saleLabels: entries.filter(entry => entry.action === 'sale.create').map(entry => entry.actionLabel)
      }
    })
    // #endregion

    return jsonOk({
      success: true,
      filters: parsedQuery.data,
      actions: actionsCatalog.map(item => item.action),
      categories: ['sales', 'inventory', 'pos', 'crm', 'system'] as const,
      cleanup,
      repairedSales: repairedSales.count,
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
