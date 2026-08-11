import { ARCHIVED_AISLE, isLowStockItem } from '@/src/lib/inventory/low-stock'
import { findInventoryByQuery } from '@/src/lib/crm/services/inventory-service'
import {
  getFinanceDashboard,
  getInventorySnapshot,
  listRecentPosSales
} from '@/src/lib/finance/finance-service'
import { getPrisma } from '@/src/lib/db/prisma'
import { FINANCE_TIME_ZONE } from '@/src/lib/finance/period'
import { stampErpDbProvenance } from '@/src/lib/ai/erp-db-harness'
import { isErpToolId, type ErpFactToolId, type ErpToolId } from '@/src/lib/ai/erp-tool-ids'
import { ERP_TOOL_REGISTRY, resolvePeriod } from '@/src/lib/ai/erp-tool-registry'

export type ErpToolFactResult =
  | {
      toolId: ErpFactToolId
      ok: true
      facts: Record<string, unknown>
    }
  | {
      toolId: string
      ok: false
      error: string
    }

const executeSalesTotalToday = async () => {
  const dashboard = await getFinanceDashboard('day')
  const prisma = await getPrisma()
  const lastCompleted = await prisma.sale.findFirst({
    where: { status: 'completed' },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true, saleNumber: true, total: true }
  })

  return {
    currency: 'MXN',
    timeZone: FINANCE_TIME_ZONE,
    period: 'day',
    rangeStart: dashboard.range.start,
    rangeEnd: dashboard.range.end,
    totalSales: dashboard.salesTotals.day.total,
    ticketCount: dashboard.salesTotals.day.count,
    lastCompletedSale: lastCompleted
      ? {
          saleNumber: lastCompleted.saleNumber,
          total: Number(lastCompleted.total),
          createdAt: lastCompleted.createdAt.toISOString()
        }
      : null,
    note:
      dashboard.salesTotals.day.count === 0 && lastCompleted
        ? 'No hay ventas completed en el día local actual; la última venta completed está fuera de este rango (revisa period=week).'
        : undefined,
    source: 'Sale.status=completed'
  }
}

const executeSalesTotalPeriod = async (args: Record<string, unknown>) => {
  const period = resolvePeriod(args.period, 'day')
  const dashboard = await getFinanceDashboard(period)
  const bucket =
    period === 'day' ? dashboard.salesTotals.day : period === 'week' ? dashboard.salesTotals.week : dashboard.salesTotals.month

  return {
    currency: 'MXN',
    timeZone: FINANCE_TIME_ZONE,
    period,
    rangeStart: dashboard.range.start,
    rangeEnd: dashboard.range.end,
    totalSales: bucket.total,
    ticketCount: bucket.count,
    source: 'Sale.status=completed'
  }
}

const executeStockByProductSearch = async (args: Record<string, unknown>) => {
  const parsed = ERP_TOOL_REGISTRY.stock_by_product_search.inputSchema.parse(args)
  const items = (await findInventoryByQuery(String(parsed.query))).slice(0, 8)
  return {
    query: parsed.query,
    matchCount: items.length,
    items: items.map(item => ({
      sku: item.sku,
      name: item.name,
      category: item.category,
      stock: item.stock,
      price: item.price,
      aisle: item.aisle
    })),
    source: 'InventoryItem'
  }
}

const executeTopProductPeriod = async (args: Record<string, unknown>) => {
  const parsed = ERP_TOOL_REGISTRY.top_product_period.inputSchema.parse(args)
  const period = resolvePeriod(parsed.period, 'week')
  const limit = typeof parsed.limit === 'number' ? parsed.limit : 5
  const dashboard = await getFinanceDashboard(period)
  const products = dashboard.topProducts.slice(0, limit)

  return {
    currency: 'MXN',
    timeZone: FINANCE_TIME_ZONE,
    period,
    rangeStart: dashboard.range.start,
    rangeEnd: dashboard.range.end,
    products: products.map(product => ({
      rank: product.rank,
      sku: product.sku,
      productName: product.productName,
      quantity: product.quantity,
      quantityDisplay: product.quantityDisplay,
      revenue: product.revenue
    })),
    topProduct: products[0]
      ? {
          sku: products[0].sku,
          productName: products[0].productName,
          quantityDisplay: products[0].quantityDisplay,
          revenue: products[0].revenue
        }
      : null,
    source: 'SaleItem→Sale.completed'
  }
}

const executeCashFlowPeriod = async (args: Record<string, unknown>) => {
  const period = resolvePeriod(args.period, 'day')
  const dashboard = await getFinanceDashboard(period)
  return {
    currency: 'MXN',
    timeZone: FINANCE_TIME_ZONE,
    period,
    rangeStart: dashboard.range.start,
    rangeEnd: dashboard.range.end,
    ingresos: dashboard.cashFlow.ingresos,
    egresos: dashboard.cashFlow.egresos,
    ganancia: dashboard.cashFlow.ganancia,
    neto: dashboard.cashFlow.neto,
    gananciaNegative: dashboard.cashFlow.gananciaNegative,
    formula: 'ganancia = ingresos(Sale.total) - egresos(Expense.amount)',
    salesCount: dashboard.cashFlow.salesCount,
    expenseCount: dashboard.cashFlow.expenseCount
  }
}

const executeLowStockCount = async () => {
  const prisma = await getPrisma()
  const rows = await prisma.inventoryItem.findMany({
    where: {
      OR: [{ aisle: null }, { aisle: { not: ARCHIVED_AISLE } }]
    },
    select: {
      sku: true,
      productName: true,
      stock: true,
      minStock: true,
      category: true,
      aisle: true
    }
  })

  const lowStock = rows
    .filter(item => isLowStockItem(item))
    .sort((left, right) => left.stock - right.stock)

  return {
    timeZone: FINANCE_TIME_ZONE,
    lowStockCount: lowStock.length,
    inventoryCount: rows.length,
    samples: lowStock.slice(0, 10).map(item => ({
      sku: item.sku,
      name: item.productName,
      stock: item.stock,
      minStock: item.minStock,
      category: item.category
    })),
    rule: 'stock <= minStock AND aisle != __archived__'
  }
}

const executeExpensesTotalPeriod = async (args: Record<string, unknown>) => {
  const period = resolvePeriod(args.period, 'day')
  const dashboard = await getFinanceDashboard(period)
  return {
    currency: 'MXN',
    timeZone: FINANCE_TIME_ZONE,
    period,
    rangeStart: dashboard.range.start,
    rangeEnd: dashboard.range.end,
    totalExpenses: dashboard.cashFlow.egresos,
    expenseCount: dashboard.cashFlow.expenseCount,
    source: 'Expense.amount'
  }
}

const executeAverageTicketPeriod = async (args: Record<string, unknown>) => {
  const period = resolvePeriod(args.period, 'day')
  const dashboard = await getFinanceDashboard(period)
  return {
    currency: 'MXN',
    timeZone: FINANCE_TIME_ZONE,
    period,
    rangeStart: dashboard.range.start,
    rangeEnd: dashboard.range.end,
    averageTicket: dashboard.cashFlow.averageTicket,
    salesCount: dashboard.cashFlow.salesCount,
    totalSales: dashboard.cashFlow.ingresos
  }
}

const executeRecentPosSales = async (args: Record<string, unknown>) => {
  const period = resolvePeriod(args.period, 'day')
  const limit = typeof args.limit === 'number' ? args.limit : 8
  return listRecentPosSales(period, limit)
}

const executeInventorySnapshot = async () => getInventorySnapshot()

const executors: Record<ErpToolId, (args: Record<string, unknown>) => Promise<Record<string, unknown>>> = {
  sales_total_today: async () => executeSalesTotalToday(),
  sales_total_period: executeSalesTotalPeriod,
  stock_by_product_search: executeStockByProductSearch,
  top_product_period: executeTopProductPeriod,
  cash_flow_period: executeCashFlowPeriod,
  low_stock_count: async () => executeLowStockCount(),
  expenses_total_period: executeExpensesTotalPeriod,
  average_ticket_period: executeAverageTicketPeriod,
  recent_pos_sales: executeRecentPosSales,
  inventory_snapshot: async () => executeInventorySnapshot()
}

export const executeErpTool = async (
  toolName: string,
  rawArgs: unknown,
  allowedTools: ErpToolId[]
): Promise<ErpToolFactResult> => {
  if (!isErpToolId(toolName)) {
    return { toolId: toolName, ok: false, error: 'TOOL_NOT_WHITELISTED' }
  }

  if (!allowedTools.includes(toolName)) {
    return { toolId: toolName, ok: false, error: 'TOOL_DISABLED_BY_ADMIN' }
  }

  const definition = ERP_TOOL_REGISTRY[toolName]
  const parsedArgs = definition.inputSchema.safeParse(
    rawArgs && typeof rawArgs === 'object' && !Array.isArray(rawArgs) ? rawArgs : {}
  )

  if (!parsedArgs.success) {
    return {
      toolId: toolName,
      ok: false,
      error: `INVALID_PARAMS: ${parsedArgs.error.message}`
    }
  }

  try {
    const facts = stampErpDbProvenance(await executors[toolName](parsedArgs.data))
    return { toolId: toolName, ok: true, facts }
  } catch (error) {
    return {
      toolId: toolName,
      ok: false,
      error: error instanceof Error ? error.message : 'EXECUTION_FAILED'
    }
  }
}
