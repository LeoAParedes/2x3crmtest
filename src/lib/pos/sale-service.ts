import crypto from 'node:crypto'

import type { AuthenticatedActor } from '@/src/lib/security/api-auth'
import { calculateSaleTotals, createSaleSchema, type CreateSaleInput } from '@/src/lib/pos/sale-schema'
import { getPrisma } from '@/src/lib/db/prisma'

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

export const createSale = async (rawInput: unknown, actor: AuthenticatedActor) => {
  const input = createSaleSchema.parse(rawInput)
  const items = normalizeSaleItems(input.items)
  const prisma = await getPrisma()

  return prisma.$transaction(async transaction => {
    const inventory = await transaction.inventoryItem.findMany({
      where: { id: { in: items.map(item => item.inventoryItemId) } }
    })
    if (inventory.length !== items.length) {
      throw new Error('INVENTORY_ITEM_NOT_FOUND')
    }

    const lines = items.map(item => {
      const product = inventory.find(candidate => candidate.id === item.inventoryItemId)
      if (!product) throw new Error('INVENTORY_ITEM_NOT_FOUND')
      return {
        ...item,
        sku: product.sku,
        productName: product.productName,
        unitPrice: Number(product.unitPrice),
        lineTotal: Number(
          (
            Number(product.unitPrice) * (item.unitMode === 'weight' ? Number((item.quantity / 1000).toFixed(3)) : item.quantity)
          ).toFixed(2)
        )
      }
    })
    const totals = calculateSaleTotals(lines)
    validateCashPayment(input.paymentMethod, totals.total, input.amountReceived)

    for (const item of items) {
      const updated = await transaction.inventoryItem.updateMany({
        where: {
          id: item.inventoryItemId,
          stock: { gte: item.quantity }
        },
        data: { stock: { decrement: item.quantity } }
      })
      if (updated.count !== 1) {
        throw new Error('INSUFFICIENT_STOCK')
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
          saleNumber: sale.saleNumber,
          itemCount: sale.items.length,
          paymentMethod: sale.paymentMethod
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
      items: lines.map(line => ({
        sku: line.sku,
        productName: line.productName,
        quantity: line.quantity,
        unitMode: line.unitMode,
        unitPrice: line.unitPrice,
        lineTotal: line.lineTotal
      }))
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
