import { getPrisma } from '@/src/lib/db/prisma'
import {
  createPromotionSchema,
  updatePromotionSchema,
  type CreatePromotionInput,
  type UpdatePromotionInput
} from '@/src/lib/finance/promotions-schema'
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
  expiresAt: Date | null
  createdByUsername: string
  createdAt: Date
  updatedAt: Date
}) => ({
  id: promotion.id,
  name: promotion.name,
  type: promotion.type,
  value: toMoney(Number(promotion.value)),
  minPurchase: toMoney(Number(promotion.minPurchase)),
  description: promotion.description,
  active: promotion.active,
  expiresAt: promotion.expiresAt?.toISOString() ?? null,
  createdByUsername: promotion.createdByUsername,
  createdAt: promotion.createdAt.toISOString(),
  updatedAt: promotion.updatedAt.toISOString()
})

export const listPromotions = async () => {
  const prisma = await getPrisma()
  const promotions = await prisma.promotion.findMany({
    orderBy: [{ active: 'desc' }, { createdAt: 'desc' }]
  })
  return promotions.map(mapPromotion)
}

export const createPromotion = async (rawInput: unknown, actor: AuthenticatedActor) => {
  const input: CreatePromotionInput = createPromotionSchema.parse(rawInput)
  const prisma = await getPrisma()

  const promotion = await prisma.promotion.create({
    data: {
      name: input.name,
      type: input.type,
      value: toMoney(input.value),
      minPurchase: toMoney(input.minPurchase),
      description: input.description,
      active: input.active,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      createdByUsername: actor.username
    }
  })

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
        value: Number(promotion.value)
      }
    }
  })

  return mapPromotion(promotion)
}

export const updatePromotion = async (id: string, rawInput: unknown, actor: AuthenticatedActor) => {
  const input: UpdatePromotionInput = updatePromotionSchema.parse(rawInput)
  const prisma = await getPrisma()

  const existing = await prisma.promotion.findUnique({ where: { id } })
  if (!existing) {
    throw new Error('PROMOTION_NOT_FOUND')
  }

  const promotion = await prisma.promotion.update({
    where: { id },
    data: {
      name: input.name,
      type: input.type,
      value: input.value === undefined ? undefined : toMoney(input.value),
      minPurchase: input.minPurchase === undefined ? undefined : toMoney(input.minPurchase),
      description: input.description,
      active: input.active,
      expiresAt:
        input.expiresAt === undefined
          ? undefined
          : input.expiresAt === null
            ? null
            : new Date(input.expiresAt)
    }
  })

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
        name: promotion.name
      }
    }
  })

  return mapPromotion(promotion)
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
      metadata: {
        name: existing.name
      }
    }
  })
}
