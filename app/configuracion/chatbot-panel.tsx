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

type MetaStatusResponse = {
  metaSubscription?: {
    ok: boolean
    tokenAppId: string | null
    tokenAppName: string | null
    tokenAppIsSubscribed: boolean | null
    messagesFieldSubscribed: boolean | null
    hasOnlyMetaInternalTestApp: boolean
    phoneDisplayNumber: string | null
    subscribedApps: Array<{ id: string; name: string; isMetaInternalTestApp: boolean }>
    appWebhookSubscriptions?: Array<{
      object?: string
      callbackUrl?: string
      active?: boolean
      fields: string[]
    }>
    hints: string[]
  }
  webhookDebug?: {
    lastHit: { stage: string; at: string } | null
  }
  hints?: string[]
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
  const [metaStatus, setMetaStatus] = useState<MetaStatusResponse | null>(null)
  const [metaBusy, setMetaBusy] = useState(false)

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
      setMessage('Configuración del chatbot guardada')
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

  const handleCheckMetaStatus = async () => {
    setMetaBusy(true)
    setError(null)
    try {
      const response = await fetch('/api/whatsapp/status?meta=1')
      const payload = (await response.json()) as MetaStatusResponse
      if (!response.ok) {
        throw new Error('No fue posible consultar el estado de Meta')
      }
      setMetaStatus(payload)
      setMessage(
        payload.metaSubscription?.tokenAppIsSubscribed
          ? 'Tu app ya está suscrita al WABA'
          : 'Tu app aún NO está suscrita al WABA (Messaging verde no basta)'
      )
    } catch (checkError) {
      setError(checkError instanceof Error ? checkError.message : 'Error al consultar Meta')
    } finally {
      setMetaBusy(false)
    }
  }

  const handleSubscribeMetaApp = async () => {
    setMetaBusy(true)
    setError(null)
    setMessage(null)
    try {
      const response = await fetch('/api/whatsapp/subscribe', { method: 'POST' })
      const payload = (await response.json()) as {
        success?: boolean
        message?: string
        callbackUri?: string
        subscription?: MetaStatusResponse['metaSubscription']
      }
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || 'No fue posible suscribir la app al WABA')
      }
      setMetaStatus(current => ({
        ...current,
        metaSubscription: payload.subscription
      }))
      setMessage(
        payload.subscription?.tokenAppIsSubscribed
          ? `App suscrita con callback ${payload.callbackUri || ''}. Escribe a +1 555-204-7381.`
          : 'Subscribe ejecutado, pero Graph aún no lista tu app. Revisa el token/app en Meta.'
      )
    } catch (subscribeError) {
      setError(subscribeError instanceof Error ? subscribeError.message : 'Error al suscribir')
    } finally {
      setMetaBusy(false)
    }
  }

  if (loading) {
    return <p className='text-sm text-slate-500'>Cargando DavinciAi…</p>
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

  const evolutionWebhook = `${appOrigin}/api/whatsapp/evolution/webhook`
  const metaWebhook = `${appOrigin}/api/whatsapp/webhook`
  const metaSub = metaStatus?.metaSubscription

  return (
    <div className='space-y-6'>
      <section className='rounded-2xl border border-slate-200 bg-white p-6 shadow-sm'>
        <div className='flex flex-wrap items-start justify-between gap-3'>
          <div>
            <h2 className='text-lg font-semibold text-slate-950'>DavinciAi — Chatbot ERP</h2>
            <p className='mt-1 text-sm text-slate-600'>
              Agente omnicanal para web y WhatsApp. Consulta métricas reales del ERP mediante herramientas
              de solo lectura (sin SQL arbitrario).
            </p>
          </div>
          <Link
            href='/crm'
            className='inline-flex h-9 items-center rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50'
            aria-label='Abrir consola de chat web'
          >
            Consola web /crm
          </Link>
        </div>

        <div
          className={`mt-4 rounded-lg border px-3 py-2 text-sm ${
            llmConfigured
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-amber-200 bg-amber-50 text-amber-900'
          }`}
        >
          {llmConfigured
            ? 'OPENAI_API_KEY detectada — el modelo puede responder.'
            : 'Falta OPENAI_API_KEY en el entorno. Define la variable y redespliega.'}
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
          Instrucciones del sistema
          <textarea
            rows={8}
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
            Permitir acciones de escritura (devoluciones, handoff)
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
            Permitir acciones financieras automáticas
          </label>
        </div>

        <fieldset className='mt-5 grid gap-3 rounded-xl border border-slate-200 p-4'>
          <legend className='px-1 text-sm font-semibold text-slate-900'>
            Consultas a la base de datos (herramientas ERP permitidas)
          </legend>
          <p className='text-xs text-slate-500'>
            El chatbot solo puede usar estas herramientas para leer ventas, inventario, flujo de caja y gastos.
            Ejemplo: «¿cuánto vendimos hoy?» o «productos con stock bajo».
          </p>
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
            {saving ? 'Guardando…' : 'Guardar chatbot'}
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

      <section className='rounded-2xl border border-slate-200 bg-white p-6 shadow-sm text-sm text-slate-700'>
        <h3 className='text-base font-semibold text-slate-900'>Meta WhatsApp Cloud — diagnóstico</h3>
        <p className='mt-2'>
          Si en Meta ves Messaging en verde pero el bot no responde, casi siempre el WABA está ligado a la app
          interna de Meta (<span className='font-mono text-xs'>WA DevX…</span>) y no a la tuya.
        </p>
        <code className='mt-3 block break-all rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-800'>
          Webhook: {metaWebhook}
        </code>
        <div className='mt-4 flex flex-wrap gap-3'>
          <button
            type='button'
            onClick={() => void handleCheckMetaStatus()}
            disabled={metaBusy}
            aria-label='Comprobar suscripción Meta WABA'
            className='h-10 rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50'
          >
            Comprobar estado Meta
          </button>
          <button
            type='button'
            onClick={() => void handleSubscribeMetaApp()}
            disabled={metaBusy}
            aria-label='Suscribir app al WABA de Meta'
            className='h-10 rounded-lg bg-sky-600 px-4 text-sm font-semibold text-white disabled:opacity-50'
          >
            Suscribir app al WABA
          </button>
        </div>
        {metaSub ? (
          <div className='mt-4 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700'>
            <p>
              App del token:{' '}
              <strong>
                {metaSub.tokenAppName || 'desconocida'} ({metaSub.tokenAppId || 'sin id'})
              </strong>
            </p>
            <p>
              Suscrita al WABA:{' '}
              <strong className={metaSub.tokenAppIsSubscribed ? 'text-emerald-700' : 'text-rose-700'}>
                {metaSub.tokenAppIsSubscribed ? 'Sí' : 'No'}
              </strong>
            </p>
            <p>
              Campo webhook messages:{' '}
              <strong
                className={
                  metaSub.messagesFieldSubscribed ? 'text-emerald-700' : 'text-rose-700'
                }
              >
                {metaSub.messagesFieldSubscribed == null
                  ? 'desconocido'
                  : metaSub.messagesFieldSubscribed
                    ? 'Sí'
                    : 'No'}
              </strong>
            </p>
            <p>Número Business: {metaSub.phoneDisplayNumber || '—'}</p>
            <p>
              Apps en Graph:{' '}
              {metaSub.subscribedApps.map(app => `${app.name}${app.isMetaInternalTestApp ? ' (Meta interna)' : ''}`).join(', ') ||
                'ninguna'}
            </p>
            {metaStatus?.webhookDebug?.lastHit ? (
              <p>
                Último webhook: {metaStatus.webhookDebug.lastHit.stage} @ {metaStatus.webhookDebug.lastHit.at}
              </p>
            ) : (
              <p className='text-amber-800'>Sin POST de webhook reciente en esta instancia.</p>
            )}
          </div>
        ) : null}
        <ol className='mt-4 list-decimal space-y-2 pl-5 text-slate-600'>
          <li>Pulsa <strong>Suscribir app al WABA</strong> (requiere sesión admin).</li>
          <li>Pulsa <strong>Comprobar estado Meta</strong> hasta ver “Suscrita al WABA: Sí”.</li>
          <li>
            En Meta Developers, asegúrate de estar en <strong>la misma app</strong> del token (no en el playground
            DevX). Ruta típica: App → WhatsApp → API Setup / Configuration → Webhook callback = la URL de arriba,
            campo <code className='font-mono text-xs'>messages</code> marcado.
          </li>
          <li>
            Escribe a <strong>+1 555-204-7381</strong> desde tu número de prueba.
          </li>
        </ol>
      </section>

      <section className='rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-700'>
        <h3 className='text-base font-semibold text-slate-900'>Evolution API — WhatsApp</h3>
        <p className='mt-2'>
          Canal recomendado. No requiere Twilio ni Meta Cloud. Configura las variables en Vercel y apunta el
          webhook de tu instancia Evolution a esta URL:
        </p>
        <code className='mt-3 block break-all rounded-lg bg-white px-3 py-2 font-mono text-xs text-slate-800'>
          {evolutionWebhook}
        </code>
        <ol className='mt-4 list-decimal space-y-2 pl-5 text-slate-600'>
          <li>Crea o conecta la instancia en Evolution (<code className='font-mono text-xs'>EVOLUTION_INSTANCE</code>).</li>
          <li>
            Define en Vercel: <code className='font-mono text-xs'>EVOLUTION_API_URL</code>,{' '}
            <code className='font-mono text-xs'>EVOLUTION_API_KEY</code>,{' '}
            <code className='font-mono text-xs'>EVOLUTION_INSTANCE</code> y{' '}
            <code className='font-mono text-xs'>OPENAI_API_KEY</code>.
          </li>
          <li>
            En Evolution, webhook URL = la de arriba, eventos mínimos:{' '}
            <code className='font-mono text-xs'>MESSAGES_UPSERT</code>.
          </li>
          <li>Escanea QR hasta estado <strong>open</strong>.</li>
          <li>Prueba por WhatsApp: «¿cuánto vendimos hoy?» — debe responder con cifra real del ERP.</li>
        </ol>
        <p className='mt-3 text-xs text-slate-500'>
          Otros canales: Meta <code className='font-mono'>/api/whatsapp/webhook</code> · Twilio{' '}
          <code className='font-mono'>/api/whatsapp/twilio/webhook</code>
        </p>
      </section>
    </div>
  )
}
