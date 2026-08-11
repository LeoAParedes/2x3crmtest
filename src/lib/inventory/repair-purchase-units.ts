import type { PrismaClient } from '@prisma/client'

import { calculateBillableAmount } from '@/src/lib/inventory/logbook-quantity'
import {
  GRAMS_PER_KG,
  inferWeightSupport,
  isLegacyKilogramStock
} from '@/src/lib/inventory/weight-units'

export const PURCHASE_UNITS_REPAIRED_ACTION = 'inventory.purchase_units.repaired'

type PrismaLike = Pick<
  PrismaClient,
  'purchase' | 'expense' | 'supplier' | 'inventoryLot' | 'inventoryItem' | 'systemActionLog'
>

export type PurchaseUnitRepairPlan = {
  purchaseId: string
  sku: string
  productName: string
  quantity: number
  unitCost: number
  previousTotal: number
  correctedTotal: number
  paymentStatus: string
  expenseId: string | null
  supplierId: string
  delta: number
}

export type LotScaleRepairPlan = {
  lotId: string
  inventoryItemId: string
  sku: string
  previousReceived: number
  previousRemaining: number
  nextReceived: number
  nextRemaining: number
}

export type PurchaseUnitRepairResult = {
  dryRun: boolean
  alreadyRepaired: boolean
  purchasePlans: PurchaseUnitRepairPlan[]
  lotPlans: LotScaleRepairPlan[]
  appliedPurchases: number
  appliedLots: number
}

const nearlyEqual = (left: number, right: number, tolerance = 0.05) => Math.abs(left - right) <= tolerance

/**
 * Diagnose weight purchases whose totalAmount was stored as grams × $/kg
 * instead of kg × $/kg. Only weight items (via inferWeightSupport) are candidates.
 */
export const diagnoseInflatedPurchaseTotals = async (prisma: PrismaLike) => {
  const purchases = await prisma.purchase.findMany({
    include: {
      inventoryItem: {
        select: { id: true, sku: true, productName: true, category: true, aisle: true }
      }
    },
    take: 5000
  })

  const plans: PurchaseUnitRepairPlan[] = []

  for (const purchase of purchases) {
    const supportsWeight = inferWeightSupport(
      purchase.inventoryItem.category,
      purchase.inventoryItem.aisle,
      purchase.inventoryItem.productName
    )
    if (!supportsWeight) continue

    const quantity = purchase.quantity
    const unitCost = Number(purchase.unitCost)
    const previousTotal = Number(purchase.totalAmount)
    if (!Number.isFinite(unitCost) || unitCost <= 0 || quantity <= 0) continue

    const rawGramsTotal = Number((quantity * unitCost).toFixed(2))
    const correctedTotal = calculateBillableAmount(quantity, unitCost, true)

    // Inflated only when stored total matches grams×cost and differs from kg×cost.
    if (!nearlyEqual(previousTotal, rawGramsTotal)) continue
    if (nearlyEqual(previousTotal, correctedTotal)) continue
    if (correctedTotal <= 0) continue
    // Quantity should look like gram storage (typically >= 1000 for >=1kg), but allow smaller packs.
    if (quantity < 100) continue

    plans.push({
      purchaseId: purchase.id,
      sku: purchase.inventoryItem.sku,
      productName: purchase.inventoryItem.productName,
      quantity,
      unitCost,
      previousTotal,
      correctedTotal,
      paymentStatus: purchase.paymentStatus,
      expenseId: purchase.expenseId,
      supplierId: purchase.supplierId,
      delta: Number((correctedTotal - previousTotal).toFixed(2))
    })
  }

  return plans
}

/**
 * When item.stock was normalized to grams but lots stayed in legacy kg integers,
 * scale matching active/exhausted lots ×1000 so FEFO/merma stays consistent.
 */
export const diagnoseLegacyLotScales = async (prisma: PrismaLike) => {
  const items = await prisma.inventoryItem.findMany({
    select: {
      id: true,
      sku: true,
      productName: true,
      category: true,
      aisle: true,
      stock: true,
      lots: {
        select: {
          id: true,
          quantityReceived: true,
          quantityRemaining: true,
          status: true
        }
      }
    },
    take: 5000
  })

  const plans: LotScaleRepairPlan[] = []

  for (const item of items) {
    const supportsWeight = inferWeightSupport(item.category, item.aisle, item.productName)
    if (!supportsWeight) continue
    if (item.lots.length === 0) continue

    const allLotsLookLegacy = item.lots.every(
      lot =>
        lot.quantityReceived > 0 &&
        lot.quantityReceived < GRAMS_PER_KG &&
        lot.quantityRemaining >= 0 &&
        lot.quantityRemaining <= lot.quantityReceived
    )
    if (!allLotsLookLegacy) continue

    const lotRemainingSum = item.lots.reduce((sum, lot) => sum + Math.max(0, lot.quantityRemaining), 0)
    const scaledRemainingSum = lotRemainingSum * GRAMS_PER_KG

    // Stock already in grams and roughly matches scaled lot remainders, OR stock itself still legacy.
    const stockMatchesScaled =
      item.stock >= GRAMS_PER_KG && nearlyEqual(item.stock, scaledRemainingSum, Math.max(50, item.stock * 0.05))
    const stockStillLegacy = isLegacyKilogramStock(item.stock, true)

    if (!stockMatchesScaled && !stockStillLegacy) continue

    for (const lot of item.lots) {
      if (lot.quantityReceived <= 0 || lot.quantityReceived >= GRAMS_PER_KG) continue
      plans.push({
        lotId: lot.id,
        inventoryItemId: item.id,
        sku: item.sku,
        previousReceived: lot.quantityReceived,
        previousRemaining: lot.quantityRemaining,
        nextReceived: lot.quantityReceived * GRAMS_PER_KG,
        nextRemaining: lot.quantityRemaining * GRAMS_PER_KG
      })
    }
  }

  return plans
}

export const repairPurchaseUnitInconsistencies = async (
  prisma: PrismaLike,
  options?: { dryRun?: boolean; force?: boolean }
): Promise<PurchaseUnitRepairResult> => {
  const dryRun = options?.dryRun !== false
  const force = Boolean(options?.force)

  if (!force) {
    const already = await prisma.systemActionLog.findFirst({
      where: { action: PURCHASE_UNITS_REPAIRED_ACTION },
      select: { id: true }
    })
    if (already) {
      return {
        dryRun,
        alreadyRepaired: true,
        purchasePlans: [],
        lotPlans: [],
        appliedPurchases: 0,
        appliedLots: 0
      }
    }
  }

  const purchasePlans = await diagnoseInflatedPurchaseTotals(prisma)
  const lotPlans = await diagnoseLegacyLotScales(prisma)

  if (dryRun) {
    return {
      dryRun: true,
      alreadyRepaired: false,
      purchasePlans,
      lotPlans,
      appliedPurchases: 0,
      appliedLots: 0
    }
  }

  let appliedPurchases = 0
  for (const plan of purchasePlans) {
    await prisma.purchase.update({
      where: { id: plan.purchaseId },
      data: { totalAmount: plan.correctedTotal }
    })

    if (plan.expenseId) {
      await prisma.expense.updateMany({
        where: { id: plan.expenseId },
        data: { amount: plan.correctedTotal }
      })
    }

    if (plan.paymentStatus === 'credit' && plan.delta !== 0) {
      await prisma.supplier.update({
        where: { id: plan.supplierId },
        data: { openBalance: { increment: plan.delta } }
      })
    }

    appliedPurchases += 1
  }

  let appliedLots = 0
  for (const plan of lotPlans) {
    await prisma.inventoryLot.update({
      where: { id: plan.lotId },
      data: {
        quantityReceived: plan.nextReceived,
        quantityRemaining: plan.nextRemaining
      }
    })
    appliedLots += 1
  }

  // If stock remained legacy kg while lots were scaled, bring stock to grams too.
  const lotItemIds = [...new Set(lotPlans.map(plan => plan.inventoryItemId))]
  for (const itemId of lotItemIds) {
    const item = await prisma.inventoryItem.findUnique({
      where: { id: itemId },
      select: { id: true, stock: true, minStock: true, category: true, aisle: true, productName: true }
    })
    if (!item) continue
    const supportsWeight = inferWeightSupport(item.category, item.aisle, item.productName)
    if (!isLegacyKilogramStock(item.stock, supportsWeight)) continue
    await prisma.inventoryItem.update({
      where: { id: item.id },
      data: {
        stock: item.stock * GRAMS_PER_KG,
        ...(isLegacyKilogramStock(item.minStock, true) ? { minStock: item.minStock * GRAMS_PER_KG } : {})
      }
    })
  }

  await prisma.systemActionLog.create({
    data: {
      actorAuthUserId: null,
      actorUsername: 'system',
      actorRole: 'admin',
      action: PURCHASE_UNITS_REPAIRED_ACTION,
      entityType: 'Purchase',
      entityId: 'purchase-units',
      status: 'success',
      metadata: {
        appliedPurchases,
        appliedLots,
        purchaseSample: purchasePlans.slice(0, 30),
        lotSample: lotPlans.slice(0, 30)
      }
    }
  })

  return {
    dryRun: false,
    alreadyRepaired: false,
    purchasePlans,
    lotPlans,
    appliedPurchases,
    appliedLots
  }
}
