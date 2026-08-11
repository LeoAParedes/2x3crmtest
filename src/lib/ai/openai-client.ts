import { env } from '@/src/lib/config/env'

export type OpenAiChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  name?: string
  tool_call_id?: string
  tool_calls?: OpenAiToolCall[]
}

export type OpenAiToolCall = {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export type OpenAiToolDefinition = {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      role?: string
      content?: string | null
      tool_calls?: OpenAiToolCall[]
    }
    finish_reason?: string
  }>
  error?: {
    message?: string
  }
}

export const normalizeOpenAiModelId = (modelId: string) => {
  const trimmed = modelId.trim()
  if (trimmed.startsWith('openai/')) {
    return trimmed.slice('openai/'.length)
  }
  if (trimmed.includes('/')) {
    const [, maybeModel] = trimmed.split('/')
    return maybeModel || trimmed
  }
  return trimmed
}

export const createOpenAiChatCompletion = async (input: {
  model: string
  messages: OpenAiChatMessage[]
  tools?: OpenAiToolDefinition[]
  temperature?: number
}) => {
  if (!env.openAiApiKey) {
    throw new Error('OPENAI_API_KEY_MISSING')
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.openAiApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: normalizeOpenAiModelId(input.model),
      messages: input.messages,
      tools: input.tools && input.tools.length > 0 ? input.tools : undefined,
      tool_choice: input.tools && input.tools.length > 0 ? 'auto' : undefined,
      temperature: input.temperature ?? 0.2
    })
  })

  const payload = (await response.json()) as ChatCompletionResponse
  if (!response.ok) {
    throw new Error(payload.error?.message || `OPENAI_HTTP_${response.status}`)
  }

  const message = payload.choices?.[0]?.message
  if (!message) {
    throw new Error('OPENAI_EMPTY_RESPONSE')
  }

  return {
    content: message.content ?? null,
    toolCalls: message.tool_calls || [],
    finishReason: payload.choices?.[0]?.finish_reason || 'stop'
  }
}
