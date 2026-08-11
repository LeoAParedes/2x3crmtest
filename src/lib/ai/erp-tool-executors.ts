import { activeInventoryItemWhere, isLowStockItem } from '@/src/lib/inventory/low-stock'
import { findInventoryByQuery } from '@/src/lib/crm/services/inventory-service'
import {
  getFinanceDashboard,
  getInventorySnapshot,
  listActiveStaffRoster,
  listExpensesByCategoryInRange,
  listRecentPosSales,
  sumExpensesByCategoryInRange,
  sumProductSalesByQuery
} from '@/src/lib/finance/finance-service'
import { getPrisma } from '@/src/lib/db/prisma'
import { FINANCE_TIME_ZONE } from '@/src/lib/finance/period'
import { expenseCategoryLabels } from '@/src/lib/finance/expense-schema'
import { resolveAiDateRangeFromArgs } from '@/src/lib/ai/ai-date-range'
import { stampErpDbProvenance } from '@/src/lib/ai/erp-db-harness'
import { isErpToolId, type ErpFactToolId, type ErpToolId } from '@/src/lib/ai/erp-tool-ids'
import { ERP_TOOL_REGISTRY } from '@/src/lib/ai/erp-tool-registry'
import {
  aggregatePayrollPeopleFromExpenses,
  extractPayrollPersonName
} from '@/src/lib/ai/payroll-names'

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
  const range = resolveAiDateRangeFromArgs(args, 'day')
  const dashboard = await getFinanceDashboard(range.financePeriod, {
    start: range.start,
    end: range.end
  })

  return {
    currency: 'MXN',
    timeZone: FINANCE_TIME_ZONE,
    period: range.kind,
    periodLabel: range.label,
    rangeStart: dashboard.range.start,
    rangeEnd: dashboard.range.end,
    totalSales: dashboard.cashFlow.ingresos,
    ticketCount: dashboard.cashFlow.salesCount,
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

const executeProductSalesQuantity = async (args: Record<string, unknown>) => {
  const parsed = ERP_TOOL_REGISTRY.product_sales_quantity.inputSchema.parse(args)
  const range = resolveAiDateRangeFromArgs(parsed, 'month')
  const sales = await sumProductSalesByQuery(String(parsed.query), range.start, range.end)
  const top = sales.products[0] || null

  return {
    currency: 'MXN',
    timeZone: FINANCE_TIME_ZONE,
    query: sales.query,
    period: range.kind,
    periodLabel: range.label,
    rangeStart: range.start.toISOString(),
    rangeEnd: range.end.toISOString(),
    matchCount: sales.matchCount,
    quantity: sales.quantity,
    quantityDisplay: sales.quantityDisplay,
    unitMode: sales.unitMode,
    revenue: sales.revenue,
    lineCount: sales.lineCount,
    productName: top?.productName || null,
    sku: top?.sku || null,
    products: sales.products.slice(0, 8),
    source: 'SaleItem→Sale.completed'
  }
}

const executeTopProductPeriod = async (args: Record<string, unknown>) => {
  const parsed = ERP_TOOL_REGISTRY.top_product_period.inputSchema.parse(args)
  const range = resolveAiDateRangeFromArgs(parsed, 'week')
  const limit = typeof parsed.limit === 'number' ? parsed.limit : 5
  const dashboard = await getFinanceDashboard(range.financePeriod, {
    start: range.start,
    end: range.end
  })
  const products = dashboard.topProducts.slice(0, limit)

  return {
    currency: 'MXN',
    timeZone: FINANCE_TIME_ZONE,
    period: range.kind,
    periodLabel: range.label,
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
  const range = resolveAiDateRangeFromArgs(args, 'month')
  const dashboard = await getFinanceDashboard(range.financePeriod, {
    start: range.start,
    end: range.end
  })
  return {
    currency: 'MXN',
    timeZone: FINANCE_TIME_ZONE,
    period: range.kind,
    periodLabel: range.label,
    rangeStart: dashboard.range.start,
    rangeEnd: dashboard.range.end,
    ingresos: dashboard.cashFlow.ingresos,
    egresos: dashboard.cashFlow.egresos,
    ganancia: dashboard.cashFlow.ganancia,
    neto: dashboard.cashFlow.neto,
    gananciaNegative: dashboard.cashFlow.gananciaNegative,
    formula: 'ganancia = ingresos(Sale.total completed) - egresos(Expense.amount)',
    que: 'Ganancia neta operativa del periodo (P&L simple)',
    cuando: range.label,
    como: 'Suma ventas POS completed menos suma de egresos/pasivos registrados',
    salesCount: dashboard.cashFlow.salesCount,
    expenseCount: dashboard.cashFlow.expenseCount
  }
}

const executeLowStockCount = async () => {
  const prisma = await getPrisma()
  const rows = await prisma.inventoryItem.findMany({
    where: activeInventoryItemWhere,
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
  const range = resolveAiDateRangeFromArgs(args, 'month')
  const dashboard = await getFinanceDashboard(range.financePeriod, {
    start: range.start,
    end: range.end
  })
  return {
    currency: 'MXN',
    timeZone: FINANCE_TIME_ZONE,
    period: range.kind,
    periodLabel: range.label,
    rangeStart: dashboard.range.start,
    rangeEnd: dashboard.range.end,
    totalExpenses: dashboard.cashFlow.egresos,
    expenseCount: dashboard.cashFlow.expenseCount,
    source: 'Expense.amount'
  }
}

const executeAverageTicketPeriod = async (args: Record<string, unknown>) => {
  const range = resolveAiDateRangeFromArgs(args, 'day')
  const dashboard = await getFinanceDashboard(range.financePeriod, {
    start: range.start,
    end: range.end
  })
  return {
    currency: 'MXN',
    timeZone: FINANCE_TIME_ZONE,
    period: range.kind,
    periodLabel: range.label,
    rangeStart: dashboard.range.start,
    rangeEnd: dashboard.range.end,
    averageTicket: dashboard.cashFlow.averageTicket,
    salesCount: dashboard.cashFlow.salesCount,
    totalSales: dashboard.cashFlow.ingresos
  }
}

const executeRecentPosSales = async (args: Record<string, unknown>) => {
  const range = resolveAiDateRangeFromArgs(args, 'day')
  const limit = typeof args.limit === 'number' ? args.limit : 8
  const result = await listRecentPosSales(range.financePeriod, limit, {
    start: range.start,
    end: range.end
  })
  return {
    ...result,
    period: range.kind,
    periodLabel: range.label
  }
}

const executeInventorySnapshot = async () => getInventorySnapshot()

const executeExpensesByCategory = async (args: Record<string, unknown>) => {
  const parsed = ERP_TOOL_REGISTRY.expenses_by_category.inputSchema.parse(args)
  const category = String(parsed.category)
  const range = resolveAiDateRangeFromArgs(parsed, 'year')
  const limit = typeof parsed.limit === 'number' ? parsed.limit : 15
  const [summary, items] = await Promise.all([
    sumExpensesByCategoryInRange(category, range.start, range.end),
    listExpensesByCategoryInRange(category, range.start, range.end, limit)
  ])

  const categoryLabel =
    expenseCategoryLabels[category as keyof typeof expenseCategoryLabels] || category

  return {
    currency: 'MXN',
    timeZone: FINANCE_TIME_ZONE,
    category,
    categoryLabel,
    period: range.kind,
    periodLabel: range.label,
    rangeStart: range.start.toISOString(),
    rangeEnd: range.end.toISOString(),
    totalPaid: summary.total,
    expenseCount: summary.count,
    items,
    que: `Pagos de ${categoryLabel} (Expense.category=${category})`,
    cuando: range.label,
    como: 'Suma de Expense.amount filtrada por categoría y spentAt en el rango',
    source: 'Expense'
  }
}

const executePayrollRoster = async (args: Record<string, unknown>) => {
  const parsed = ERP_TOOL_REGISTRY.payroll_roster.inputSchema.parse(args)
  const range = resolveAiDateRangeFromArgs(parsed, 'month')
  const [staff, payrollPayments] = await Promise.all([
    listActiveStaffRoster(),
    listExpensesByCategoryInRange('nomina', range.start, range.end, 50)
  ])
  const payrollTotal = payrollPayments.reduce((sum, row) => sum + row.amount, 0)
  const mappedPayments = payrollPayments.map(row => ({
    description: row.description,
    amount: row.amount,
    spentAt: row.spentAt,
    createdByUsername: row.createdByUsername,
    personName: extractPayrollPersonName(row.description)
  }))
  const payrollPeople = aggregatePayrollPeopleFromExpenses(mappedPayments)
  const payrollPersonNames = payrollPeople.map(person => person.name)

  return {
    currency: 'MXN',
    timeZone: FINANCE_TIME_ZONE,
    period: range.kind,
    periodLabel: range.label,
    rangeStart: range.start.toISOString(),
    rangeEnd: range.end.toISOString(),
    /** Primary answer for “quién está en la nómina”: names from Expense.description. */
    payrollPersonCount: payrollPeople.length,
    payrollPersonNames,
    payrollPeople: payrollPeople.map(person => ({
      name: person.name,
      totalAmount: person.totalAmount,
      paymentCount: person.paymentCount,
      lastSpentAt: person.lastSpentAt
    })),
    payrollExpenseCount: payrollPayments.length,
    payrollExpenseTotal: Number(payrollTotal.toFixed(2)),
    payrollPayments: mappedPayments,
    /** Supplemental: system UserProfile usernames (not the preferred spoken roster). */
    activeStaffCount: staff.length,
    activeStaff: staff.map(person => ({
      username: person.username,
      role: person.role,
      cashierGate: person.cashierGate
    })),
    que: 'Personas en nómina según nombres en Expense.description (categoría nomina)',
    cuando: range.label,
    como:
      'Expense.category=nomina en el periodo; se extrae el nombre humano de description y se deduplica. UserProfile.isActive es solo complemento.',
    note:
      'Para “quién está en la nómina” prioriza payrollPersonNames / payrollPeople (nombres en la descripción del gasto). activeStaff (UserProfile) es secundario.',
    source: 'Expense.category=nomina (description) + UserProfile (secundario)'
  }
}

const executors: Record<ErpToolId, (args: Record<string, unknown>) => Promise<Record<string, unknown>>> = {
  sales_total_today: async () => executeSalesTotalToday(),
  sales_total_period: executeSalesTotalPeriod,
  stock_by_product_search: executeStockByProductSearch,
  product_sales_quantity: executeProductSalesQuantity,
  top_product_period: executeTopProductPeriod,
  cash_flow_period: executeCashFlowPeriod,
  low_stock_count: async () => executeLowStockCount(),
  expenses_total_period: executeExpensesTotalPeriod,
  average_ticket_period: executeAverageTicketPeriod,
  recent_pos_sales: executeRecentPosSales,
  inventory_snapshot: async () => executeInventorySnapshot(),
  expenses_by_category: executeExpensesByCategory,
  payroll_roster: executePayrollRoster
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
