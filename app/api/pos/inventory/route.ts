import { jsonOk } from '@/src/lib/http/json-response'
import { getPrisma } from '@/src/lib/db/prisma'
import { applyDueScheduledPrices } from '@/src/lib/inventory/scheduled-prices'
import { requireApiAccess } from '@/src/lib/security/api-auth'

const sortFieldMap = {
  productName: 'productName',
  sku: 'sku',
  category: 'category',
  stock: 'stock',
  unitPrice: 'unitPrice'
} as const

const inferWeightSupport = (category: string, aisle: string | null) => {
  const fingerprint = `${category} ${aisle || ''}`.toLowerCase()
  return /(granel|peso|kg|fruta|verdura|vegetal|carn|res|pollo|cerdo|pesc|marisc|legumbr|ra[ií]z|tub[eé]rc)/.test(
    fingerprint
  )
}

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
  const sortBy = (searchParams.get('sortBy') || 'productName') as keyof typeof sortFieldMap
  const sortDirection = searchParams.get('sortDirection') === 'desc' ? 'desc' : 'asc'
  const includeArchived = searchParams.get('includeArchived') === 'true'
  const page = Math.max(1, Number(searchParams.get('page') || 1))
  const pageSize = Math.min(100, Math.max(5, Number(searchParams.get('pageSize') || 20)))
  const skip = (page - 1) * pageSize
  const orderField = sortFieldMap[sortBy] || sortFieldMap.productName

  const archiveWhere = includeArchived
    ? undefined
    : {
        OR: [{ aisle: null }, { aisle: { not: '__archived__' as const } }]
      }

  const queryTokens = query
    ? query
        .split(/\s+/)
        .map(token => token.trim())
        .filter(Boolean)
    : []
  const queryWhere =
    queryTokens.length > 0
      ? {
          AND: queryTokens.map(token => ({
            OR: [
              { sku: { contains: token, mode: 'insensitive' as const } },
              { productName: { contains: token, mode: 'insensitive' as const } },
              { category: { contains: token, mode: 'insensitive' as const } }
            ]
          }))
        }
      : undefined

  const where = archiveWhere && queryWhere ? { AND: [archiveWhere, queryWhere] } : archiveWhere || queryWhere

  const prisma = await getPrisma()
  await applyDueScheduledPrices(prisma)
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
  logInventoryPaginationDebug(runId, 'H3', 'inventory pagination response', {
    query: query || null,
    sortBy,
    sortDirection,
    page,
    pageSize,
    total,
    totalPages,
    returnedItems: items.length,
    requestedPageExceedsRange
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
      unitPrice: Number(item.unitPrice),
      aisle: item.aisle,
      supportsWeight: inferWeightSupport(item.category, item.aisle)
    }))
  })
}
