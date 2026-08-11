import { z } from 'zod'

import { getPrisma } from '@/src/lib/db/prisma'
import {
  FINANCE_TIME_ZONE,
  getCustomBounds,
  getTimeZoneParts,
  zonedWallTimeToUtc
} from '@/src/lib/finance/period'
import { ARCHIVED_AISLE, isLowStockItem } from '@/src/lib/inventory/low-stock'
import type { AuthenticatedActor } from '@/src/lib/security/api-auth'

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const wasteLotSchema = z.object({
  lotId: z.string().min(1),
  quantity: z.number().int().positive().max(1_000_000),
  reason: z.string().trim().min(2).max(240).default('Merma por caducidad')
})

export type WasteLotInput = z.infer<typeof wasteLotSchema>

export type LotAlertKind = 'expiring' | 'expired'

export type InventoryLotView = {
  id: string
  purchaseId: string
  inventoryItemId: string
  sku: string
  productName: string
  quantityReceived: number
  quantityRemaining: number
  expiresOn: string
  status: string
  alertKind: LotAlertKind | null
}

const toIsoDate = (date: Date, timeZone = FINANCE_TIME_ZONE) => {
  const parts = getTimeZoneParts(date, timeZone)
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
}

export const parseExpiresOnInput = (isoDate: string, timeZone = FINANCE_TIME_ZONE) => {
  const parsed = isoDateSchema.parse(isoDate)
  const [year, month, day] = parsed.split('-').map(Number)
  const start = zonedWallTimeToUtc(year, month, day, 0, 0, 0, timeZone)
  const check = getTimeZoneParts(start, timeZone)
  if (check.year !== year || check.month !== month || check.day !== day) {
    throw new Error('INVALID_EXPIRY_DATE')
  }
  return start
}

const classifyLotAlert = (expiresOn: Date, now = new Date()): LotAlertKind | null => {
  const today = toIsoDate(now)
  const nowParts = getTimeZoneParts(now, FINANCE_TIME_ZONE)
  const tomorrowParts = getTimeZoneParts(
    zonedWallTimeToUtc(nowParts.year, nowParts.month, nowParts.day + 1, 12, 0, 0, FINANCE_TIME_ZONE),
    FINANCE_TIME_ZONE
  )
  const tomorrow = `${tomorrowParts.year}-${String(tomorrowParts.month).padStart(2, '0')}-${String(tomorrowParts.day).padStart(2, '0')}`
  const expiresIso = toIsoDate(expiresOn)

  if (expiresIso <= today) return 'expired'
  if (expiresIso === tomorrow) return 'expiring'
  return null
}

export const listActiveLots = async (inventoryItemId?: string) => {
  const prisma = await getPrisma()
  const lots = await prisma.inventoryLot.findMany({
    where: {
      quantityRemaining: { gt: 0 },
      status: 'active',
      inventoryItem: {
        OR: [{ aisle: null }, { aisle: { not: ARCHIVED_AISLE } }]
      },
      ...(inventoryItemId ? { inventoryItemId } : {})
    },
    orderBy: [{ expiresOn: 'asc' }, { receivedAt: 'asc' }],
    include: {
      inventoryItem: { select: { sku: true, productName: true, aisle: true } }
    },
    take: 500
  })

  return lots.map(lot => {
    const alertKind = classifyLotAlert(lot.expiresOn)
    return {
      id: lot.id,
      purchaseId: lot.purchaseId,
      inventoryItemId: lot.inventoryItemId,
      sku: lot.inventoryItem.sku,
      productName: lot.inventoryItem.productName,
      quantityReceived: lot.quantityReceived,
      quantityRemaining: lot.quantityRemaining,
      expiresOn: toIsoDate(lot.expiresOn),
      status: lot.status,
      alertKind
    } satisfies InventoryLotView
  })
}

export const listExpiryAlerts = async () => {
  const lots = await listActiveLots()
  return lots.filter(lot => lot.alertKind !== null)
}

export const listUnifiedWorkspaceAlerts = async () => {
  const prisma = await getPrisma()
  const [expiryAlerts, inventoryRows] = await Promise.all([
    listExpiryAlerts(),
    prisma.inventoryItem.findMany({
      where: {
        OR: [{ aisle: null }, { aisle: { not: ARCHIVED_AISLE } }]
      },
      select: { id: true, sku: true, productName: true, stock: true, minStock: true, aisle: true },
      take: 2000
    })
  ])

  const lowStock = inventoryRows
    .filter(item => isLowStockItem(item))
    .sort((left, right) => left.stock - right.stock)
    .slice(0, 50)
    .map(item => ({
      kind: 'low_stock' as const,
      id: item.id,
      sku: item.sku,
      productName: item.productName,
      stock: item.stock,
      minStock: item.minStock,
      href: '/inventario'
    }))

  const expiry = expiryAlerts.map(lot => ({
    kind: lot.alertKind === 'expired' ? ('expired' as const) : ('expiring' as const),
    id: lot.id,
    sku: lot.sku,
    productName: lot.productName,
    quantityRemaining: lot.quantityRemaining,
    expiresOn: lot.expiresOn,
    href: `/inventario/merma-caducidad?lotId=${lot.id}`
  }))

  return {
    timeZone: FINANCE_TIME_ZONE,
    lowStock,
    expiry,
    totalCount: lowStock.length + expiry.length
  }
}

export const wasteLotQuantity = async (rawInput: unknown, actor: AuthenticatedActor) => {
  const input = wasteLotSchema.parse(rawInput)
  const prisma = await getPrisma()

  const result = await prisma.$transaction(async transaction => {
    const lot = await transaction.inventoryLot.findUnique({
      where: { id: input.lotId },
      include: { inventoryItem: true }
    })

    if (!lot) {
      throw new Error('LOT_NOT_FOUND')
    }
    if (lot.status !== 'active' || lot.quantityRemaining <= 0) {
      throw new Error('LOT_NOT_ACTIVE')
    }
    if (input.quantity > lot.quantityRemaining) {
      throw new Error('LOT_INSUFFICIENT_QUANTITY')
    }
    if (input.quantity > lot.inventoryItem.stock) {
      throw new Error('INSUFFICIENT_STOCK')
    }

    const nextRemaining = lot.quantityRemaining - input.quantity
    const nextStatus = nextRemaining === 0 ? 'wasted' : 'active'

    const updatedLot = await transaction.inventoryLot.update({
      where: { id: lot.id },
      data: {
        quantityRemaining: nextRemaining,
        status: nextStatus
      }
    })

    const updatedItem = await transaction.inventoryItem.update({
      where: { id: lot.inventoryItemId },
      data: { stock: { decrement: input.quantity } }
    })

    const movement = await transaction.inventoryMovement.create({
      data: {
        inventoryItemId: lot.inventoryItemId,
        movementType: 'exit',
        quantity: input.quantity,
        reason: JSON.stringify({
          reason: input.reason,
          source: 'lot_waste',
          lotId: lot.id,
          expiresOn: toIsoDate(lot.expiresOn),
          valuationMethod: 'fefo'
        })
      }
    })

    await transaction.systemActionLog.create({
      data: {
        actorAuthUserId: actor.userId,
        actorUsername: actor.username,
        actorRole: actor.role,
        action: 'inventory.lot.waste',
        entityType: 'InventoryLot',
        entityId: lot.id,
        status: 'success',
        metadata: {
          quantity: input.quantity,
          remaining: nextRemaining,
          inventoryItemId: lot.inventoryItemId,
          movementId: movement.id,
          reason: input.reason
        }
      }
    })

    return { lot: updatedLot, item: updatedItem, movement }
  })

  return {
    lotId: result.lot.id,
    quantityRemaining: result.lot.quantityRemaining,
    status: result.lot.status,
    stock: result.item.stock,
    movementId: result.movement.id
  }
}

export const getLotDayBounds = (isoDate: string) => getCustomBounds(isoDate, isoDate)
