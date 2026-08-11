import { appendFileSync } from 'node:fs'
import { resolve } from 'node:path'

import type { ChatReply, CrmNormalizedMessage } from '@/src/lib/crm/channel-schema'
import type { MastraSettings } from '@/src/lib/crm/mastra-settings'
import {
  formatDeterministicErpReply,
  formatLocalBusinessNow,
  isErpDataQuestion,
  parseBusinessDateMention,
  runDeterministicErpDbReply
} from '@/src/lib/ai/erp-db-harness'
import { ERP_ENTITY_KNOWLEDGE } from '@/src/lib/ai/erp-entity-catalog'
import { executeErpTool, type ErpToolFactResult } from '@/src/lib/ai/erp-tool-executors'
import { toOpenAiTools } from '@/src/lib/ai/erp-tool-registry'
import {
  createOpenAiChatCompletion,
  type OpenAiChatMessage
} from '@/src/lib/ai/openai-client'
import { FINANCE_TIME_ZONE } from '@/src/lib/finance/period'
import { appLog } from '@/src/lib/observability/app-logger'

const MAX_TOOL_ROUNDS = 6

// #region agent log
const writeAgentDebugLog = (payload: {
  hypothesisId: string
  location: string
  message: string
  data?: Record<string, unknown>
}) => {
  const body = {
    sessionId: '449600',
    runId: 'davinci-db-only',
    timestamp: Date.now(),
    ...payload
  }
  try {
    appendFileSync(resolve(process.cwd(), '..', 'debug-449600.log'), `${JSON.stringify(body)}\n`)
  } catch {
    try {
      appendFileSync(resolve(process.cwd(), 'debug-449600.log'), `${JSON.stringify(body)}\n`)
    } catch {
      // ignore
    }
  }
  fetch('http://127.0.0.1:7470/ingest/f7f242f1-ff2d-40d4-bf0c-d535d5a2bbdb', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '449600' },
    body: JSON.stringify(body)
  }).catch(() => {})
}
// #endregion

const buildSystemPrompt = (settings: MastraSettings, localNowLabel: string) => `
Eres DavinciAi, consultor de negocio del ERP 2x3crmtest (POS + inventario + finanzas + pasivos).
Responde siempre en español, claro y breve (máximo ${settings.maxReplyChars} caracteres).

REGLA ABSOLUTA:
- Prohibido inventar, estimar, redondear de memoria o reutilizar cifras de mensajes anteriores.
- Toda cifra (montos, tickets, stock, egresos, ganancias, nómina) DEBE salir de un resultado de tool en esta conversación.
- Si una tool falla o no hay datos, dilo explícitamente. Nunca completes con números inventados.

FORMATO DE RESPUESTA AL USUARIO:
- Solo la respuesta factual (números, nombres, periodos). Nada más.
- Prohibido mencionar: Fuente, Supabase, Postgres, Prisma, nombres de tablas, tool IDs, provenance, o qué módulos/departamentos consultaste.
- No listes catálogos de entidades, departamentos ni módulos salvo que el usuario pregunte explícitamente “cómo funciona el sistema” o similar.
- No narres el proceso interno (“consulté X”, “según la tool Y”).

Contexto interno (NO volcar al usuario; solo para elegir tools):
${ERP_ENTITY_KNOWLEDGE}

Periodos (zona ${FINANCE_TIME_ZONE}; día desde 00:00 local):
- “hoy” → day | “esta semana” → week | “este mes” → month
- “último mes” → period=rolling, rollingDays=31
- “mes pasado” → last_month | “este año” → year | “año pasado” → last_year
- Ahora local: ${localNowLabel}

Herramientas clave (internas; no nombrarlas al usuario):
- Ganancias / P&L → cash_flow_period
- Quién está en la nómina → payroll_roster (prioriza payrollPersonNames / nombres en description del gasto)
- Cuánto pagué de luz/agua/renta/… → expenses_by_category (category + periodo)
- Cuántos kilos/piezas se vendieron de un producto → product_sales_quantity (query + periodo; default este mes)
- Egresos totales → expenses_total_period | Ventas totales → sales_total_*

Reglas:
1. Preguntas de negocio: llama tools frescas antes de responder.
2. Formatea MXN con 2 decimales solo con valores de tools.
3. No pidas ni ejecutes SQL.
4. Distingue ventas, egresos/pasivos y ganancia.
5. Si “hoy” es 0, usa week/recent_pos_sales antes de concluir que no hubo ventas.
6. Preguntas de día/hora/fecha (sin métricas): responde con “Ahora local”; no uses tools de ventas.
7. Cuando la pregunta lo permita, responde con Qué / Cuándo / Cómo / Por qué usando solo hechos de tools — sin pie de fuente ni listados de módulos.

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

const buildDbOnlyReply = (
  replyText: string,
  usedTools: string[],
  settings: MastraSettings
): ChatReply => ({
  reply: replyText.slice(0, settings.maxReplyChars),
  intent: 'erp_metrics',
  actions: usedTools.map(id => `erp.${id}`),
  runMode: 'mastra'
})

export const runDavinciErpAgent = async (
  message: CrmNormalizedMessage,
  settings: MastraSettings
): Promise<ChatReply | null> => {
  const allowedTools = settings.allowedErpTools
  if (!settings.enabled || allowedTools.length === 0) {
    return null
  }

  const requiresDbFacts = isErpDataQuestion(message.message)
  const localNowLabel = formatLocalBusinessNow()
  const explicitBusinessDate = parseBusinessDateMention(message.message)
  if (requiresDbFacts && explicitBusinessDate) {
    const deterministic = await runDeterministicErpDbReply(message.message, allowedTools)
    writeAgentDebugLog({
      hypothesisId: 'H7',
      location: 'davinci-agent.ts:explicit-date',
      message: 'deterministic DB reply for explicit business date',
      data: {
        channel: message.channel,
        label: explicitBusinessDate.label,
        isoDate: explicitBusinessDate.isoDate,
        usedTools: deterministic.usedTools
      }
    })
    return buildDbOnlyReply(deterministic.reply, deterministic.usedTools, settings)
  }

  const tools = toOpenAiTools(allowedTools)
  const messages: OpenAiChatMessage[] = [
    { role: 'system', content: buildSystemPrompt(settings, localNowLabel) },
    {
      role: 'user',
      content: `
Canal: ${message.channel}
Sesión: ${message.sessionId}
Locale: ${settings.defaultLocale}
Zona: ${FINANCE_TIME_ZONE}
Ahora local: ${localNowLabel}
Pregunta del usuario: ${message.message}
${requiresDbFacts ? 'OBLIGATORIO: consulta tools de la base de datos antes de responder. Cero cifras sin tool.' : 'Si mencionas cifras de negocio, deben venir de tools. Día/hora puedes tomarlos de “Ahora local”.'}
`.trim()
    }
  ]

  const usedTools: string[] = []
  const toolResults: ErpToolFactResult[] = []

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      const forceTools = requiresDbFacts && usedTools.length === 0
      const completion = await createOpenAiChatCompletion({
        model: settings.modelId,
        messages,
        tools,
        toolChoice: forceTools ? 'required' : 'auto',
        temperature: 0
      })

      if (completion.toolCalls.length === 0) {
        // Strict gate: ERP questions cannot answer without successful DB tool facts.
        if (requiresDbFacts && usedTools.length === 0) {
          writeAgentDebugLog({
            hypothesisId: 'H1',
            location: 'davinci-agent.ts:no-tools',
            message: 'model skipped tools; deterministic DB fallback',
            data: { round, question: message.message.slice(0, 120) }
          })
          const deterministic = await runDeterministicErpDbReply(message.message, allowedTools)
          return buildDbOnlyReply(deterministic.reply, deterministic.usedTools, settings)
        }

        if (requiresDbFacts) {
          // Never let the LLM invent or paraphrase numbers — only format DB tool facts.
          const deterministic = formatDeterministicErpReply(toolResults)
          writeAgentDebugLog({
            hypothesisId: 'H1',
            location: 'davinci-agent.ts:db-only-format',
            message: 'ERP reply formatted strictly from tool facts',
            data: {
              usedTools,
              okTools: toolResults.filter(result => result.ok).length
            }
          })
          return buildDbOnlyReply(deterministic, usedTools, settings)
        }

        const replyText = (completion.content || '').trim()
        if (!replyText) {
          return null
        }

        return buildDbOnlyReply(replyText, usedTools, settings)
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
        toolResults.push(result)
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result)
        })
      }
    }

    // Exhausted rounds: never invent — answer only from collected DB facts.
    const deterministic = formatDeterministicErpReply(toolResults)
    writeAgentDebugLog({
      hypothesisId: 'H1',
      location: 'davinci-agent.ts:max-rounds',
      message: 'max rounds reached; deterministic DB reply',
      data: { usedTools, okTools: toolResults.filter(result => result.ok).length }
    })
    return buildDbOnlyReply(deterministic, usedTools, settings)
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown'
    appLog('warn', 'DavinciAi ERP harness failed; deterministic DB fallback', {
      reason,
      modelId: settings.modelId
    })
    writeAgentDebugLog({
      hypothesisId: 'H2',
      location: 'davinci-agent.ts:catch',
      message: 'openai failed; deterministic DB fallback',
      data: { reason }
    })

    if (!requiresDbFacts) {
      return null
    }

    try {
      const deterministic = await runDeterministicErpDbReply(message.message, allowedTools)
      return buildDbOnlyReply(deterministic.reply, deterministic.usedTools, settings)
    } catch {
      return buildDbOnlyReply(
        'No pude consultar la base de datos en este momento. Reintenta, por favor.',
        [],
        settings
      )
    }
  }
}
