import { jsonError, jsonOk } from '@/src/lib/http/json-response'
import { getPrisma } from '@/src/lib/db/prisma'
import { compareLowStockUrgency } from '@/src/lib/inventory/low-stock'
import { applyDueScheduledPrices } from '@/src/lib/inventory/scheduled-prices'
import { buildInventorySearchWhere } from '@/src/lib/inventory/search-filter'
import { inferWeightSupport } from '@/src/lib/inventory/weight-units'
import { ensureCanonicalWeightStocks } from '@/src/lib/inventory/normalize-weight-stock'
import { requireApiAccess } from '@/src/lib/security/api-auth'

const sortFieldMap = {
  productName: 'productName',
  sku: 'sku',
  category: 'category',
  stock: 'stock',
  unitPrice: 'unitPrice'
} as const

const logInventoryPaginationDebug = (runId: string, hypothesisId: string, message: string, data: Record<string, unknown>) => {
  // #region agent log
  fetch('http://127.0.0.1:7470/ingest/f7f242f1-ff2d-40d4-bf0c-d535d5a2bbdb', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '449600' },
    body: JSON.stringify({
      sessionId: '449600',
      runId,
      hypothesisId,
      location: 'app/api/pos/inventory/route.ts',
      message,
      data,
      timestamp: Date.now()
    })
  }).catch(() => {})
  // #endregion
}

export async function GET(request: Request) {
  const runId = `pos-inventory-${Date.now()}`
  const access = await requireApiAccess(request, { requiredPermission: 'inventory:view' })
  if (!access.ok) return access.response

  const { searchParams } = new URL(request.url)
  const query = searchParams.get('q')?.trim()
  const searchField = searchParams.get('searchField')?.trim() || null
  const sortBy = (searchParams.get('sortBy') || 'productName') as keyof typeof sortFieldMap
  const sortDirection = searchParams.get('sortDirection') === 'desc' ? 'desc' : 'asc'
  const includeArchived = searchParams.get('includeArchived') === 'true'
  const alertsOnly = searchParams.get('alertsOnly') === 'true'
  const page = Math.max(1, Number(searchParams.get('page') || 1))
  const pageSize = Math.min(100, Math.max(5, Number(searchParams.get('pageSize') || 20)))
  const skip = (page - 1) * pageSize
  const orderField = sortFieldMap[sortBy] || sortFieldMap.productName

  const archiveWhere = includeArchived
    ? undefined
    : {
        OR: [{ aisle: null }, { aisle: { not: '__archived__' as const } }]
      }

  const queryWhere = buildInventorySearchWhere(query, searchField)
  const where = archiveWhere && queryWhere ? { AND: [archiveWhere, queryWhere] } : archiveWhere || queryWhere

  try {
    const prisma = await getPrisma()
    await applyDueScheduledPrices(prisma)
    await ensureCanonicalWeightStocks(prisma, {
      userId: access.context.actor.userId,
      username: access.context.actor.username,
      role: access.context.actor.role
    })

    if (alertsOnly) {
      const alertCandidates = await prisma.inventoryItem.findMany({
        where: archiveWhere,
        select: {
          id: true,
          sku: true,
          productName: true,
          category: true,
          stock: true,
          minStock: true,
          unitPrice: true,
          aisle: true
        }
      })
      const alertItems = alertCandidates
        .filter(item => item.stock <= item.minStock)
        .sort(compareLowStockUrgency)
        .slice(0, 50)
        .map(item => ({
          id: item.id,
          sku: item.sku,
          productName: item.productName,
          category: item.category,
          stock: item.stock,
          minStock: item.minStock,
          unitPrice: Number(item.unitPrice),
          aisle: item.aisle,
          supportsWeight: inferWeightSupport(item.category, item.aisle)
        }))

      // #region agent log
      logInventoryPaginationDebug(runId, 'H1', 'alertsOnly success', {
        alertsOnly: true,
        alertCount: alertItems.length
      })
      // #endregion

      return jsonOk({
        success: true,
        alertsOnly: true,
        pagination: {
          page: 1,
          pageSize: alertItems.length,
          total: alertItems.length,
          totalPages: 1
        },
        items: alertItems
      })
    }

    const [total, items] = await Promise.all([
      prisma.inventoryItem.count({ where }),
      prisma.inventoryItem.findMany({
        where,
        orderBy: { [orderField]: sortDirection },
        skip,
        take: pageSize
      })
    ])
    const totalPages = Math.max(1, Math.ceil(total / pageSize))
    const requestedPageExceedsRange = page > totalPages
    // #region agent log
    console.info('[H3] inventory pagination response', {
      runId,
      query,
      sortBy,
      sortDirection,
      page,
      pageSize,
      includeArchived,
      total,
      totalPages,
      returnedItems: items.length,
      requestedPageExceedsRange
    })
    // #endregion
    logInventoryPaginationDebug(runId, 'H1', 'inventory pagination response', {
      query: query || null,
      searchField,
      sortBy,
      sortDirection,
      page,
      pageSize,
      total,
      totalPages,
      returnedItems: items.length,
      requestedPageExceedsRange,
      hasMinStock: items.every(item => typeof item.minStock === 'number')
    })

    return jsonOk({
      success: true,
      pagination: {
        page,
        pageSize,
        total,
        totalPages
      },
      items: items.map(item => ({
        id: item.id,
        sku: item.sku,
        productName: item.productName,
        category: item.category,
        stock: item.stock,
        minStock: item.minStock,
        unitPrice: Number(item.unitPrice),
        aisle: item.aisle,
        supportsWeight: inferWeightSupport(item.category, item.aisle)
      }))
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'inventory query failed'
    const code =
      error && typeof error === 'object' && 'code' in error ? String((error as { code?: unknown }).code || '') : ''
    // #region agent log
    logInventoryPaginationDebug(runId, 'H1', 'inventory query failed', {
      alertsOnly,
      message: message.slice(0, 240),
      code,
      mentionsMinStock: /minStock/i.test(message)
    })
    // #endregion
    return jsonError('No fue posible cargar inventario', 500, { code, message: message.slice(0, 240) })
  }
}
