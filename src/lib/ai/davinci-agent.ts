import type { ChatReply, CrmNormalizedMessage } from '@/src/lib/crm/channel-schema'
import type { MastraSettings } from '@/src/lib/crm/mastra-settings'
import { executeErpTool } from '@/src/lib/ai/erp-tool-executors'
import { toOpenAiTools } from '@/src/lib/ai/erp-tool-registry'
import {
  createOpenAiChatCompletion,
  type OpenAiChatMessage
} from '@/src/lib/ai/openai-client'
import { FINANCE_TIME_ZONE } from '@/src/lib/finance/period'
import { appLog } from '@/src/lib/observability/app-logger'

const MAX_TOOL_ROUNDS = 6

const buildSystemPrompt = (settings: MastraSettings) => `
Eres DavinciAi, consultor de negocio del ERP 2x3crmtest (POS + inventario + finanzas).
Responde siempre en español, claro y breve (máximo ${settings.maxReplyChars} caracteres).

Modelo de datos real (Postgres vía tools; nunca inventes cifras):
- Sale / SaleItem: cada venta del POS. Solo status=completed cuenta como ingreso.
- Expense: egresos (nómina, renta, proveedores, etc.). kind fixed|operating se registra pero la ganancia usa TODOS los egresos.
- InventoryItem: sku, productName, stock, minStock, unitPrice. Alerta si stock <= minStock.
- P&L: ingresos = Σ Sale.total; egresos = Σ Expense.amount; ganancia = ingresos − egresos.
- Zona horaria: ${FINANCE_TIME_ZONE}. Cada día inicia a las 00:00 local (no uses medianoche CDMX).

Reglas:
1. Cada pregunta: llama tools frescas; no reutilices cifras de mensajes anteriores.
2. Solo reporta números que vengan de resultados de tools.
3. Si falta un dato, dilo y sugiere la tool/pregunta correcta.
4. No pidas ni ejecutes SQL. Solo tools.
5. Formatea montos MXN con 2 decimales.
6. Distingue ventas (tickets POS) de egresos (gastos). Una nómina fija reduce la ganancia pero no “borra” las ventas del día: reporta ingresos, egresos y ganancia por separado.
7. Para inventario usa inventory_snapshot, stock_by_product_search o low_stock_count.
8. Para “qué se vendió” usa recent_pos_sales o top_product_period.

Instrucciones del administrador:
${settings.instructions}
`.trim()

const parseToolArguments = (raw: string): Record<string, unknown> => {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
    return {}
  } catch {
    return {}
  }
}

export const runDavinciErpAgent = async (
  message: CrmNormalizedMessage,
  settings: MastraSettings
): Promise<ChatReply | null> => {
  const allowedTools = settings.allowedErpTools
  if (!settings.enabled || allowedTools.length === 0) {
    return null
  }

  const tools = toOpenAiTools(allowedTools)
  const messages: OpenAiChatMessage[] = [
    { role: 'system', content: buildSystemPrompt(settings) },
    {
      role: 'user',
      content: `
Canal: ${message.channel}
Sesión: ${message.sessionId}
Locale: ${settings.defaultLocale}
Zona: ${FINANCE_TIME_ZONE}
Pregunta del usuario: ${message.message}
Consulta datos frescos con tools antes de responder.
`.trim()
    }
  ]

  const usedTools: string[] = []

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      const completion = await createOpenAiChatCompletion({
        model: settings.modelId,
        messages,
        tools
      })

      if (completion.toolCalls.length === 0) {
        const replyText = (completion.content || '').trim()
        if (!replyText) {
          return null
        }

        return {
          reply: replyText.slice(0, settings.maxReplyChars),
          intent: usedTools.length > 0 ? 'erp_metrics' : 'faq',
          actions: usedTools.length > 0 ? usedTools.map(id => `erp.${id}`) : ['davinci.reply'],
          runMode: 'mastra'
        }
      }

      messages.push({
        role: 'assistant',
        content: completion.content,
        tool_calls: completion.toolCalls
      })

      for (const toolCall of completion.toolCalls) {
        const args = parseToolArguments(toolCall.function.arguments)
        const result = await executeErpTool(toolCall.function.name, args, allowedTools)
        usedTools.push(toolCall.function.name)
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result)
        })
      }
    }

    const finalCompletion = await createOpenAiChatCompletion({
      model: settings.modelId,
      messages: [
        ...messages,
        {
          role: 'user',
          content:
            'Responde ahora con hechos de las tools. Separa ingresos, egresos y ganancia cuando hables de dinero. No inventes números.'
        }
      ]
    })

    const replyText = (finalCompletion.content || '').trim()
    if (!replyText) {
      return null
    }

    return {
      reply: replyText.slice(0, settings.maxReplyChars),
      intent: 'erp_metrics',
      actions: usedTools.map(id => `erp.${id}`),
      runMode: 'mastra'
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown'
    appLog('warn', 'DavinciAi ERP harness failed', { reason, modelId: settings.modelId })
    return null
  }
}
