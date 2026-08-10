import { jsonOk } from '@/src/lib/http/json-response'
import { getPrisma } from '@/src/lib/db/prisma'
import { requireApiAccess } from '@/src/lib/security/api-auth'

export async function GET(request: Request) {
  const access = await requireApiAccess(request, { requiredPermission: 'inventory:view' })
  if (!access.ok) return access.response

  const query = new URL(request.url).searchParams.get('q')?.trim()
  const prisma = await getPrisma()
  const items = await prisma.inventoryItem.findMany({
    where: query
      ? {
          OR: [
            { sku: { contains: query, mode: 'insensitive' } },
            { productName: { contains: query, mode: 'insensitive' } },
            { category: { contains: query, mode: 'insensitive' } }
          ]
        }
      : undefined,
    orderBy: { productName: 'asc' },
    take: 100
  })

  return jsonOk({
    success: true,
    items: items.map(item => ({
      id: item.id,
      sku: item.sku,
      productName: item.productName,
      category: item.category,
      stock: item.stock,
      unitPrice: Number(item.unitPrice),
      aisle: item.aisle
    }))
  })
}
