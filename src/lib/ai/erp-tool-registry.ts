import { z } from 'zod'

import { AI_PERIOD_KINDS } from '@/src/lib/ai/ai-date-range'
import {
  ERP_TOOL_IDS,
  isErpToolId,
  NEW_ERP_TOOL_IDS,
  type ErpToolId
} from '@/src/lib/ai/erp-tool-ids'
import { EXPENSE_CATEGORIES } from '@/src/lib/finance/expense-schema'
import { FINANCE_TIME_ZONE, isFinancePeriod, type FinancePeriod } from '@/src/lib/finance/period'

const periodSchema = z.enum(AI_PERIOD_KINDS)

export type ErpToolDefinition = {
  id: ErpToolId
  description: string
  parameters: Record<string, unknown>
  inputSchema: z.ZodType<Record<string, unknown>>
}

const emptyObjectSchema = z.object({})

const periodInputSchema = z.object({
  period: periodSchema.default('month'),
  rollingDays: z.number().int().min(1).max(366).optional(),
  fromDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  toDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
})

const topProductInputSchema = z.object({
  period: periodSchema.default('week'),
  limit: z.number().int().min(1).max(10).default(5),
  rollingDays: z.number().int().min(1).max(366).optional(),
  fromDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  toDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
})

const stockSearchInputSchema = z.object({
  query: z.string().min(1).max(120)
})

const recentSalesInputSchema = z.object({
  period: periodSchema.default('day'),
  limit: z.number().int().min(1).max(20).default(8),
  rollingDays: z.number().int().min(1).max(366).optional(),
  fromDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  toDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
})

const expensesByCategoryInputSchema = z.object({
  category: z.enum(EXPENSE_CATEGORIES),
  period: periodSchema.default('year'),
  rollingDays: z.number().int().min(1).max(366).optional(),
  fromDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  toDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  limit: z.number().int().min(1).max(50).default(15)
})

const payrollRosterInputSchema = z.object({
  period: periodSchema.default('month'),
  rollingDays: z.number().int().min(1).max(366).optional(),
  fromDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  toDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
})

const periodParamProperties = {
  period: {
    type: 'string',
    enum: [...AI_PERIOD_KINDS],
    description:
      'Periodo: day|week|month (calendario local), year (YTD), last_month (mes calendario anterior), last_year, rolling (+rollingDays). “último mes” → rolling 31; “este año” → year.'
  },
  rollingDays: {
    type: 'integer',
    minimum: 1,
    maximum: 366,
    description: 'Obligatorio si period=rolling (ej. 31 para último mes aproximado)'
  },
  fromDate: {
    type: 'string',
    description: 'Inicio ISO YYYY-MM-DD (opcional; con toDate redefine el periodo)'
  },
  toDate: {
    type: 'string',
    description: 'Fin ISO YYYY-MM-DD (opcional; con fromDate redefine el periodo)'
  }
} as const

const tzNote = `Zona ${FINANCE_TIME_ZONE}; el día inicia a las 00:00 local. Datos frescos de Postgres (Sale/SaleItem/Expense/InventoryItem/UserProfile).`

export const ERP_TOOL_REGISTRY: Record<ErpToolId, ErpToolDefinition> = {
  sales_total_today: {
    id: 'sales_total_today',
    description: `Total de ventas POS completadas (tabla Sale.status=completed) de hoy y número de tickets. ${tzNote}`,
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false
    },
    inputSchema: emptyObjectSchema
  },
  sales_total_period: {
    id: 'sales_total_period',
    description: `Total de ventas POS completadas y tickets para un periodo (day|week|month|year|last_month|rolling). ${tzNote}`,
    parameters: {
      type: 'object',
      properties: { ...periodParamProperties },
      required: ['period'],
      additionalProperties: false
    },
    inputSchema: periodInputSchema
  },
  stock_by_product_search: {
    id: 'stock_by_product_search',
    description:
      'Busca InventoryItem por nombre, SKU o categoría. Devuelve stock actual, minStock, precio y pasillo. Solo lectura.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Nombre, SKU o categoría del producto (ej. tomate)'
        }
      },
      required: ['query'],
      additionalProperties: false
    },
    inputSchema: stockSearchInputSchema
  },
  top_product_period: {
    id: 'top_product_period',
    description: `Top productos por cantidad vendida (SaleItem ligados a Sale completed). Incluye revenue. ${tzNote}`,
    parameters: {
      type: 'object',
      properties: {
        ...periodParamProperties,
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 10,
          description: 'Cantidad de productos a devolver (default 5)'
        }
      },
      required: ['period'],
      additionalProperties: false
    },
    inputSchema: topProductInputSchema
  },
  cash_flow_period: {
    id: 'cash_flow_period',
    description: `P&L / ganancias del periodo: ingresos=Σ Sale.total completed; egresos=Σ Expense.amount (pasivos/servicios/nómina); ganancia=ingresos−egresos. Usa year para “este año”, rolling+31 para “último mes”. ${tzNote}`,
    parameters: {
      type: 'object',
      properties: { ...periodParamProperties },
      required: ['period'],
      additionalProperties: false
    },
    inputSchema: periodInputSchema
  },
  low_stock_count: {
    id: 'low_stock_count',
    description:
      'Cuenta InventoryItem activos donde stock <= minStock (excluye archivados) y lista hasta 10 ejemplos con SKU y unidades.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false
    },
    inputSchema: emptyObjectSchema
  },
  expenses_total_period: {
    id: 'expenses_total_period',
    description: `Suma Expense.amount del periodo (todos los pasivos: nómina, renta, luz, etc.). ${tzNote}`,
    parameters: {
      type: 'object',
      properties: { ...periodParamProperties },
      required: ['period'],
      additionalProperties: false
    },
    inputSchema: periodInputSchema
  },
  average_ticket_period: {
    id: 'average_ticket_period',
    description: `Ticket promedio = ingresos / número de ventas POS completed. ${tzNote}`,
    parameters: {
      type: 'object',
      properties: { ...periodParamProperties },
      required: ['period'],
      additionalProperties: false
    },
    inputSchema: periodInputSchema
  },
  recent_pos_sales: {
    id: 'recent_pos_sales',
    description: `Lista las ventas POS más recientes (Sale + SaleItem): saleNumber, total, pago, líneas, cajero. ${tzNote}`,
    parameters: {
      type: 'object',
      properties: {
        ...periodParamProperties,
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 20,
          description: 'Máximo de tickets a listar (default 8)'
        }
      },
      required: ['period'],
      additionalProperties: false
    },
    inputSchema: recentSalesInputSchema
  },
  inventory_snapshot: {
    id: 'inventory_snapshot',
    description:
      'Resumen de inventario: cantidad de SKUs, unidades totales, alertas stock bajo y muestra de catálogo (sku/nombre/stock).',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false
    },
    inputSchema: emptyObjectSchema
  },
  expenses_by_category: {
    id: 'expenses_by_category',
    description: `Cuánto se pagó de un servicio/pasivo (Expense.category: renta|luz|agua|gas|proveedores|nomina|mantenimiento|transporte|otros) en un periodo. Ideal para “cuánto pagué de luz este año”. ${tzNote}`,
    parameters: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          enum: [...EXPENSE_CATEGORIES],
          description: 'Categoría de egreso / servicio / pasivo'
        },
        ...periodParamProperties,
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 50,
          description: 'Máximo de movimientos a listar (default 15)'
        }
      },
      required: ['category', 'period'],
      additionalProperties: false
    },
    inputSchema: expensesByCategoryInputSchema
  },
  payroll_roster: {
    id: 'payroll_roster',
    description: `Quién está en la nómina: (1) personal activo UserProfile isActive; (2) pagos Expense category=nomina del periodo con montos/descripciones. ${tzNote}`,
    parameters: {
      type: 'object',
      properties: { ...periodParamProperties },
      required: ['period'],
      additionalProperties: false
    },
    inputSchema: payrollRosterInputSchema
  }
}

export const parseAllowedErpTools = (value: unknown): ErpToolId[] => {
  if (!Array.isArray(value)) {
    return [...ERP_TOOL_IDS]
  }

  const parsed = value.filter((item): item is ErpToolId => typeof item === 'string' && isErpToolId(item))

  for (const id of NEW_ERP_TOOL_IDS) {
    if (!parsed.includes(id)) {
      parsed.push(id)
    }
  }

  return parsed.length > 0 ? parsed : [...ERP_TOOL_IDS]
}

/** @deprecated Prefer resolveAiDateRangeFromArgs for year/rolling; kept for classic day|week|month. */
export const resolvePeriod = (value: unknown, fallback: FinancePeriod = 'day'): FinancePeriod => {
  if (typeof value === 'string' && isFinancePeriod(value)) {
    return value
  }
  return fallback
}

export const toOpenAiTools = (allowedIds: ErpToolId[]) =>
  allowedIds.map(id => {
    const tool = ERP_TOOL_REGISTRY[id]
    return {
      type: 'function' as const,
      function: {
        name: tool.id,
        description: tool.description,
        parameters: tool.parameters
      }
    }
  })
