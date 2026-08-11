import { z } from 'zod'

import { ERP_TOOL_IDS, isErpToolId, type ErpToolId } from '@/src/lib/ai/erp-tool-ids'
import { isFinancePeriod, type FinancePeriod } from '@/src/lib/finance/period'

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

export const ERP_TOOL_REGISTRY: Record<ErpToolId, ErpToolDefinition> = {
  sales_total_today: {
    id: 'sales_total_today',
    description:
      'Obtiene el total de ventas completadas de hoy (America/Mexico_City) y el número de tickets. Solo lectura.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false
    },
    inputSchema: emptyObjectSchema
  },
  sales_total_period: {
    id: 'sales_total_period',
    description:
      'Obtiene el total de ventas completadas y el número de tickets para un periodo: day, week o month.',
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
      'Busca productos en inventario por nombre, SKU o categoría y devuelve stock y precio reales.',
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
    description:
      'Devuelve los productos más vendidos (cantidad y revenue) en el periodo indicado.',
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
    description:
      'Devuelve ingresos, egresos y flujo neto (ingresos - egresos) del periodo.',
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
      'Cuenta productos con stock bajo o igual a su mínimo y lista hasta 10 ejemplos.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false
    },
    inputSchema: emptyObjectSchema
  },
  expenses_total_period: {
    id: 'expenses_total_period',
    description: 'Suma egresos/gastos registrados en el periodo indicado.',
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
    description: 'Calcula el ticket promedio (venta media) del periodo.',
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
  }
}

export const parseAllowedErpTools = (value: unknown): ErpToolId[] => {
  if (!Array.isArray(value)) {
    return [...ERP_TOOL_IDS]
  }

  return value.filter((item): item is ErpToolId => typeof item === 'string' && isErpToolId(item))
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
