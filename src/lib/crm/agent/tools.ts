import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

import { getAccountBalance } from '@/src/lib/crm/services/finance-service'
import { findInventoryByQuery } from '@/src/lib/crm/services/inventory-service'
import { findOrderStatus } from '@/src/lib/crm/services/order-service'
import { createHumanHandoff, createPaymentPromise, createReturnCase } from '@/src/lib/crm/services/write-actions-service'

export const getInventoryTool = createTool({
  id: 'get_inventory',
  description: 'Search inventory by sku, name or category',
  inputSchema: z.object({
    query: z.string().min(1).max(120)
  }),
  execute: async ({ query }) => {
    const items = (await findInventoryByQuery(query)).slice(0, 5)
    return {
      items,
      count: items.length
    }
  }
})

export const getOrderStatusTool = createTool({
  id: 'get_order_status',
  description: 'Get order status by order ID or customer phone',
  inputSchema: z.object({
    orderIdOrPhone: z.string().min(1).max(120)
  }),
  execute: async ({ orderIdOrPhone }) => {
    const order = await findOrderStatus(orderIdOrPhone)
    return {
      found: Boolean(order),
      order: order || null
    }
  }
})

export const getAccountBalanceTool = createTool({
  id: 'get_account_balance',
  description: 'Get customer account balance and available credit',
  inputSchema: z.object({
    customerId: z.string().min(1).max(120)
  }),
  execute: async ({ customerId }) => {
    const account = await getAccountBalance(customerId)
    return {
      found: Boolean(account),
      account: account || null
    }
  }
})

export const createReturnCaseTool = createTool({
  id: 'create_return_case',
  description: 'Create a return case for product issues or wrong delivery',
  inputSchema: z.object({
    customerId: z.string().min(1).max(120),
    reason: z.string().min(3).max(300)
  }),
  execute: async ({ customerId, reason }) => {
    return createReturnCase(customerId, reason)
  }
})

export const createHumanHandoffTool = createTool({
  id: 'create_human_handoff',
  description: 'Escalate conversation to human supervisor with priority',
  inputSchema: z.object({
    customerId: z.string().min(1).max(120),
    reason: z.string().min(3).max(300),
    priority: z.enum(['low', 'medium', 'high']).default('medium')
  }),
  execute: async ({ customerId, reason, priority }) => {
    return createHumanHandoff(customerId, reason, priority)
  }
})

export const createPaymentPromiseTool = createTool({
  id: 'create_payment_promise',
  description: 'Register customer payment promise and due date',
  inputSchema: z.object({
    customerId: z.string().min(1).max(120),
    amount: z.number().positive(),
    dueDate: z.string().min(8).max(40)
  }),
  execute: async ({ customerId, amount, dueDate }) => {
    return createPaymentPromise(customerId, amount, dueDate)
  }
})
