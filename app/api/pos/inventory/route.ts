import { jsonError, jsonOk } from '@/src/lib/http/json-response'
import { getPrisma } from '@/src/lib/db/prisma'
import {
  activeInventoryItemWhere,
  compareLowStockUrgency,
  isLowStockItem
} from '@/src/lib/inventory/low-stock'
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


export async function GET(request: Request) {
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

  const archiveWhere = includeArchived ? undefined : activeInventoryItemWhere

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
        .filter(item => isLowStockItem(item))
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
          supportsWeight: inferWeightSupport(item.category, item.aisle, item.productName)
        }))

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
        supportsWeight: inferWeightSupport(item.category, item.aisle, item.productName),
        ivaRate: item.ivaRate === null ? null : Number(item.ivaRate)
      }))
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'inventory query failed'
    const code =
      error && typeof error === 'object' && 'code' in error ? String((error as { code?: unknown }).code || '') : ''
    return jsonError('No fue posible cargar inventario', 500, { code, message: message.slice(0, 240) })
  }
}
