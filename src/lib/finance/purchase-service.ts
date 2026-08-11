import { z } from 'zod'

import { getPrisma } from '@/src/lib/db/prisma'
import { FINANCE_TIME_ZONE, getTimeZoneParts } from '@/src/lib/finance/period'
import { calculateWeightedAveragePrice } from '@/src/lib/inventory/valuation'
import { inferWeightSupport } from '@/src/lib/inventory/weight-units'
import { parseExpiresOnInput } from '@/src/lib/inventory/lot-service'
import type { AuthenticatedActor } from '@/src/lib/security/api-auth'

const toBusinessIsoDate = (date: Date) => {
  const parts = getTimeZoneParts(date, FINANCE_TIME_ZONE)
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
}

const toMoney = (value: number) => Number(value.toFixed(2))

export const createSupplierSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(40).optional().or(z.literal('')),
  email: z.string().trim().email().optional().or(z.literal('')),
  notes: z.string().trim().max(400).optional().or(z.literal('')),
  creditLimit: z.number().min(0).max(1_000_000).optional()
})

export const purchaseEntrySchema = z.object({
  inventoryItemId: z.string().min(1),
  supplierId: z.string().min(1).optional(),
  newSupplierName: z.string().trim().min(2).max(120).optional(),
  quantity: z.number().int().positive().max(1_000_000),
  unitCost: z.number().positive().max(1_000_000),
  paymentStatus: z.enum(['paid', 'credit']),
  soldByName: z.string().trim().max(120).optional().or(z.literal('')),
  reason: z.string().trim().min(2).max(240).default('Compra a proveedor'),
  expiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
})

export type PurchaseEntryInput = z.infer<typeof purchaseEntrySchema>

export const listSuppliers = async (query?: string) => {
  const prisma = await getPrisma()
  const suppliers = await prisma.supplier.findMany({
    where: {
      isActive: true,
      ...(query?.trim()
        ? { name: { contains: query.trim(), mode: 'insensitive' as const } }
        : {})
    },
    orderBy: { name: 'asc' },
    take: 100
  })

  return suppliers.map(supplier => ({
    id: supplier.id,
    name: supplier.name,
    phone: supplier.phone,
    email: supplier.email,
    creditLimit: Number(supplier.creditLimit),
    openBalance: Number(supplier.openBalance),
    isActive: supplier.isActive
  }))
}

export const createSupplier = async (rawInput: unknown, actor: AuthenticatedActor) => {
  const input = createSupplierSchema.parse(rawInput)
  const prisma = await getPrisma()
  const supplier = await prisma.supplier.create({
    data: {
      name: input.name,
      phone: input.phone || null,
      email: input.email || null,
      notes: input.notes || null,
      creditLimit: input.creditLimit ?? 0
    }
  })

  await prisma.systemActionLog.create({
    data: {
      actorAuthUserId: actor.userId,
      actorUsername: actor.username,
      actorRole: actor.role,
      action: 'finance.supplier.create',
      entityType: 'Supplier',
      entityId: supplier.id,
      status: 'success',
      metadata: { name: supplier.name }
    }
  })

  return {
    id: supplier.id,
    name: supplier.name,
    phone: supplier.phone,
    email: supplier.email,
    creditLimit: Number(supplier.creditLimit),
    openBalance: Number(supplier.openBalance),
    isActive: supplier.isActive
  }
}

export const listRecentPurchases = async (limit = 20) => {
  const prisma = await getPrisma()
  const purchases = await prisma.purchase.findMany({
    orderBy: { purchasedAt: 'desc' },
    take: Math.min(Math.max(limit, 1), 50),
    include: {
      supplier: { select: { id: true, name: true, openBalance: true } },
      inventoryItem: { select: { sku: true, productName: true, category: true, aisle: true } }
    }
  })

  return purchases.map(purchase => ({
    id: purchase.id,
    quantity: purchase.quantity,
    unitCost: Number(purchase.unitCost),
    totalAmount: Number(purchase.totalAmount),
    paymentStatus: purchase.paymentStatus,
    soldByName: purchase.soldByName,
    expiresOn: purchase.expiresOn ? toBusinessIsoDate(purchase.expiresOn) : null,
    purchasedAt: purchase.purchasedAt.toISOString(),
    createdByUsername: purchase.createdByUsername,
    supplier: {
      id: purchase.supplier.id,
      name: purchase.supplier.name,
      openBalance: Number(purchase.supplier.openBalance)
    },
    product: {
      sku: purchase.inventoryItem.sku,
      productName: purchase.inventoryItem.productName,
      supportsWeight: inferWeightSupport(purchase.inventoryItem.category, purchase.inventoryItem.aisle)
    }
  }))
}

export const createPurchaseEntry = async (rawInput: unknown, actor: AuthenticatedActor) => {
  const input = purchaseEntrySchema.parse(rawInput)
  if (!input.supplierId && !input.newSupplierName) {
    throw new Error('SUPPLIER_REQUIRED')
  }

  const expiresOn = parseExpiresOnInput(input.expiresOn)
  const prisma = await getPrisma()
  const totalAmount = toMoney(input.quantity * input.unitCost)

  const result = await prisma.$transaction(async transaction => {
    let supplierId = input.supplierId
    if (!supplierId && input.newSupplierName) {
      const createdSupplier = await transaction.supplier.create({
        data: { name: input.newSupplierName }
      })
      supplierId = createdSupplier.id
    }

    if (!supplierId) {
      throw new Error('SUPPLIER_REQUIRED')
    }

    const supplier = await transaction.supplier.findUnique({ where: { id: supplierId } })
    if (!supplier || !supplier.isActive) {
      throw new Error('SUPPLIER_NOT_FOUND')
    }

    const item = await transaction.inventoryItem.findUnique({ where: { id: input.inventoryItemId } })
    if (!item) {
      throw new Error('INVENTORY_ITEM_NOT_FOUND')
    }

    const nextUnitPrice = calculateWeightedAveragePrice({
      currentStock: item.stock,
      currentUnitPrice: Number(item.unitPrice),
      incomingQuantity: input.quantity,
      incomingUnitCost: input.unitCost
    })

    const updatedItem = await transaction.inventoryItem.update({
      where: { id: item.id },
      data: {
        stock: { increment: input.quantity },
        unitPrice: nextUnitPrice
      }
    })

    const movement = await transaction.inventoryMovement.create({
      data: {
        inventoryItemId: item.id,
        movementType: 'entry',
        quantity: input.quantity,
        reason: JSON.stringify({
          reason: input.reason,
          unitCost: input.unitCost,
          valuationMethod: 'average',
          source: 'purchase',
          supplierId,
          paymentStatus: input.paymentStatus,
          expiresOn: input.expiresOn
        })
      }
    })

    await transaction.productSupplier.upsert({
      where: {
        inventoryItemId_supplierId: {
          inventoryItemId: item.id,
          supplierId
        }
      },
      create: {
        inventoryItemId: item.id,
        supplierId,
        lastUnitCost: input.unitCost,
        isPreferred: true
      },
      update: {
        lastUnitCost: input.unitCost
      }
    })

    let expenseId: string | null = null
    if (input.paymentStatus === 'paid') {
      const expense = await transaction.expense.create({
        data: {
          category: 'proveedores',
          description: `Compra ${item.sku} · ${supplier.name}${input.soldByName ? ` · ${input.soldByName}` : ''}`,
          amount: totalAmount,
          kind: 'operating',
          createdByProfileId: actor.profileId,
          createdByUsername: actor.username
        }
      })
      expenseId = expense.id
    } else {
      await transaction.supplier.update({
        where: { id: supplierId },
        data: { openBalance: { increment: totalAmount } }
      })
    }

    const purchase = await transaction.purchase.create({
      data: {
        supplierId,
        inventoryItemId: item.id,
        quantity: input.quantity,
        unitCost: input.unitCost,
        totalAmount,
        paymentStatus: input.paymentStatus,
        soldByName: input.soldByName || null,
        reason: input.reason,
        expenseId,
        movementId: movement.id,
        expiresOn,
        createdByUsername: actor.username
      }
    })

    const lot = await transaction.inventoryLot.create({
      data: {
        purchaseId: purchase.id,
        inventoryItemId: item.id,
        quantityReceived: input.quantity,
        quantityRemaining: input.quantity,
        expiresOn,
        status: 'active'
      }
    })

    await transaction.systemActionLog.create({
      data: {
        actorAuthUserId: actor.userId,
        actorUsername: actor.username,
        actorRole: actor.role,
        action: 'finance.purchase.entry',
        entityType: 'Purchase',
        entityId: purchase.id,
        status: 'success',
        metadata: {
          supplierId,
          inventoryItemId: item.id,
          quantity: input.quantity,
          unitCost: input.unitCost,
          totalAmount,
          paymentStatus: input.paymentStatus,
          expenseId,
          movementId: movement.id,
          lotId: lot.id,
          expiresOn: input.expiresOn
        }
      }
    })

    const refreshedSupplier = await transaction.supplier.findUniqueOrThrow({ where: { id: supplierId } })

    return {
      purchase,
      item: updatedItem,
      supplier: refreshedSupplier,
      expenseId,
      lot
    }
  })

  return {
    id: result.purchase.id,
    paymentStatus: result.purchase.paymentStatus,
    quantity: result.purchase.quantity,
    unitCost: Number(result.purchase.unitCost),
    totalAmount: Number(result.purchase.totalAmount),
    expenseId: result.expenseId,
    expiresOn: input.expiresOn,
    lotId: result.lot.id,
    product: {
      id: result.item.id,
      sku: result.item.sku,
      productName: result.item.productName,
      stock: result.item.stock,
      unitPrice: Number(result.item.unitPrice)
    },
    supplier: {
      id: result.supplier.id,
      name: result.supplier.name,
      openBalance: Number(result.supplier.openBalance)
    }
  }
}
