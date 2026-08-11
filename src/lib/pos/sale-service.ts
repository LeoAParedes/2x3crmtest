import crypto from 'node:crypto'

import type { AuthenticatedActor } from '@/src/lib/security/api-auth'
import {
  calculateLineTotal,
  calculateSaleTotals,
  createSaleSchema,
  type CreateSaleInput
} from '@/src/lib/pos/sale-schema'
import { getPrisma } from '@/src/lib/db/prisma'
import { summarizeSaleQuantities } from '@/src/lib/inventory/logbook-quantity'
import { applyDueScheduledPrices } from '@/src/lib/inventory/scheduled-prices'
import { ensureCanonicalWeightStocks } from '@/src/lib/inventory/normalize-weight-stock'
import { hasSufficientStock, inferWeightSupport } from '@/src/lib/inventory/weight-units'
import type { TicketSale } from '@/src/lib/pos/ticket-format'

export const normalizeSaleItems = (items: CreateSaleInput['items']) => {
  const quantities = new Map<string, { inventoryItemId: string; quantity: number; unitMode: 'piece' | 'weight' }>()
  for (const item of items) {
    const key = `${item.inventoryItemId}:${item.unitMode}`
    const current = quantities.get(key)
    if (!current) {
      quantities.set(key, { inventoryItemId: item.inventoryItemId, quantity: item.quantity, unitMode: item.unitMode })
      continue
    }
    quantities.set(key, { ...current, quantity: current.quantity + item.quantity })
  }
  return Array.from(quantities.values())
}

export const validateCashPayment = (
  paymentMethod: CreateSaleInput['paymentMethod'],
  total: number,
  amountReceived?: number
) => {
  if (paymentMethod === 'cash' && (amountReceived === undefined || amountReceived < total)) {
    throw new Error('INSUFFICIENT_PAYMENT')
  }
}

const calculateChangeDue = (paymentMethod: CreateSaleInput['paymentMethod'], total: number, amountReceived?: number) => {
  if (paymentMethod !== 'cash') return 0
  const normalizedAmountReceived = Number((amountReceived || 0).toFixed(2))
  return Number((normalizedAmountReceived - total).toFixed(2))
}

export class InsufficientStockError extends Error {
  readonly code = 'INSUFFICIENT_STOCK'
  readonly skus: string[]

  constructor(skus: string[]) {
    const uniqueSkus = [...new Set(skus.filter(Boolean))]
    const skuSuffix = uniqueSkus.length > 0 ? ` (${uniqueSkus.join(', ')})` : ''
    super(`INSUFFICIENT_STOCK${skuSuffix}`)
    this.name = 'InsufficientStockError'
    this.skus = uniqueSkus
  }
}

export const assertStockAvailability = (
  items: Array<{ inventoryItemId: string; quantity: number; unitMode: 'piece' | 'weight' }>,
  inventory: Array<{ id: string; sku: string; stock: number; category: string; aisle: string | null }>
) => {
  const missingSkus: string[] = []
  for (const item of items) {
    const product = inventory.find(candidate => candidate.id === item.inventoryItemId)
    if (!product) {
      missingSkus.push(item.inventoryItemId)
      continue
    }
    if (!hasSufficientStock(product.stock, item.quantity)) {
      missingSkus.push(product.sku)
    }
  }
  if (missingSkus.length > 0) {
    throw new InsufficientStockError(missingSkus)
  }
}

export const createSale = async (rawInput: unknown, actor: AuthenticatedActor) => {
  const input = createSaleSchema.parse(rawInput)
  const items = normalizeSaleItems(input.items)
  const prisma = await getPrisma()
  await applyDueScheduledPrices(prisma)
  await ensureCanonicalWeightStocks(prisma, {
    userId: actor.userId,
    username: actor.username,
    role: actor.role
  })

  return prisma.$transaction(async transaction => {
    const uniqueIds = [...new Set(items.map(item => item.inventoryItemId))]
    const inventory = await transaction.inventoryItem.findMany({
      where: { id: { in: uniqueIds } }
    })
    if (inventory.length !== uniqueIds.length) {
      throw new Error('INVENTORY_ITEM_NOT_FOUND')
    }

    for (const item of items) {
      const product = inventory.find(candidate => candidate.id === item.inventoryItemId)
      if (!product) throw new Error('INVENTORY_ITEM_NOT_FOUND')
      const supportsWeight = inferWeightSupport(product.category, product.aisle)
      if (item.unitMode === 'weight' && !supportsWeight) {
        throw new Error('INVENTORY_ITEM_NOT_FOUND')
      }
    }

    assertStockAvailability(items, inventory)

    const lines = items.map(item => {
      const product = inventory.find(candidate => candidate.id === item.inventoryItemId)
      if (!product) throw new Error('INVENTORY_ITEM_NOT_FOUND')
      return {
        ...item,
        sku: product.sku,
        productName: product.productName,
        unitPrice: Number(product.unitPrice),
        lineTotal: calculateLineTotal(item.quantity, Number(product.unitPrice), item.unitMode)
      }
    })
    const totals = calculateSaleTotals(lines)
    validateCashPayment(input.paymentMethod, totals.total, input.amountReceived)

    for (const item of items) {
      const product = inventory.find(candidate => candidate.id === item.inventoryItemId)
      const updated = await transaction.inventoryItem.updateMany({
        where: {
          id: item.inventoryItemId,
          stock: { gte: item.quantity }
        },
        data: { stock: { decrement: item.quantity } }
      })
      if (updated.count !== 1) {
        throw new InsufficientStockError(product ? [product.sku] : [])
      }
    }

    const saleNumber = `SALE-${Date.now()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`
    const normalizedAmountReceived =
      input.paymentMethod === 'cash' && input.amountReceived !== undefined ? Number(input.amountReceived.toFixed(2)) : null
    const changeDue = calculateChangeDue(input.paymentMethod, totals.total, input.amountReceived)

    const sale = await transaction.sale.create({
      data: {
        saleNumber,
        cashierProfileId: actor.profileId,
        cashierAuthUserId: actor.userId,
        cashierUsername: actor.username,
        subtotal: totals.subtotal,
        tax: totals.tax,
        total: totals.total,
        paymentMethod: input.paymentMethod,
        amountReceived: normalizedAmountReceived,
        items: {
          create: lines.map(line => ({
            inventoryItemId: line.inventoryItemId,
            sku: line.sku,
            productName: line.productName,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            lineTotal: line.lineTotal
          }))
        }
      },
      include: { items: true }
    })

    await transaction.inventoryMovement.createMany({
      data: lines.map(line => ({
        inventoryItemId: line.inventoryItemId,
        movementType: 'sale',
        quantity: -line.quantity,
        reason: sale.saleNumber
      }))
    })
    const quantitySummary = summarizeSaleQuantities(lines)
    const ticketItems = lines.map(line => ({
      sku: line.sku,
      productName: line.productName,
      quantity: line.quantity,
      unitMode: line.unitMode,
      unitPrice: line.unitPrice,
      lineTotal: line.lineTotal
    }))

    await transaction.systemActionLog.create({
      data: {
        actorAuthUserId: actor.userId,
        actorUsername: actor.username,
        actorRole: actor.role,
        action: 'sale.create',
        entityType: 'Sale',
        entityId: sale.id,
        status: 'success',
        metadata: {
          saleId: sale.id,
          saleNumber: sale.saleNumber,
          itemCount: sale.items.length,
          pieceCount: quantitySummary.pieceCount,
          weightGrams: quantitySummary.weightGrams,
          paymentMethod: sale.paymentMethod,
          subtotal: Number(sale.subtotal),
          tax: Number(sale.tax),
          total: Number(sale.total),
          amountReceived: normalizedAmountReceived,
          changeDue,
          cashierUsername: sale.cashierUsername,
          createdAt: sale.createdAt.toISOString(),
          items: ticketItems
        }
      }
    })

    return {
      id: sale.id,
      saleNumber: sale.saleNumber,
      cashierUsername: sale.cashierUsername,
      subtotal: Number(sale.subtotal),
      tax: Number(sale.tax),
      total: Number(sale.total),
      paymentMethod: sale.paymentMethod,
      amountReceived: sale.amountReceived === null ? null : Number(sale.amountReceived),
      changeDue,
      createdAt: sale.createdAt.toISOString(),
      items: ticketItems
    }
  })
}

export const listSales = async (actor: AuthenticatedActor) => {
  const prisma = await getPrisma()
  const sales = await prisma.sale.findMany({
    where: actor.role === 'cashier' ? { cashierAuthUserId: actor.userId } : undefined,
    orderBy: { createdAt: 'desc' },
    take: 100
  })
  return sales.map(sale => ({
    id: sale.id,
    saleNumber: sale.saleNumber,
    cashierUsername: sale.cashierUsername,
    total: Number(sale.total),
    paymentMethod: sale.paymentMethod,
    createdAt: sale.createdAt.toISOString()
  }))
}

export const getSaleTicket = async (saleId: string, actor: AuthenticatedActor): Promise<TicketSale | null> => {
  const prisma = await getPrisma()
  const sale = await prisma.sale.findFirst({
    where: {
      id: saleId,
      ...(actor.role === 'cashier' ? { cashierAuthUserId: actor.userId } : {})
    },
    include: {
      items: {
        include: {
          inventoryItem: {
            select: {
              category: true,
              aisle: true
            }
          }
        }
      }
    }
  })

  if (!sale) return null

  const amountReceived = sale.amountReceived === null ? null : Number(sale.amountReceived)
  const total = Number(sale.total)
  const changeDue =
    sale.paymentMethod === 'cash' && amountReceived !== null
      ? Number((amountReceived - total).toFixed(2))
      : 0

  return {
    saleNumber: sale.saleNumber,
    createdAt: sale.createdAt.toISOString(),
    cashierUsername: sale.cashierUsername,
    items: sale.items.map(item => {
      const supportsWeight = inferWeightSupport(item.inventoryItem.category, item.inventoryItem.aisle)
      return {
        sku: item.sku,
        productName: item.productName,
        quantity: item.quantity,
        unitMode: supportsWeight ? 'weight' : 'piece',
        lineTotal: Number(item.lineTotal)
      }
    }),
    subtotal: Number(sale.subtotal),
    tax: Number(sale.tax),
    total,
    paymentMethod: sale.paymentMethod === 'card' ? 'card' : 'cash',
    amountReceived,
    changeDue
  }
}
