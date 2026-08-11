import { getPrisma } from '@/src/lib/db/prisma'
import {
  buildBucketLabels,
  FINANCE_TIME_ZONE,
  formatBucketKey,
  getAllPeriodBounds,
  getPeriodBounds,
  getRollingBounds,
  resolveSeriesPeriod,
  type CashFlowWindowDays,
  type FinancePeriod
} from '@/src/lib/finance/period'
import { createExpenseSchema, type CreateExpenseInput } from '@/src/lib/finance/expense-schema'
import { activeInventoryItemWhere, isLowStockItem } from '@/src/lib/inventory/low-stock'
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
    _sum: { total: true, discountTotal: true },
    _count: { _all: true }
  })

  return {
    total: toMoney(Number(result._sum.total || 0)),
    discountTotal: toMoney(Number(result._sum.discountTotal || 0)),
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

  return labels.map(label => {
    const ingresos = incomeMap.get(label) || 0
    const egresos = expenseMap.get(label) || 0
    const ganancia = toMoney(ingresos - egresos)
    return {
      label,
      ingresos,
      egresos,
      ganancia,
      /** Absolute value for chart Y axis (losses still plot upward). */
      gananciaPlot: Math.abs(ganancia),
      gananciaNegative: ganancia < 0
    }
  })
}

const pacificHourAndWeekday = (date: Date) => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: FINANCE_TIME_ZONE,
    hour: 'numeric',
    hourCycle: 'h23',
    weekday: 'short'
  })
  const parts = formatter.formatToParts(date)
  const hour = Number(parts.find(part => part.type === 'hour')?.value || 0)
  const weekday = parts.find(part => part.type === 'weekday')?.value || 'Mon'
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6
  }
  return { hour, day: weekdayMap[weekday] ?? 0 }
}

const formatQuantityDisplay = (quantity: number, unitMode: 'piece' | 'weight') => {
  if (unitMode === 'weight') {
    return `${gramsToKilograms(quantity).toFixed(3)} kg`
  }
  return `${quantity} pz`
}

const DAY_LABELS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

const buildTopProducts = async (start: Date, end: Date, limit = 10) => {
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
      sale: { select: { createdAt: true } },
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
    hourCounts: number[]
    dayCounts: number[]
  }

  const bySku = new Map<string, Acc>()

  for (const item of items) {
    const unitMode = inferWeightSupport(item.inventoryItem.category, item.inventoryItem.aisle)
      ? 'weight'
      : 'piece'
    const createdAt = item.sale.createdAt
    const { hour, day } = pacificHourAndWeekday(createdAt)
    const current = bySku.get(item.sku)
    if (!current) {
      const hourCounts = Array.from({ length: 24 }, () => 0)
      const dayCounts = Array.from({ length: 7 }, () => 0)
      hourCounts[hour] += item.quantity
      dayCounts[day] += item.quantity
      bySku.set(item.sku, {
        sku: item.sku,
        productName: item.productName,
        quantity: item.quantity,
        revenue: Number(item.lineTotal),
        unitMode,
        hourCounts,
        dayCounts
      })
      continue
    }

    current.quantity += item.quantity
    current.revenue = toMoney(current.revenue + Number(item.lineTotal))
    current.hourCounts[hour] += item.quantity
    current.dayCounts[day] += item.quantity
  }

  const peakIndex = (counts: number[]) => {
    let best = 0
    for (let index = 1; index < counts.length; index += 1) {
      if (counts[index] > counts[best]) best = index
    }
    return best
  }

  return Array.from(bySku.values())
    .sort((left, right) => right.quantity - left.quantity || right.revenue - left.revenue)
    .slice(0, limit)
    .map((row, index) => {
      const peakHour = peakIndex(row.hourCounts)
      const peakDay = peakIndex(row.dayCounts)
      return {
        rank: index + 1,
        sku: row.sku,
        productName: row.productName,
        quantity: row.quantity,
        quantityDisplay: formatQuantityDisplay(row.quantity, row.unitMode),
        unitMode: row.unitMode,
        revenue: toMoney(row.revenue),
        peakHour,
        peakHourLabel: `${String(peakHour).padStart(2, '0')}:00`,
        peakDay,
        peakDayLabel: DAY_LABELS[peakDay],
        insight: `Pico ${String(peakHour).padStart(2, '0')}:00 · ${DAY_LABELS[peakDay]}`
      }
    })
}

export const getFinanceDashboard = async (
  period: FinancePeriod,
  customRange?: { start: Date; end: Date }
) => {
  const now = new Date()
  const allBounds = getAllPeriodBounds(now)
  const selected = customRange || getPeriodBounds(period, now)
  const seriesPeriod = customRange ? resolveSeriesPeriod(selected.start, selected.end) : period

  const [daySales, weekSales, monthSales, periodIncome, periodExpenses, salesSeries, cashFlowSeries, topProducts] =
    await Promise.all([
      sumSalesInRange(allBounds.day.start, allBounds.day.end),
      sumSalesInRange(allBounds.week.start, allBounds.week.end),
      sumSalesInRange(allBounds.month.start, allBounds.month.end),
      sumSalesInRange(selected.start, selected.end),
      sumExpensesInRange(selected.start, selected.end),
      buildSalesSeries(seriesPeriod, selected.start, selected.end),
      buildCashFlowSeries(seriesPeriod, selected.start, selected.end),
      buildTopProducts(selected.start, selected.end)
    ])

  const averageTicket =
    periodIncome.count > 0 ? toMoney(periodIncome.total / periodIncome.count) : 0
  const ganancia = toMoney(periodIncome.total - periodExpenses.total)

  return {
    period,
    timeZone: FINANCE_TIME_ZONE,
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
      /** Alias histórico: neto === ganancia (ingresos − egresos). */
      neto: ganancia,
      ganancia,
      gananciaNegative: ganancia < 0,
      salesCount: periodIncome.count,
      expenseCount: periodExpenses.count,
      averageTicket
    },
    salesSeries,
    cashFlowSeries,
    topProducts,
    comparison: [
      { name: 'Ingresos', value: periodIncome.total },
      { name: 'Egresos', value: periodExpenses.total },
      {
        name: 'Ganancia',
        value: Math.abs(ganancia),
        signedValue: ganancia,
        negative: ganancia < 0
      }
    ]
  }
}

export type PeriodosDashboardInput = {
  /** Custom sales range from date picker; otherwise last 7 days. */
  salesRange?: { start: Date; end: Date }
  /** Preferred cash-flow / comparison window (default quincena = 15). */
  cashFlowDays?: CashFlowWindowDays
}

/** Periodos page: sales / cash-flow / leaderboard each use their own window. */
export const getPeriodosDashboard = async (input: PeriodosDashboardInput = {}) => {
  const now = new Date()
  const salesBounds = input.salesRange || getRollingBounds(7, now)
  const cashFlowDays = input.cashFlowDays || 15
  const cashFlowBounds = getRollingBounds(cashFlowDays, now)
  /** Natural last 31 days (may span two calendar months) — never month-to-date. */
  const leaderboardBounds = getRollingBounds(31, now)

  const salesSeriesPeriod = resolveSeriesPeriod(salesBounds.start, salesBounds.end)
  const cashFlowSeriesPeriod = resolveSeriesPeriod(cashFlowBounds.start, cashFlowBounds.end)

  const last7 = getRollingBounds(7, now)
  const last31 = leaderboardBounds

  const [
    salesTotals,
    salesSeries,
    cashIncome,
    cashExpenses,
    cashFlowSeries,
    topProducts,
    weekSales,
    monthSales,
    daySales
  ] = await Promise.all([
    sumSalesInRange(salesBounds.start, salesBounds.end),
    buildSalesSeries(salesSeriesPeriod, salesBounds.start, salesBounds.end),
    sumSalesInRange(cashFlowBounds.start, cashFlowBounds.end),
    sumExpensesInRange(cashFlowBounds.start, cashFlowBounds.end),
    buildCashFlowSeries(cashFlowSeriesPeriod, cashFlowBounds.start, cashFlowBounds.end),
    buildTopProducts(leaderboardBounds.start, leaderboardBounds.end),
    sumSalesInRange(last7.start, last7.end),
    sumSalesInRange(last31.start, last31.end),
    sumSalesInRange(getPeriodBounds('day', now).start, now)
  ])

  const averageTicket = cashIncome.count > 0 ? toMoney(cashIncome.total / cashIncome.count) : 0
  const ganancia = toMoney(cashIncome.total - cashExpenses.total)

  const cashFlowLabel =
    cashFlowDays === 15
      ? 'Últimos 15 días (quincena)'
      : cashFlowDays === 7
        ? 'Últimos 7 días'
        : 'Últimos 31 días'

  return {
    mode: 'periodos' as const,
    timeZone: FINANCE_TIME_ZONE,
    generatedAt: now.toISOString(),
    panels: {
      sales: {
        label: input.salesRange ? 'Rango seleccionado' : 'Últimos 7 días naturales',
        range: { start: salesBounds.start.toISOString(), end: salesBounds.end.toISOString() },
        totals: salesTotals,
        series: salesSeries
      },
      cashFlow: {
        label: cashFlowLabel,
        days: cashFlowDays,
        range: { start: cashFlowBounds.start.toISOString(), end: cashFlowBounds.end.toISOString() },
        ingresos: cashIncome.total,
        egresos: cashExpenses.total,
        neto: ganancia,
        ganancia,
        gananciaNegative: ganancia < 0,
        salesCount: cashIncome.count,
        expenseCount: cashExpenses.count,
        averageTicket,
        series: cashFlowSeries,
        comparison: [
          { name: 'Ingresos', value: cashIncome.total },
          { name: 'Egresos', value: cashExpenses.total },
          {
            name: 'Ganancia',
            value: Math.abs(ganancia),
            signedValue: ganancia,
            negative: ganancia < 0
          }
        ]
      },
      leaderboard: {
        label: 'Últimos 31 días naturales',
        range: {
          start: leaderboardBounds.start.toISOString(),
          end: leaderboardBounds.end.toISOString()
        },
        topProducts
      }
    },
    /** Compat cards: day = today; week = last 7 natural days; month = last 31 natural days */
    salesTotals: {
      day: daySales,
      week: weekSales,
      month: monthSales
    }
  }
}

export const listExpensesInRange = async (start: Date, end: Date) => {
  const prisma = await getPrisma()
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
    kind: expense.kind,
    spentAt: expense.spentAt.toISOString(),
    createdByUsername: expense.createdByUsername,
    createdAt: expense.createdAt.toISOString()
  }))
}

export const sumExpensesByCategoryInRange = async (
  category: string,
  start: Date,
  end: Date
) => {
  const prisma = await getPrisma()
  const result = await prisma.expense.aggregate({
    where: {
      category,
      spentAt: { gte: start, lte: end }
    },
    _sum: { amount: true },
    _count: { _all: true }
  })

  return {
    category,
    total: toMoney(Number(result._sum.amount || 0)),
    count: result._count._all
  }
}

export const listExpensesByCategoryInRange = async (
  category: string,
  start: Date,
  end: Date,
  limit = 20
) => {
  const prisma = await getPrisma()
  const take = Math.min(Math.max(limit, 1), 50)
  const expenses = await prisma.expense.findMany({
    where: {
      category,
      spentAt: { gte: start, lte: end }
    },
    orderBy: { spentAt: 'desc' },
    take
  })

  return expenses.map(expense => ({
    id: expense.id,
    category: expense.category,
    description: expense.description,
    amount: Number(expense.amount),
    kind: expense.kind,
    spentAt: expense.spentAt.toISOString(),
    createdByUsername: expense.createdByUsername
  }))
}

/** Active staff roster for “quién está en la nómina / personal”. */
export const listActiveStaffRoster = async () => {
  const prisma = await getPrisma()
  const profiles = await prisma.userProfile.findMany({
    where: { isActive: true },
    orderBy: [{ role: 'asc' }, { username: 'asc' }],
    select: {
      id: true,
      username: true,
      role: true,
      isActive: true,
      cashierGate: true,
      createdAt: true
    }
  })

  return profiles.map(profile => ({
    id: profile.id,
    username: profile.username,
    role: profile.role,
    isActive: profile.isActive,
    cashierGate: profile.cashierGate,
    createdAt: profile.createdAt.toISOString()
  }))
}

export const listExpenses = async (period: FinancePeriod) => {
  const { start, end } = getPeriodBounds(period)
  return listExpensesInRange(start, end)
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
      kind: input.kind,
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
        kind: expense.kind,
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
    kind: expense.kind,
    spentAt: expense.spentAt.toISOString(),
    createdByUsername: expense.createdByUsername,
    createdAt: expense.createdAt.toISOString()
  }
}

export const deleteExpense = async (id: string, actor: AuthenticatedActor) => {
  const prisma = await getPrisma()
  const existing = await prisma.expense.findUnique({ where: { id } })
  if (!existing) {
    throw new Error('EXPENSE_NOT_FOUND')
  }

  await prisma.expense.delete({ where: { id } })

  await prisma.systemActionLog.create({
    data: {
      actorAuthUserId: actor.userId,
      actorUsername: actor.username,
      actorRole: actor.role,
      action: 'finance.expense.delete',
      entityType: 'Expense',
      entityId: id,
      status: 'success',
      metadata: {
        category: existing.category,
        amount: Number(existing.amount)
      }
    }
  })
}

/** Recent completed POS tickets (live DB) for DavinciAi. */
export const listRecentPosSales = async (
  period: FinancePeriod,
  limit = 8,
  customRange?: { start: Date; end: Date }
) => {
  const prisma = await getPrisma()
  const { start, end } = customRange || getPeriodBounds(period)
  const take = Math.min(Math.max(limit, 1), 20)

  const sales = await prisma.sale.findMany({
    where: {
      status: COMPLETED_SALE,
      createdAt: { gte: start, lte: end }
    },
    orderBy: { createdAt: 'desc' },
    take,
    select: {
      saleNumber: true,
      total: true,
      tax: true,
      subtotal: true,
      paymentMethod: true,
      createdAt: true,
      cashierUsername: true,
      items: {
        select: {
          sku: true,
          productName: true,
          quantity: true,
          lineTotal: true
        }
      }
    }
  })

  return {
    timeZone: FINANCE_TIME_ZONE,
    period,
    rangeStart: start.toISOString(),
    rangeEnd: end.toISOString(),
    count: sales.length,
    sales: sales.map(sale => ({
      saleNumber: sale.saleNumber,
      total: toMoney(Number(sale.total)),
      tax: toMoney(Number(sale.tax)),
      subtotal: toMoney(Number(sale.subtotal)),
      paymentMethod: sale.paymentMethod,
      cashierUsername: sale.cashierUsername,
      createdAt: sale.createdAt.toISOString(),
      itemCount: sale.items.length,
      items: sale.items.map(item => ({
        sku: item.sku,
        productName: item.productName,
        quantity: item.quantity,
        lineTotal: toMoney(Number(item.lineTotal))
      }))
    }))
  }
}

/** Inventory SKU/stock snapshot for DavinciAi (efficient aggregates + low-stock sample). */
export const getInventorySnapshot = async () => {
  const prisma = await getPrisma()
  const activeWhere = activeInventoryItemWhere
  const [aggregates, rows] = await Promise.all([
    prisma.inventoryItem.aggregate({
      where: activeWhere,
      _count: { _all: true },
      _sum: { stock: true }
    }),
    prisma.inventoryItem.findMany({
      where: activeWhere,
      select: {
        sku: true,
        productName: true,
        stock: true,
        minStock: true,
        category: true,
        unitPrice: true,
        aisle: true
      },
      orderBy: { sku: 'asc' }
    })
  ])

  const lowStock = rows
    .filter(item => isLowStockItem(item))
    .sort((left, right) => left.stock - right.stock)

  return {
    timeZone: FINANCE_TIME_ZONE,
    skuCount: aggregates._count._all,
    totalUnits: Number(aggregates._sum.stock || 0),
    lowStockCount: lowStock.length,
    lowStockSamples: lowStock.slice(0, 12).map(item => ({
      sku: item.sku,
      name: item.productName,
      stock: item.stock,
      minStock: item.minStock,
      category: item.category,
      unitPrice: toMoney(Number(item.unitPrice))
    })),
    /** Compact catalog for the agent (cap to keep tokens low). */
    catalogSample: rows.slice(0, 40).map(item => ({
      sku: item.sku,
      name: item.productName,
      stock: item.stock,
      minStock: item.minStock,
      category: item.category
    }))
  }
}
