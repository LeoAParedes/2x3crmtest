import type { ChatReply, CrmNormalizedMessage } from '@/src/lib/crm/channel-schema'
import type { MastraSettings } from '@/src/lib/crm/mastra-settings'
import { executeErpTool } from '@/src/lib/ai/erp-tool-executors'
import { toOpenAiTools } from '@/src/lib/ai/erp-tool-registry'
import {
  createOpenAiChatCompletion,
  type OpenAiChatMessage
} from '@/src/lib/ai/openai-client'
import { appLog } from '@/src/lib/observability/app-logger'

const MAX_TOOL_ROUNDS = 4

const buildSystemPrompt = (settings: MastraSettings) => `
Eres DavinciAi, el asistente de negocio del ERP 2x3crmtest para el dueño/operador.
Responde siempre en español, de forma clara y breve (máximo ${settings.maxReplyChars} caracteres).

Reglas obligatorias de datos:
1. Nunca inventes cifras de ventas, stock, egresos, tickets o rankings.
2. Solo reporta números que vengan de resultados de herramientas (tools).
3. Si no tienes datos de una herramienta, dilo explícitamente y sugiere qué preguntar.
4. No pidas ni ejecutes SQL. Solo usa las herramientas disponibles.
5. Si una herramienta está deshabilitada, explica que el administrador no la habilitó.
6. Formatea montos como MXN con 2 decimales cuando aplique.

Instrucciones adicionales del administrador:
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
Pregunta del usuario: ${message.message}
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
            'Responde ahora al usuario usando únicamente los hechos de las herramientas. No inventes números.'
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
    appLog('warn', 'DavinciAi ERP harness failed', {
      reason: error instanceof Error ? error.message : 'unknown'
    })
    return null
  }
}
