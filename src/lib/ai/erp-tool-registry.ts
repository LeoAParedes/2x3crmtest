import { z } from 'zod'

import {
  ERP_TOOL_IDS,
  isErpToolId,
  NEW_ERP_TOOL_IDS,
  type ErpToolId
} from '@/src/lib/ai/erp-tool-ids'
import { FINANCE_TIME_ZONE, isFinancePeriod, type FinancePeriod } from '@/src/lib/finance/period'

const periodSchema = z.enum(['day', 'week', 'month'])

export type ErpToolDefinition = {
  id: ErpToolId
  description: string
  parameters: Record<string, unknown>
  inputSchema: z.ZodType<Record<string, unknown>>
}

const emptyObjectSchema = z.object({})

const periodInputSchema = z.object({
  period: periodSchema.default('day')
})

const topProductInputSchema = z.object({
  period: periodSchema.default('week'),
  limit: z.number().int().min(1).max(10).default(5)
})

const stockSearchInputSchema = z.object({
  query: z.string().min(1).max(120)
})

const recentSalesInputSchema = z.object({
  period: periodSchema.default('day'),
  limit: z.number().int().min(1).max(20).default(8)
})

const tzNote = `Zona ${FINANCE_TIME_ZONE}; el día inicia a las 00:00 local. Datos frescos de Postgres (Sale/SaleItem/Expense/InventoryItem).`

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
    description: `Total de ventas POS completadas y tickets para period=day|week|month. ${tzNote}`,
    parameters: {
      type: 'object',
      properties: {
        period: {
          type: 'string',
          enum: ['day', 'week', 'month'],
          description: 'Periodo a consultar'
        }
      },
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
        period: {
          type: 'string',
          enum: ['day', 'week', 'month']
        },
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
    description: `P&L del periodo: ingresos=Σ Sale.total completed; egresos=Σ Expense.amount (fijos+operativos); ganancia=ingresos−egresos. ${tzNote}`,
    parameters: {
      type: 'object',
      properties: {
        period: {
          type: 'string',
          enum: ['day', 'week', 'month']
        }
      },
      required: ['period'],
      additionalProperties: false
    },
    inputSchema: periodInputSchema
  },
  low_stock_count: {
    id: 'low_stock_count',
    description:
      'Cuenta InventoryItem donde stock <= minStock (alerta de inventario) y lista hasta 10 ejemplos con SKU y unidades.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false
    },
    inputSchema: emptyObjectSchema
  },
  expenses_total_period: {
    id: 'expenses_total_period',
    description: `Suma Expense.amount del periodo (nómina, renta, proveedores, etc.). ${tzNote}`,
    parameters: {
      type: 'object',
      properties: {
        period: {
          type: 'string',
          enum: ['day', 'week', 'month']
        }
      },
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
      properties: {
        period: {
          type: 'string',
          enum: ['day', 'week', 'month']
        }
      },
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
        period: {
          type: 'string',
          enum: ['day', 'week', 'month']
        },
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
