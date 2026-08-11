import type { PrismaClient } from '@prisma/client'

import { isIvaExemptWaterProduct } from '@/src/lib/inventory/iva-exempt-water'

export const WATER_IVA_REPAIRED_ACTION = 'inventory.water_iva.repaired'

type PrismaLike = Pick<PrismaClient, 'inventoryItem' | 'systemActionLog'>

export type WaterIvaRepairPlan = {
  id: string
  sku: string
  productName: string
  category: string
  previousIvaRate: number | null
  nextIvaRate: number
}

export type WaterIvaRepairResult = {
  dryRun: boolean
  plans: WaterIvaRepairPlan[]
  applied: number
}

const toRateOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined) return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

/**
 * Find drinking-water products that still carry a non-zero / unset IVA override
 * and plan setting ivaRate = 0.
 */
export const diagnoseWaterIvaExemptions = async (prisma: PrismaLike) => {
  const candidates = await prisma.inventoryItem.findMany({
    where: {
      OR: [
        { productName: { contains: 'agua', mode: 'insensitive' } },
        { productName: { contains: 'garraf', mode: 'insensitive' } },
        { category: { equals: 'Agua', mode: 'insensitive' } },
        { category: { equals: 'Aguas', mode: 'insensitive' } }
      ]
    },
    select: {
      id: true,
      sku: true,
      productName: true,
      category: true,
      aisle: true,
      ivaRate: true
    },
    take: 10_000
  })

  const plans: WaterIvaRepairPlan[] = []

  for (const item of candidates) {
    if (!isIvaExemptWaterProduct(item.productName, item.category, item.aisle)) continue
    const previous = toRateOrNull(item.ivaRate)
    if (previous === 0) continue
    plans.push({
      id: item.id,
      sku: item.sku,
      productName: item.productName,
      category: item.category,
      previousIvaRate: previous,
      nextIvaRate: 0
    })
  }

  return plans
}

export const repairWaterIvaExemptions = async (
  prisma: PrismaLike,
  options: { dryRun?: boolean; actorUsername?: string } = {}
): Promise<WaterIvaRepairResult> => {
  const dryRun = options.dryRun !== false
  const plans = await diagnoseWaterIvaExemptions(prisma)

  if (dryRun || plans.length === 0) {
    return { dryRun, plans, applied: 0 }
  }

  let applied = 0
  for (const plan of plans) {
    await prisma.inventoryItem.update({
      where: { id: plan.id },
      data: { ivaRate: 0 }
    })
    applied += 1
  }

  await prisma.systemActionLog.create({
    data: {
      actorAuthUserId: null,
      actorUsername: options.actorUsername || 'system',
      actorRole: 'admin',
      action: WATER_IVA_REPAIRED_ACTION,
      entityType: 'InventoryItem',
      entityId: 'bulk',
      status: 'success',
      metadata: {
        applied,
        skus: plans.map(plan => plan.sku)
      }
    }
  })

  return { dryRun: false, plans, applied }
}
