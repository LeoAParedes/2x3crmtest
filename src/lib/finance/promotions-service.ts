import { getPrisma } from '@/src/lib/db/prisma'
import {
  createPromotionSchema,
  updatePromotionSchema,
  type CreatePromotionInput,
  type UpdatePromotionInput
} from '@/src/lib/finance/promotions-schema'
import type { PromoCandidate } from '@/src/lib/pos/promo-engine'
import type { AuthenticatedActor } from '@/src/lib/security/api-auth'

const toMoney = (value: number) => Number(value.toFixed(2))

const mapPromotion = (promotion: {
  id: string
  name: string
  type: string
  value: { toString(): string } | number
  minPurchase: { toString(): string } | number
  description: string
  active: boolean
  startsAt: Date | null
  expiresAt: Date | null
  createdByUsername: string
  createdAt: Date
  updatedAt: Date
  products?: Array<{ inventoryItemId: string; inventoryItem?: { sku: string; productName: string } }>
  bundleItems?: Array<{
    inventoryItemId: string
    requiredQty: number
    inventoryItem?: { sku: string; productName: string }
  }>
}) => ({
  id: promotion.id,
  name: promotion.name,
  type: promotion.type,
  value: toMoney(Number(promotion.value)),
  minPurchase: toMoney(Number(promotion.minPurchase)),
  description: promotion.description,
  active: promotion.active,
  startsAt: promotion.startsAt?.toISOString() ?? null,
  expiresAt: promotion.expiresAt?.toISOString() ?? null,
  createdByUsername: promotion.createdByUsername,
  createdAt: promotion.createdAt.toISOString(),
  updatedAt: promotion.updatedAt.toISOString(),
  productIds: (promotion.products || []).map(item => item.inventoryItemId),
  products: (promotion.products || []).map(item => ({
    inventoryItemId: item.inventoryItemId,
    sku: item.inventoryItem?.sku || '',
    productName: item.inventoryItem?.productName || ''
  })),
  bundleItems: (promotion.bundleItems || []).map(item => ({
    inventoryItemId: item.inventoryItemId,
    requiredQty: item.requiredQty,
    sku: item.inventoryItem?.sku || '',
    productName: item.inventoryItem?.productName || ''
  }))
})

const promotionInclude = {
  products: {
    include: { inventoryItem: { select: { sku: true, productName: true } } }
  },
  bundleItems: {
    include: { inventoryItem: { select: { sku: true, productName: true } } }
  }
} as const

export const listPromotions = async () => {
  const prisma = await getPrisma()
  const promotions = await prisma.promotion.findMany({
    orderBy: [{ active: 'desc' }, { createdAt: 'desc' }],
    include: promotionInclude
  })
  return promotions.map(mapPromotion)
}

export const listActivePromoCandidates = async (now = new Date()): Promise<PromoCandidate[]> => {
  const prisma = await getPrisma()
  const promotions = await prisma.promotion.findMany({
    where: {
      active: true,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] }
      ]
    },
    include: {
      products: true,
      bundleItems: true
    }
  })

  return promotions.map(promotion => ({
    id: promotion.id,
    name: promotion.name,
    type: promotion.type as PromoCandidate['type'],
    value: toMoney(Number(promotion.value)),
    minPurchase: toMoney(Number(promotion.minPurchase)),
    productIds: promotion.products.map(item => item.inventoryItemId),
    bundleItems: promotion.bundleItems.map(item => ({
      inventoryItemId: item.inventoryItemId,
      requiredQty: item.requiredQty
    }))
  }))
}

const syncPromotionProducts = async (
  promotionId: string,
  type: string,
  productIds: string[],
  bundleItems: Array<{ inventoryItemId: string; requiredQty: number }>
) => {
  const prisma = await getPrisma()
  await prisma.promotionProduct.deleteMany({ where: { promotionId } })
  await prisma.promotionBundleItem.deleteMany({ where: { promotionId } })

  if (type === 'bundle') {
    if (bundleItems.length > 0) {
      await prisma.promotionBundleItem.createMany({
        data: bundleItems.map(item => ({
          promotionId,
          inventoryItemId: item.inventoryItemId,
          requiredQty: item.requiredQty
        }))
      })
    }
    return
  }

  const uniqueIds = [...new Set(productIds)]
  if (uniqueIds.length > 0) {
    await prisma.promotionProduct.createMany({
      data: uniqueIds.map(inventoryItemId => ({ promotionId, inventoryItemId }))
    })
  }
}

export const createPromotion = async (rawInput: unknown, actor: AuthenticatedActor) => {
  const input: CreatePromotionInput = createPromotionSchema.parse(rawInput)
  const prisma = await getPrisma()
  // DB requires non-null String; empty description always falls back to name.
  const description = input.description.trim() || input.name

  const promotion = await prisma.promotion.create({
    data: {
      name: input.name,
      type: input.type,
      value: toMoney(input.value),
      minPurchase: toMoney(input.minPurchase),
      description,
      active: input.active,
      startsAt: input.startsAt ? new Date(input.startsAt) : null,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      createdByUsername: actor.username
    }
  })

  await syncPromotionProducts(promotion.id, input.type, input.productIds, input.bundleItems)

  await prisma.systemActionLog.create({
    data: {
      actorAuthUserId: actor.userId,
      actorUsername: actor.username,
      actorRole: actor.role,
      action: 'finance.promotion.create',
      entityType: 'Promotion',
      entityId: promotion.id,
      status: 'success',
      metadata: {
        name: promotion.name,
        type: promotion.type,
        value: Number(promotion.value),
        productCount: input.productIds.length,
        bundleCount: input.bundleItems.length
      }
    }
  })

  const full = await prisma.promotion.findUniqueOrThrow({
    where: { id: promotion.id },
    include: promotionInclude
  })
  return mapPromotion(full)
}

export const updatePromotion = async (id: string, rawInput: unknown, actor: AuthenticatedActor) => {
  const input: UpdatePromotionInput = updatePromotionSchema.parse(rawInput)
  const prisma = await getPrisma()

  const existing = await prisma.promotion.findUnique({ where: { id } })
  if (!existing) {
    throw new Error('PROMOTION_NOT_FOUND')
  }

  const nextName = input.name?.trim() || existing.name
  const nextDescription =
    input.description === undefined
      ? undefined
      : input.description.trim() || nextName

  const promotion = await prisma.promotion.update({
    where: { id },
    data: {
      name: input.name,
      type: input.type,
      value: input.value === undefined ? undefined : toMoney(input.value),
      minPurchase: input.minPurchase === undefined ? undefined : toMoney(input.minPurchase),
      description: nextDescription,
      active: input.active,
      startsAt:
        input.startsAt === undefined
          ? undefined
          : input.startsAt === null
            ? null
            : new Date(input.startsAt),
      expiresAt:
        input.expiresAt === undefined
          ? undefined
          : input.expiresAt === null
            ? null
            : new Date(input.expiresAt)
    }
  })

  if (input.productIds || input.bundleItems || input.type) {
    await syncPromotionProducts(
      promotion.id,
      input.type || promotion.type,
      input.productIds || [],
      input.bundleItems || []
    )
  }

  await prisma.systemActionLog.create({
    data: {
      actorAuthUserId: actor.userId,
      actorUsername: actor.username,
      actorRole: actor.role,
      action: 'finance.promotion.update',
      entityType: 'Promotion',
      entityId: promotion.id,
      status: 'success',
      metadata: {
        active: promotion.active,
        type: promotion.type
      }
    }
  })

  const full = await prisma.promotion.findUniqueOrThrow({
    where: { id: promotion.id },
    include: promotionInclude
  })
  return mapPromotion(full)
}

export const deletePromotion = async (id: string, actor: AuthenticatedActor) => {
  const prisma = await getPrisma()
  const existing = await prisma.promotion.findUnique({ where: { id } })
  if (!existing) {
    throw new Error('PROMOTION_NOT_FOUND')
  }

  await prisma.promotion.delete({ where: { id } })
  await prisma.systemActionLog.create({
    data: {
      actorAuthUserId: actor.userId,
      actorUsername: actor.username,
      actorRole: actor.role,
      action: 'finance.promotion.delete',
      entityType: 'Promotion',
      entityId: id,
      status: 'success',
      metadata: { name: existing.name }
    }
  })

  return { id }
}
