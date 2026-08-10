import { jsonOk } from '@/src/lib/http/json-response'
import { getPrisma } from '@/src/lib/db/prisma'
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
  return /(granel|verdura|fruta|carn|peso|kg)/.test(fingerprint)
}

export async function GET(request: Request) {
  const access = await requireApiAccess(request, { requiredPermission: 'inventory:view' })
  if (!access.ok) return access.response

  const { searchParams } = new URL(request.url)
  const query = searchParams.get('q')?.trim()
  const sortBy = (searchParams.get('sortBy') || 'productName') as keyof typeof sortFieldMap
  const sortDirection = searchParams.get('sortDirection') === 'desc' ? 'desc' : 'asc'
  const page = Math.max(1, Number(searchParams.get('page') || 1))
  const pageSize = Math.min(100, Math.max(5, Number(searchParams.get('pageSize') || 20)))
  const skip = (page - 1) * pageSize
  const orderField = sortFieldMap[sortBy] || sortFieldMap.productName

  const where = query
    ? {
        OR: [
          { sku: { contains: query, mode: 'insensitive' as const } },
          { productName: { contains: query, mode: 'insensitive' as const } },
          { category: { contains: query, mode: 'insensitive' as const } }
        ]
      }
    : undefined

  const prisma = await getPrisma()
  const [total, items] = await Promise.all([
    prisma.inventoryItem.count({ where }),
    prisma.inventoryItem.findMany({
      where,
      orderBy: { [orderField]: sortDirection },
      skip,
      take: pageSize
    })
  ])

  return jsonOk({
    success: true,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize))
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
