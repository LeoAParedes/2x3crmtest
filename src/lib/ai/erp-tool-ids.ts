export const ERP_TOOL_IDS = [
  'sales_total_today',
  'sales_total_period',
  'stock_by_product_search',
  'product_sales_quantity',
  'top_product_period',
  'cash_flow_period',
  'low_stock_count',
  'expenses_total_period',
  'average_ticket_period',
  'recent_pos_sales',
  'inventory_snapshot',
  'expenses_by_category',
  'payroll_roster'
] as const

export type ErpToolId = (typeof ERP_TOOL_IDS)[number]

/** Harness-only fact ids (deterministic path; not exposed as OpenAI tools unless registered). */
export const ERP_HARNESS_FACT_IDS = ['sales_total_on_date'] as const
export type ErpHarnessFactId = (typeof ERP_HARNESS_FACT_IDS)[number]
export type ErpFactToolId = ErpToolId | ErpHarnessFactId

/** Tools introduced after initial rollout — auto-enabled when missing from stored settings. */
export const NEW_ERP_TOOL_IDS: ErpToolId[] = [
  'recent_pos_sales',
  'inventory_snapshot',
  'expenses_by_category',
  'payroll_roster',
  'product_sales_quantity'
]

export const isErpToolId = (value: string): value is ErpToolId =>
  (ERP_TOOL_IDS as readonly string[]).includes(value)

export const ERP_TOOL_LABELS: Record<ErpToolId, string> = {
  sales_total_today: 'Ventas de hoy',
  sales_total_period: 'Ventas por periodo',
  stock_by_product_search: 'Stock por producto',
  product_sales_quantity: 'Cantidad vendida por producto',
  top_product_period: 'Producto más vendido',
  cash_flow_period: 'Flujo de caja / ganancia',
  low_stock_count: 'Productos con stock bajo',
  expenses_total_period: 'Egresos por periodo',
  average_ticket_period: 'Ticket promedio',
  recent_pos_sales: 'Ventas POS recientes',
  inventory_snapshot: 'Resumen de inventario',
  expenses_by_category: 'Egresos por categoría / servicio',
  payroll_roster: 'Nómina / nombres en gastos'
}

export const DEFAULT_ALLOWED_ERP_TOOLS: ErpToolId[] = [...ERP_TOOL_IDS]
