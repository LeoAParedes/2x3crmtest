'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'

import { ERP_TOOL_IDS, ERP_TOOL_LABELS, type ErpToolId } from '@/src/lib/ai/erp-tool-ids'

type MastraSettings = {
  enabled: boolean
  modelId: string
  instructions: string
  allowWriteActions: boolean
  allowFinancialActions: boolean
  maxReplyChars: number
  defaultLocale: string
  allowedErpTools: ErpToolId[]
  updatedAt: string
}

type SettingsResponse = {
  success: boolean
  settings: MastraSettings
  providerStatus: { llmConfigured: boolean }
}

const appOrigin =
  typeof window !== 'undefined' ? window.location.origin : 'https://2x3crmtest.vercel.app'

export const ChatbotPanel = () => {
  const [settings, setSettings] = useState<MastraSettings | null>(null)
  const [llmConfigured, setLlmConfigured] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const twilioWebhook = `${appOrigin}/api/whatsapp/twilio/webhook`

  const handleLoad = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/crm/mastra/settings')
      const payload = (await response.json()) as SettingsResponse
      if (!response.ok || !payload.settings) {
        throw new Error('No fue posible cargar la configuración del chatbot')
      }
      setSettings(payload.settings)
      setLlmConfigured(payload.providerStatus?.llmConfigured ?? false)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Error de carga')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    queueMicrotask(() => {
      void handleLoad()
    })
  }, [handleLoad])

  const handleSave = async () => {
    if (!settings || saving) return
    setSaving(true)
    setMessage(null)
    setError(null)
    try {
      const response = await fetch('/api/crm/mastra/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      })
      const payload = (await response.json()) as SettingsResponse & { message?: string }
      if (!response.ok || !payload.settings) {
        throw new Error(payload.message || 'No fue posible guardar')
      }
      setSettings(payload.settings)
      setLlmConfigured(payload.providerStatus?.llmConfigured ?? false)
      setMessage('Guardado')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const handleToggleErpTool = (toolId: ErpToolId) => {
    setSettings(current => {
      if (!current) return current
      const enabled = current.allowedErpTools.includes(toolId)
      return {
        ...current,
        allowedErpTools: enabled
          ? current.allowedErpTools.filter(id => id !== toolId)
          : [...current.allowedErpTools, toolId]
      }
    })
  }

  const handleCopyWebhook = async () => {
    try {
      await navigator.clipboard.writeText(twilioWebhook)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('No se pudo copiar la URL')
    }
  }

  if (loading) {
    return <p className='text-sm text-slate-500'>Cargando…</p>
  }

  if (error && !settings) {
    return (
      <div className='rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700'>
        {error}
        <button
          type='button'
          onClick={() => void handleLoad()}
          className='mt-2 block font-medium underline'
          aria-label='Reintentar carga del chatbot'
        >
          Reintentar
        </button>
      </div>
    )
  }

  if (!settings) return null

  return (
    <div className='space-y-6'>
      <section className='rounded-2xl border border-slate-200 bg-white p-6 shadow-sm'>
        <div className='flex flex-wrap items-start justify-between gap-3'>
          <h2 className='text-lg font-semibold text-slate-950'>DavinciAi</h2>
          <Link
            href='/crm'
            className='inline-flex h-9 items-center rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50'
            aria-label='Abrir consola de chat web'
          >
            Consola web
          </Link>
        </div>

        <div
          className={`mt-4 rounded-lg border px-3 py-2 text-sm ${
            llmConfigured
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-amber-200 bg-amber-50 text-amber-900'
          }`}
        >
          {llmConfigured ? 'OPENAI_API_KEY lista' : 'Falta OPENAI_API_KEY en Vercel'}
        </div>

        <label className='mt-4 flex items-center gap-3 text-sm text-slate-700'>
          <input
            type='checkbox'
            checked={settings.enabled}
            onChange={event =>
              setSettings(current => (current ? { ...current, enabled: event.target.checked } : current))
            }
            aria-label='Agente DavinciAi activo'
          />
          Agente activo
        </label>

        <label className='mt-4 grid gap-1 text-sm text-slate-700'>
          Modelo
          <input
            value={settings.modelId}
            onChange={event =>
              setSettings(current => (current ? { ...current, modelId: event.target.value } : current))
            }
            aria-label='Modelo del agente'
            className='h-10 rounded-lg border border-slate-300 px-3'
          />
        </label>

        <label className='mt-4 grid gap-1 text-sm text-slate-700'>
          Instrucciones
          <textarea
            rows={6}
            value={settings.instructions}
            onChange={event =>
              setSettings(current => (current ? { ...current, instructions: event.target.value } : current))
            }
            aria-label='Instrucciones del agente'
            className='rounded-lg border border-slate-300 px-3 py-2'
          />
        </label>

        <div className='mt-4 grid gap-3 sm:grid-cols-2'>
          <label className='flex items-center gap-2 text-sm text-slate-700'>
            <input
              type='checkbox'
              checked={settings.allowWriteActions}
              onChange={event =>
                setSettings(current =>
                  current ? { ...current, allowWriteActions: event.target.checked } : current
                )
              }
              aria-label='Permitir acciones de escritura del agente'
            />
            Acciones de escritura
          </label>
          <label className='flex items-center gap-2 text-sm text-slate-700'>
            <input
              type='checkbox'
              checked={settings.allowFinancialActions}
              onChange={event =>
                setSettings(current =>
                  current ? { ...current, allowFinancialActions: event.target.checked } : current
                )
              }
              aria-label='Permitir acciones financieras del agente'
            />
            Acciones financieras
          </label>
        </div>

        <fieldset className='mt-5 grid gap-3 rounded-xl border border-slate-200 p-4'>
          <legend className='px-1 text-sm font-semibold text-slate-900'>Herramientas ERP</legend>
          <div className='grid gap-2 sm:grid-cols-2'>
            {ERP_TOOL_IDS.map(toolId => (
              <label key={toolId} className='flex items-start gap-3 text-sm text-slate-700'>
                <input
                  type='checkbox'
                  className='mt-1'
                  checked={settings.allowedErpTools.includes(toolId)}
                  onChange={() => handleToggleErpTool(toolId)}
                  aria-label={ERP_TOOL_LABELS[toolId]}
                />
                <span>
                  <span className='font-medium'>{ERP_TOOL_LABELS[toolId]}</span>
                  <span className='mt-0.5 block font-mono text-xs text-slate-400'>{toolId}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className='mt-5 flex items-center gap-3'>
          <button
            type='button'
            onClick={() => void handleSave()}
            disabled={saving}
            aria-label='Guardar configuración del chatbot'
            className='h-10 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white disabled:opacity-50'
          >
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
          {message ? (
            <p role='status' className='text-sm font-medium text-emerald-700'>
              {message}
            </p>
          ) : null}
          {error ? (
            <p role='alert' className='text-sm font-medium text-rose-700'>
              {error}
            </p>
          ) : null}
        </div>
      </section>

      <section className='rounded-2xl border border-slate-200 bg-white p-6 shadow-sm'>
        <h3 className='text-base font-semibold text-slate-900'>WhatsApp (Twilio)</h3>
        <label className='mt-4 grid gap-1 text-sm text-slate-700'>
          Webhook URL
          <div className='flex flex-col gap-2 sm:flex-row'>
            <code className='block min-w-0 flex-1 break-all rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-800'>
              {twilioWebhook}
            </code>
            <button
              type='button'
              onClick={() => void handleCopyWebhook()}
              aria-label='Copiar webhook de Twilio'
              className='h-10 shrink-0 rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-800 hover:bg-slate-50'
            >
              {copied ? 'Copiado' : 'Copiar'}
            </button>
          </div>
        </label>
        <p className='mt-3 text-xs text-slate-500'>
          Twilio → WhatsApp Sender → Incoming messages → HTTP POST. Vars en Vercel:{' '}
          <code className='font-mono'>TWILIO_AUTH_TOKEN</code>,{' '}
          <code className='font-mono'>TWILIO_ACCOUNT_SID</code>,{' '}
          <code className='font-mono'>OPENAI_API_KEY</code>.
        </p>
      </section>
    </div>
  )
}
