'use client'

import { FormEvent, useMemo, useState } from 'react'

type AssistantMetadata = {
  status: 'ok' | 'error'
  intent?: string
  runMode?: 'mastra' | 'fallback'
  handoffRequired?: boolean
  handoffReason?: string
  handoffTicketId?: string
  actions?: string[]
  httpStatus?: number
  errorDetails?: string
}

type Message = {
  id: string
  role: 'user' | 'assistant'
  content: string
  metadata?: AssistantMetadata
}

type ChatApiPayload = {
  success?: boolean
  reply?: {
    reply: string
    intent: string
    actions?: string[]
    handoff?: {
      required: boolean
      reason: string
      ticketId?: string
    }
    runMode: 'mastra' | 'fallback'
  }
  message?: string
  details?: unknown
}

const quickActions = [
  {
    label: 'Inventario',
    prompt: 'Revisame inventario disponible para leche y arroz con stock y precio.'
  },
  {
    label: 'Pedidos',
    prompt: 'Necesito el estado del pedido ORD-20260807-002 y su total.'
  },
  {
    label: 'Finanzas',
    prompt: 'Consulta saldo y credito disponible para cliente 5215550101010.'
  },
  {
    label: 'Devoluciones',
    prompt: 'Quiero levantar una devolucion porque recibi producto equivocado.'
  },
  {
    label: 'Handoff humano',
    prompt: 'Escalame con un asesor humano de forma urgente.'
  }
]

const createMessageId = () => `msg-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`

const describeErrorDetails = (details: unknown) => {
  if (typeof details === 'string' && details.trim()) {
    return details
  }

  if (typeof details === 'number' || typeof details === 'boolean') {
    return String(details)
  }

  if (details && typeof details === 'object') {
    try {
      return JSON.stringify(details)
    } catch {
      return 'Detalles no serializables'
    }
  }

  return undefined
}

export default function CrmChatPage() {
  const [sessionId] = useState(() => `web-${Math.random().toString(16).slice(2, 12)}`)
  const [messages, setMessages] = useState<Message[]>([
    {
      id: createMessageId(),
      role: 'assistant',
      content:
        'Hola, soy tu asistente CRM. Puedo ayudarte con inventario, pedidos, saldos, devoluciones y soporte humano.',
      metadata: {
        status: 'ok',
        intent: 'faq',
        runMode: 'fallback',
        actions: ['faq.reply'],
        handoffRequired: false
      }
    }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [lastMetadata, setLastMetadata] = useState<AssistantMetadata | null>(null)
  const [lastError, setLastError] = useState<string | null>(null)

  const canSend = useMemo(() => input.trim().length > 0 && !loading, [input, loading])

  const pushUserMessage = (content: string) => {
    setMessages(previous => [
      ...previous,
      {
        id: createMessageId(),
        role: 'user',
        content
      }
    ])
  }

  const pushAssistantMessage = (content: string, metadata: AssistantMetadata) => {
    setMessages(previous => [
      ...previous,
      {
        id: createMessageId(),
        role: 'assistant',
        content,
        metadata
      }
    ])
    setLastMetadata(metadata)
  }

  const sendMessage = async (rawMessage: string) => {
    const message = rawMessage.trim()
    if (!message || loading) {
      return
    }

    setLoading(true)
    setLastError(null)
    pushUserMessage(message)

    try {
      const response = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sessionId,
          message,
          locale: 'es-MX'
        })
      })

      const data = (await response.json()) as ChatApiPayload
      if (!response.ok || !data.success || !data.reply) {
        const errorMessage = data.message || 'No fue posible generar respuesta en este momento.'
        const metadata: AssistantMetadata = {
          status: 'error',
          intent: data.reply?.intent,
          runMode: data.reply?.runMode,
          handoffRequired: Boolean(data.reply?.handoff?.required),
          handoffReason: data.reply?.handoff?.reason,
          handoffTicketId: data.reply?.handoff?.ticketId,
          actions: data.reply?.actions || [],
          httpStatus: response.status,
          errorDetails: describeErrorDetails(data.details)
        }

        pushAssistantMessage(`${errorMessage} (HTTP ${response.status})`, metadata)
        setLastError(errorMessage)
        return
      }

      const metadata: AssistantMetadata = {
        status: 'ok',
        intent: data.reply.intent,
        runMode: data.reply.runMode,
        handoffRequired: Boolean(data.reply.handoff?.required),
        handoffReason: data.reply.handoff?.reason,
        handoffTicketId: data.reply.handoff?.ticketId,
        actions: data.reply.actions || [],
        httpStatus: response.status
      }

      pushAssistantMessage(data.reply.reply, metadata)
    } catch (error) {
      const metadata: AssistantMetadata = {
        status: 'error',
        intent: 'network_error',
        runMode: 'fallback',
        handoffRequired: false,
        actions: [],
        errorDetails: error instanceof Error ? error.message : 'Error de red desconocido'
      }
      pushAssistantMessage('Se produjo un error de red. Intenta nuevamente en unos segundos.', metadata)
      setLastError('Error de red al consultar /api/agent/chat')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    const message = input.trim()
    if (!message || loading) {
      return
    }

    setInput('')
    void sendMessage(message)
  }

  const handleQuickAction = (prompt: string) => {
    if (loading) {
      return
    }
    void sendMessage(prompt)
  }

  const latestIntent = lastMetadata?.intent || '-'
  const latestRunMode = lastMetadata?.runMode || '-'
  const latestHandoff = lastMetadata?.handoffRequired
    ? `${lastMetadata.handoffReason || 'Requiere derivacion'}${lastMetadata.handoffTicketId ? ` (${lastMetadata.handoffTicketId})` : ''}`
    : 'No requerido'

  return (
    <main className='mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-4 py-6 md:px-8 md:py-8'>
      <section className='rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6'>
        <h1 className='text-2xl font-semibold text-slate-900 md:text-3xl'>CRM Omnicanal Chat Console</h1>
        <p className='mt-2 text-sm text-slate-600 md:text-base'>
          Consola de validacion para flujo web/WhatsApp con visibilidad de intent, run mode, handoff y estados de error.
        </p>
        <p className='mt-2 text-xs text-slate-500'>Session ID: {sessionId}</p>
      </section>

      <section className='grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
        <article className='rounded-xl border border-slate-200 bg-white p-4 shadow-sm'>
          <p className='text-xs uppercase tracking-wide text-slate-500'>Ultimo intent</p>
          <p className='mt-2 text-sm font-semibold text-slate-900'>{latestIntent}</p>
        </article>
        <article className='rounded-xl border border-slate-200 bg-white p-4 shadow-sm'>
          <p className='text-xs uppercase tracking-wide text-slate-500'>Run mode</p>
          <p className='mt-2 text-sm font-semibold text-slate-900'>{latestRunMode}</p>
        </article>
        <article className='rounded-xl border border-slate-200 bg-white p-4 shadow-sm'>
          <p className='text-xs uppercase tracking-wide text-slate-500'>Handoff</p>
          <p className='mt-2 text-sm font-semibold text-slate-900'>{latestHandoff}</p>
        </article>
        <article className='rounded-xl border border-slate-200 bg-white p-4 shadow-sm'>
          <p className='text-xs uppercase tracking-wide text-slate-500'>Estado API</p>
          <p className={`mt-2 text-sm font-semibold ${lastError ? 'text-rose-700' : 'text-emerald-700'}`}>
            {lastError ? 'Con errores' : 'Operativo'}
          </p>
        </article>
      </section>

      {lastError && (
        <p className='rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700' role='alert'>
          {lastError}
        </p>
      )}

      <section className='rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5'>
        <h2 className='text-lg font-semibold text-slate-900'>Acciones rapidas de prueba</h2>
        <p className='mt-1 text-sm text-slate-600'>
          Ejecuta escenarios clave de inventario, pedidos, finanzas, devoluciones y handoff con un clic.
        </p>
        <div className='mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5'>
          {quickActions.map(action => (
            <button
              key={action.label}
              onClick={() => handleQuickAction(action.prompt)}
              disabled={loading}
              aria-label={`Probar caso de ${action.label}`}
              className='rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm text-slate-700 transition hover:border-blue-300 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50'
            >
              <p className='font-medium'>{action.label}</p>
              <p className='mt-1 line-clamp-2 text-xs text-slate-500'>{action.prompt}</p>
            </button>
          ))}
        </div>
      </section>

      <section className='flex min-h-[560px] flex-col rounded-2xl border border-slate-200 bg-white shadow-sm'>
        <div className='flex-1 space-y-4 overflow-y-auto p-4 md:p-6' aria-live='polite'>
          {messages.map(message => {
            const isAssistant = message.role === 'assistant'
            const isError = message.metadata?.status === 'error'
            return (
              <article
                key={message.id}
                className={`max-w-[92%] rounded-xl px-4 py-3 text-sm leading-6 md:max-w-[86%] md:text-[15px] ${
                  isAssistant
                    ? isError
                      ? 'mr-auto border border-rose-200 bg-rose-50 text-rose-900'
                      : 'mr-auto border border-slate-200 bg-slate-50 text-slate-800'
                    : 'ml-auto bg-blue-600 text-white'
                }`}
              >
                <p>{message.content}</p>
                {isAssistant && message.metadata && (
                  <div className='mt-3 flex flex-wrap gap-2 text-xs'>
                    {message.metadata.intent && (
                      <span className='rounded-full bg-blue-100 px-2 py-1 text-blue-700'>intent: {message.metadata.intent}</span>
                    )}
                    {message.metadata.runMode && (
                      <span className='rounded-full bg-indigo-100 px-2 py-1 text-indigo-700'>
                        runMode: {message.metadata.runMode}
                      </span>
                    )}
                    <span
                      className={`rounded-full px-2 py-1 ${
                        message.metadata.handoffRequired ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      handoff: {message.metadata.handoffRequired ? 'si' : 'no'}
                    </span>
                    <span className='rounded-full bg-slate-200 px-2 py-1 text-slate-700'>
                      actions: {message.metadata.actions?.length || 0}
                    </span>
                    {typeof message.metadata.httpStatus === 'number' && (
                      <span className='rounded-full bg-slate-200 px-2 py-1 text-slate-700'>
                        http: {message.metadata.httpStatus}
                      </span>
                    )}
                  </div>
                )}
                {isAssistant && message.metadata?.handoffRequired && message.metadata.handoffReason && (
                  <p className='mt-2 text-xs text-amber-700'>
                    Motivo handoff: {message.metadata.handoffReason}
                    {message.metadata.handoffTicketId ? ` (${message.metadata.handoffTicketId})` : ''}
                  </p>
                )}
                {isAssistant && message.metadata?.status === 'error' && message.metadata.errorDetails && (
                  <p className='mt-2 text-xs text-rose-700'>Detalle error: {message.metadata.errorDetails}</p>
                )}
              </article>
            )
          })}
        </div>

        <form onSubmit={handleSubmit} className='border-t border-slate-200 p-4 md:p-6'>
          <label htmlFor='chat-input' className='mb-2 block text-sm font-medium text-slate-700'>
            Mensaje
          </label>
          <div className='flex flex-col gap-3 md:flex-row'>
            <input
              id='chat-input'
              value={input}
              onChange={event => setInput(event.target.value)}
              placeholder='Ejemplo: Necesito estado del pedido ORD-20260807-002'
              className='h-11 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100'
            />
            <button
              type='submit'
              disabled={!canSend}
              className='h-11 rounded-lg bg-blue-600 px-5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300'
            >
              {loading ? 'Procesando...' : 'Enviar'}
            </button>
          </div>
          <p className='mt-2 text-xs text-slate-500'>
            Esta consola muestra metadata operativa de cada respuesta para validar integracion omnicanal end-to-end.
          </p>
        </form>
      </section>
    </main>
  )
}
