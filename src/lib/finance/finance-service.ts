import { getPrisma } from '@/src/lib/db/prisma'
import {
  buildBucketLabels,
  formatBucketKey,
  getAllPeriodBounds,
  getPeriodBounds,
  type FinancePeriod
} from '@/src/lib/finance/period'
import { createExpenseSchema, type CreateExpenseInput } from '@/src/lib/finance/expense-schema'
import { gramsToKilograms, inferWeightSupport } from '@/src/lib/inventory/weight-units'
import type { AuthenticatedActor } from '@/src/lib/security/api-auth'

const COMPLETED_SALE = 'completed'

const toMoney = (value: number) => Number(value.toFixed(2))

const sumSalesInRange = async (start: Date, end: Date) => {
  const prisma = await getPrisma()
  const result = await prisma.sale.aggregate({
    where: {
      status: COMPLETED_SALE,
      createdAt: { gte: start, lte: end }
    },
    _sum: { total: true },
    _count: { _all: true }
  })

  return {
    total: toMoney(Number(result._sum.total || 0)),
    count: result._count._all
  }
}

const sumExpensesInRange = async (start: Date, end: Date) => {
  const prisma = await getPrisma()
  const result = await prisma.expense.aggregate({
    where: {
      spentAt: { gte: start, lte: end }
    },
    _sum: { amount: true },
    _count: { _all: true }
  })

  return {
    total: toMoney(Number(result._sum.amount || 0)),
    count: result._count._all
  }
}

const buildSalesSeries = async (period: FinancePeriod, start: Date, end: Date) => {
  const prisma = await getPrisma()
  const sales = await prisma.sale.findMany({
    where: {
      status: COMPLETED_SALE,
      createdAt: { gte: start, lte: end }
    },
    select: {
      total: true,
      createdAt: true
    },
    orderBy: { createdAt: 'asc' }
  })

  const labels = buildBucketLabels(period, start, end)
  const totals = new Map(labels.map(label => [label, 0]))

  for (const sale of sales) {
    const key = formatBucketKey(sale.createdAt, period)
    totals.set(key, toMoney((totals.get(key) || 0) + Number(sale.total)))
  }

  return labels.map(label => ({
    label,
    sales: totals.get(label) || 0
  }))
}

const buildCashFlowSeries = async (period: FinancePeriod, start: Date, end: Date) => {
  const prisma = await getPrisma()
  const [sales, expenses] = await Promise.all([
    prisma.sale.findMany({
      where: {
        status: COMPLETED_SALE,
        createdAt: { gte: start, lte: end }
      },
      select: { total: true, createdAt: true }
    }),
    prisma.expense.findMany({
      where: { spentAt: { gte: start, lte: end } },
      select: { amount: true, spentAt: true }
    })
  ])

  const labels = buildBucketLabels(period, start, end)
  const incomeMap = new Map(labels.map(label => [label, 0]))
  const expenseMap = new Map(labels.map(label => [label, 0]))

  for (const sale of sales) {
    const key = formatBucketKey(sale.createdAt, period)
    incomeMap.set(key, toMoney((incomeMap.get(key) || 0) + Number(sale.total)))
  }

  for (const expense of expenses) {
    const key = formatBucketKey(expense.spentAt, period)
    expenseMap.set(key, toMoney((expenseMap.get(key) || 0) + Number(expense.amount)))
  }

  return labels.map(label => ({
    label,
    ingresos: incomeMap.get(label) || 0,
    egresos: expenseMap.get(label) || 0
  }))
}

const formatQuantityDisplay = (quantity: number, unitMode: 'piece' | 'weight') => {
  if (unitMode === 'weight') {
    return `${gramsToKilograms(quantity).toFixed(3)} kg`
  }
  return `${quantity} pz`
}

const buildTopProducts = async (start: Date, end: Date, limit = 8) => {
  const prisma = await getPrisma()
  const items = await prisma.saleItem.findMany({
    where: {
      sale: {
        status: COMPLETED_SALE,
        createdAt: { gte: start, lte: end }
      }
    },
    select: {
      sku: true,
      productName: true,
      quantity: true,
      lineTotal: true,
      inventoryItem: {
        select: {
          category: true,
          aisle: true
        }
      }
    }
  })

  type Acc = {
    sku: string
    productName: string
    quantity: number
    revenue: number
    unitMode: 'piece' | 'weight'
  }

  const bySku = new Map<string, Acc>()

  for (const item of items) {
    const unitMode = inferWeightSupport(item.inventoryItem.category, item.inventoryItem.aisle)
      ? 'weight'
      : 'piece'
    const current = bySku.get(item.sku)
    if (!current) {
      bySku.set(item.sku, {
        sku: item.sku,
        productName: item.productName,
        quantity: item.quantity,
        revenue: Number(item.lineTotal),
        unitMode
      })
      continue
    }

    current.quantity += item.quantity
    current.revenue = toMoney(current.revenue + Number(item.lineTotal))
  }

  return Array.from(bySku.values())
    .sort((left, right) => right.revenue - left.revenue || right.quantity - left.quantity)
    .slice(0, limit)
    .map((row, index) => ({
      rank: index + 1,
      sku: row.sku,
      productName: row.productName,
      quantity: row.quantity,
      quantityDisplay: formatQuantityDisplay(row.quantity, row.unitMode),
      unitMode: row.unitMode,
      revenue: toMoney(row.revenue)
    }))
}

export const getFinanceDashboard = async (period: FinancePeriod) => {
  const now = new Date()
  const allBounds = getAllPeriodBounds(now)
  const selected = getPeriodBounds(period, now)

  const [daySales, weekSales, monthSales, periodIncome, periodExpenses, salesSeries, cashFlowSeries, topProducts] =
    await Promise.all([
      sumSalesInRange(allBounds.day.start, allBounds.day.end),
      sumSalesInRange(allBounds.week.start, allBounds.week.end),
      sumSalesInRange(allBounds.month.start, allBounds.month.end),
      sumSalesInRange(selected.start, selected.end),
      sumExpensesInRange(selected.start, selected.end),
      buildSalesSeries(period, selected.start, selected.end),
      buildCashFlowSeries(period, selected.start, selected.end),
      buildTopProducts(selected.start, selected.end)
    ])

  return {
    period,
    generatedAt: now.toISOString(),
    range: {
      start: selected.start.toISOString(),
      end: selected.end.toISOString()
    },
    salesTotals: {
      day: daySales,
      week: weekSales,
      month: monthSales
    },
    cashFlow: {
      ingresos: periodIncome.total,
      egresos: periodExpenses.total,
      neto: toMoney(periodIncome.total - periodExpenses.total),
      salesCount: periodIncome.count,
      expenseCount: periodExpenses.count
    },
    salesSeries,
    cashFlowSeries,
    topProducts,
    comparison: [
      { name: 'Ingresos', value: periodIncome.total },
      { name: 'Egresos', value: periodExpenses.total }
    ]
  }
}

export const listExpenses = async (period: FinancePeriod) => {
  const prisma = await getPrisma()
  const { start, end } = getPeriodBounds(period)
  const expenses = await prisma.expense.findMany({
    where: { spentAt: { gte: start, lte: end } },
    orderBy: { spentAt: 'desc' },
    take: 100
  })

  return expenses.map(expense => ({
    id: expense.id,
    category: expense.category,
    description: expense.description,
    amount: Number(expense.amount),
    spentAt: expense.spentAt.toISOString(),
    createdByUsername: expense.createdByUsername,
    createdAt: expense.createdAt.toISOString()
  }))
}

export const createExpense = async (rawInput: unknown, actor: AuthenticatedActor) => {
  const input: CreateExpenseInput = createExpenseSchema.parse(rawInput)
  const prisma = await getPrisma()
  const spentAt = input.spentAt ? new Date(input.spentAt) : new Date()

  const expense = await prisma.expense.create({
    data: {
      category: input.category,
      description: input.description,
      amount: input.amount,
      spentAt,
      createdByProfileId: actor.profileId,
      createdByUsername: actor.username
    }
  })

  await prisma.systemActionLog.create({
    data: {
      actorAuthUserId: actor.userId,
      actorUsername: actor.username,
      actorRole: actor.role,
      action: 'finance.expense.create',
      entityType: 'Expense',
      entityId: expense.id,
      status: 'success',
      metadata: {
        category: expense.category,
        amount: Number(expense.amount),
        spentAt: expense.spentAt.toISOString()
      }
    }
  })

  return {
    id: expense.id,
    category: expense.category,
    description: expense.description,
    amount: Number(expense.amount),
    spentAt: expense.spentAt.toISOString(),
    createdByUsername: expense.createdByUsername,
    createdAt: expense.createdAt.toISOString()
  }
}
