import { Agent } from '@mastra/core/agent'
import { Mastra } from '@mastra/core'

import type { ChatReply, CrmNormalizedMessage } from '@/src/lib/crm/channel-schema'
import { env, hasLlmProviderConfig } from '@/src/lib/config/env'
import { runDavinciErpAgent } from '@/src/lib/ai/davinci-agent'
import { isErpDataQuestion, runDeterministicErpDbReply } from '@/src/lib/ai/erp-db-harness'
import { appLog } from '@/src/lib/observability/app-logger'
import { getAccountBalance } from '@/src/lib/crm/services/finance-service'
import { findInventoryByQuery } from '@/src/lib/crm/services/inventory-service'
import { findOrderStatus } from '@/src/lib/crm/services/order-service'
import { createHumanHandoff, createPaymentPromise, createReturnCase } from '@/src/lib/crm/services/write-actions-service'
import {
  createHumanHandoffTool,
  createPaymentPromiseTool,
  createReturnCaseTool,
  getAccountBalanceTool,
  getInventoryTool,
  getOrderStatusTool
} from '@/src/lib/crm/agent/tools'
import { getMastraSettings, getMastraSettingsCacheKey, type MastraSettings } from '@/src/lib/crm/mastra-settings'

let crmAgentInstance: Agent | null = null
let mastraRuntimeInstance: Mastra | null = null
let agentConfigCacheKey = ''

const buildMastraTools = (settings: MastraSettings) => {
  const baseTools = {
    getInventory: getInventoryTool,
    getOrderStatus: getOrderStatusTool,
    getAccountBalance: getAccountBalanceTool
  }

  if (!settings.allowWriteActions) {
    return baseTools
  }

  const writeTools = {
    createReturnCase: createReturnCaseTool,
    createHumanHandoff: createHumanHandoffTool
  }

  if (!settings.allowFinancialActions) {
    return {
      ...baseTools,
      ...writeTools
    }
  }

  return {
    ...baseTools,
    ...writeTools,
    createPaymentPromise: createPaymentPromiseTool
  }
}

const applyReplyPolicy = (reply: ChatReply, settings: MastraSettings): ChatReply => {
  const nextReply = { ...reply }
  if (nextReply.reply.length > settings.maxReplyChars) {
    nextReply.reply = `${nextReply.reply.slice(0, settings.maxReplyChars - 3)}...`
  }
  return nextReply
}

const getMastraAgent = (settings: MastraSettings) => {
  const cacheKey = getMastraSettingsCacheKey(settings)
  if (crmAgentInstance && mastraRuntimeInstance && cacheKey === agentConfigCacheKey) {
    return crmAgentInstance
  }

  const crmAgent = new Agent({
    id: 'crm-supermarket-agent',
    name: 'CRM Supermarket Agent',
    instructions: settings.instructions,
    model: settings.modelId,
    tools: buildMastraTools(settings)
  })

  const mastraRuntime = new Mastra({
    agents: {
      crmAgent
    }
  })

  crmAgentInstance = crmAgent
  mastraRuntimeInstance = mastraRuntime
  agentConfigCacheKey = cacheKey
  return crmAgent
}

type BasicIntent =
  | 'inventory_lookup'
  | 'order_status'
  | 'account_balance'
  | 'return_request'
  | 'payment_promise'
  | 'human_handoff'
  | 'faq'

const detectBasicIntent = (message: string): BasicIntent => {
  const text = message.toLowerCase()

  if (text.includes('inventario') || text.includes('stock') || text.includes('sku') || text.includes('precio')) {
    return 'inventory_lookup'
  }

  if (text.includes('pedido') || text.includes('orden') || text.includes('order')) {
    return 'order_status'
  }

  if (text.includes('saldo') || text.includes('balance') || text.includes('credito') || text.includes('cobranza')) {
    return 'account_balance'
  }

  if (text.includes('devol') || text.includes('refund') || text.includes('reembolso')) {
    return 'return_request'
  }

  if (text.includes('promesa') || text.includes('pago') || text.includes('abonar')) {
    return 'payment_promise'
  }

  if (text.includes('humano') || text.includes('asesor') || text.includes('supervisor') || text.includes('agente')) {
    return 'human_handoff'
  }

  return 'faq'
}

const fallbackReply = async (message: CrmNormalizedMessage, settings: MastraSettings): Promise<ChatReply> => {
  const intent = detectBasicIntent(message.message)
  const customerId = message.customerId || message.metadata.customerPhone || message.sessionId

  if (intent === 'inventory_lookup') {
    const items = await findInventoryByQuery(message.message)
    if (!items.length) {
      return {
        reply: 'No encontre articulos con ese criterio. Intenta con SKU o nombre exacto del producto.',
        intent,
        actions: ['inventory.search'],
        runMode: 'fallback'
      }
    }

    const top = items
      .slice(0, 3)
      .map(item => `${item.name} (${item.sku}) - stock ${item.stock}, precio $${item.price}`)
      .join(' | ')
    return {
      reply: `Encontre estos productos: ${top}`,
      intent,
      actions: ['inventory.search'],
      runMode: 'fallback'
    }
  }

  if (intent === 'order_status') {
    const order = await findOrderStatus(message.message.replace(/[^\w\-]/g, ' ').trim())
    if (!order) {
      return {
        reply: 'No encontre ese pedido. Comparte el numero de orden o tu telefono registrado.',
        intent,
        actions: ['orders.lookup'],
        runMode: 'fallback'
      }
    }

    return {
      reply: `Pedido ${order.orderId}: estado ${order.status}, total $${order.total}, actualizado ${order.updatedAt}.`,
      intent,
      actions: ['orders.lookup'],
      runMode: 'fallback'
    }
  }

  if (intent === 'account_balance') {
    const account = await getAccountBalance(customerId)
    if (!account) {
      return {
        reply: 'No encontre una cuenta activa para ese cliente. Te puedo escalar con finanzas.',
        intent,
        actions: ['finance.lookup'],
        handoff: { required: true, reason: 'Cuenta no encontrada' },
        runMode: 'fallback'
      }
    }

    return {
      reply: `Tu saldo abierto es $${account.openBalance}. Credito disponible: $${account.availableCredit}.`,
      intent,
      actions: ['finance.lookup'],
      runMode: 'fallback'
    }
  }

  if (intent === 'return_request') {
    if (!settings.allowWriteActions) {
      return {
        reply: 'La creacion automatica de devoluciones esta desactivada. Te canalizo con un supervisor.',
        intent,
        actions: ['returns.disabled'],
        handoff: { required: true, reason: 'Write actions disabled' },
        runMode: 'fallback'
      }
    }

    const createdCase = await createReturnCase(customerId, message.message.slice(0, 280))
    return {
      reply: `Listo, registre la devolucion ${createdCase.caseId}. Un agente validara tu caso.`,
      intent,
      actions: ['returns.create'],
      runMode: 'fallback'
    }
  }

  if (intent === 'payment_promise') {
    if (!settings.allowFinancialActions) {
      return {
        reply: 'Las acciones financieras automaticas estan desactivadas por politica. Te conecto con finanzas.',
        intent,
        actions: ['finance.disabled'],
        handoff: { required: true, reason: 'Financial actions disabled' },
        runMode: 'fallback'
      }
    }

    const createdPromise = await createPaymentPromise(
      customerId,
      50,
      new Date(Date.now() + 1000 * 60 * 60 * 24 * 2).toISOString()
    )
    return {
      reply: `Registre promesa de pago ${createdPromise.promiseId} por $${createdPromise.amount}.`,
      intent,
      actions: ['finance.payment_promise'],
      runMode: 'fallback'
    }
  }

  if (intent === 'human_handoff') {
    const ticket = await createHumanHandoff(customerId, message.message.slice(0, 280), 'high')
    return {
      reply: `Te conecto con un asesor humano. Ticket ${ticket.ticketId} creado.`,
      intent,
      actions: ['handoff.create'],
      handoff: {
        required: true,
        reason: 'Solicitud explicita de humano',
        ticketId: ticket.ticketId
      },
      runMode: 'fallback'
    }
  }

  return {
    reply:
      'Puedo ayudarte con inventario, estado de pedido, saldo/cobranza, devoluciones y escalamiento a humano. Dime que necesitas.',
    intent,
    actions: ['faq.reply'],
    runMode: 'fallback'
  }
}

export const runCrmAgent = async (message: CrmNormalizedMessage): Promise<ChatReply> => {
  const settings = await getMastraSettings()
  if (!settings.enabled) {
    const fallback = await fallbackReply(message, settings)
    return applyReplyPolicy(fallback, settings)
  }

  const erpQuestion = isErpDataQuestion(message.message)

  // WhatsApp ERP: answer from Prisma only (skip OpenAI latency / Twilio timeout risk).
  if (erpQuestion && message.channel === 'whatsapp' && settings.allowedErpTools.length > 0) {
    const deterministic = await runDeterministicErpDbReply(message.message, settings.allowedErpTools)
    return applyReplyPolicy(
      {
        reply: deterministic.reply,
        intent: 'erp_metrics',
        actions: deterministic.usedTools.map(id => `erp.${id}`),
        runMode: 'fallback'
      },
      settings
    )
  }

  // DavinciAi: OpenAI + whitelisted ERP tools (DB-only facts). Never invent figures.
  if (env.openAiApiKey && settings.allowedErpTools.length > 0) {
    const davinciReply = await runDavinciErpAgent(message, settings)
    if (davinciReply) {
      return applyReplyPolicy(davinciReply, settings)
    }
  }

  // ERP metrics must never go through free-form Mastra. Use deterministic Prisma tools only.
  if (erpQuestion && settings.allowedErpTools.length > 0) {
    const deterministic = await runDeterministicErpDbReply(message.message, settings.allowedErpTools)
    return applyReplyPolicy(
      {
        reply: deterministic.reply,
        intent: 'erp_metrics',
        actions: deterministic.usedTools.map(id => `erp.${id}`),
        runMode: 'fallback'
      },
      settings
    )
  }

  if (!hasLlmProviderConfig) {
    const fallback = await fallbackReply(message, settings)
    return applyReplyPolicy(fallback, settings)
  }

  try {
    const agent = getMastraAgent(settings)
    const prompt = `
Canal: ${message.channel}
Sesion: ${message.sessionId}
Cliente: ${message.customerId || 'desconocido'}
Mensaje del usuario: ${message.message}
Locale preferido: ${settings.defaultLocale}
Longitud maxima de respuesta: ${settings.maxReplyChars} caracteres
IMPORTANTE: No inventes montos ni stock. Si la pregunta es operativa/ERP, indica que uses el canal DavinciAi/tools.
Responde en JSON con campos: reply, intent, actions (array), handoff (opcional con required y reason)
    `

    const output = await agent.generate(prompt)
    const parsed = JSON.parse(output.text) as Partial<ChatReply>

    const reply: ChatReply = {
      reply: parsed.reply || (await fallbackReply(message, settings)).reply,
      intent: parsed.intent || detectBasicIntent(message.message),
      actions: parsed.actions || [],
      handoff: parsed.handoff,
      runMode: 'mastra'
    }

    return applyReplyPolicy(reply, settings)
  } catch (error) {
    appLog('warn', 'Mastra generation failed, fallback path used', {
      reason: error instanceof Error ? error.message : 'unknown'
    })
    const fallback = await fallbackReply(message, settings)
    return applyReplyPolicy(fallback, settings)
  }
}
