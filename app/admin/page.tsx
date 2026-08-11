'use client'

import { useCallback, useEffect, useState } from 'react'

import { ERP_TOOL_IDS, ERP_TOOL_LABELS, type ErpToolId } from '@/src/lib/ai/erp-tool-ids'

type DashboardPayload = {
  success: boolean
  metrics: {
    generatedAt: string
    inventoryItems: number
    lowStockItems: number
    totalOrders: number
    openBalances: number
    openReturnCases: number
    openHandoffs: number
    pendingPaymentPromises: number
    pendingApprovals: number
    recentConversations: number
  }
}

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

const metricLabels: Record<Exclude<keyof DashboardPayload['metrics'], 'generatedAt'>, string> = {
  inventoryItems: 'Productos',
  lowStockItems: 'Stock bajo',
  totalOrders: 'Pedidos',
  openBalances: 'Saldos abiertos',
  openReturnCases: 'Devoluciones',
  openHandoffs: 'Handoffs',
  pendingPaymentPromises: 'Promesas',
  pendingApprovals: 'Aprobaciones',
  recentConversations: 'Conversaciones'
}

export default function AdminPage() {
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null)
  const [settings, setSettings] = useState<MastraSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const handleLoad = useCallback(async () => {
    setLoading(true)
    setMessage(null)
    try {
      const [dashboardResponse, settingsResponse] = await Promise.all([
        fetch('/api/crm/dashboard'),
        fetch('/api/crm/mastra/settings')
      ])
      if (!dashboardResponse.ok || !settingsResponse.ok) {
        throw new Error('No fue posible cargar el panel')
      }
      const dashboardData = (await dashboardResponse.json()) as DashboardPayload
      const settingsData = (await settingsResponse.json()) as { settings: MastraSettings }
      setDashboard(dashboardData)
      setSettings(settingsData.settings)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Error de carga')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      if (cancelled) return
      await handleLoad()
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [handleLoad])

  const handleSettingsSubmit = async () => {
    if (!settings || saving) return

    setSaving(true)
    setMessage(null)
    try {
      const response = await fetch('/api/crm/mastra/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      })
      const data = (await response.json()) as { settings?: MastraSettings; message?: string }
      if (!response.ok || !data.settings) {
        throw new Error(data.message || 'No fue posible guardar la configuración')
      }
      setSettings(data.settings)
      setMessage('Configuración guardada')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const handleToggleErpTool = (toolId: ErpToolId) => {
    setSettings(current => {
      if (!current) return current
      const enabled = current.allowedErpTools.includes(toolId)
      const allowedErpTools = enabled
        ? current.allowedErpTools.filter(id => id !== toolId)
        : [...current.allowedErpTools, toolId]
      return { ...current, allowedErpTools }
    })
  }

  const metricEntries = dashboard
    ? (Object.entries(metricLabels) as Array<[keyof typeof metricLabels, string]>)
    : []

  return (
    <main className='mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-8'>
      <section className='flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between'>
        <div>
          <h1 className='text-3xl font-semibold text-slate-950'>Panel administrativo</h1>
          <p className='mt-1 text-sm text-slate-600'>Datos persistidos y configuración del agente.</p>
        </div>
        <button
          type='button'
          onClick={() => void handleLoad()}
          disabled={loading}
          aria-label='Refrescar panel'
          className='h-10 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white disabled:bg-slate-400'
        >
          {loading ? 'Cargando...' : 'Refrescar'}
        </button>
      </section>

      <section className='grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5'>
        {metricEntries.map(([key, label]) => (
          <article key={key} className='rounded-xl border border-slate-200 bg-white p-4 shadow-sm'>
            <p className='text-xs uppercase tracking-wide text-slate-500'>{label}</p>
            <p className='mt-2 text-2xl font-semibold text-slate-950'>{dashboard?.metrics[key] ?? 0}</p>
          </article>
        ))}
      </section>

      {settings && (
        <section className='grid gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm'>
          <h2 className='text-xl font-semibold text-slate-950'>Control de Mastra / DavinciAi</h2>
          <label className='flex items-center gap-3 text-sm text-slate-700'>
            <input
              type='checkbox'
              checked={settings.enabled}
              onChange={event => setSettings(current => (current ? { ...current, enabled: event.target.checked } : current))}
              aria-label='Agente activo'
            />
            Agente activo
          </label>
          <label className='grid gap-1 text-sm text-slate-700'>
            Modelo
            <input
              value={settings.modelId}
              onChange={event => setSettings(current => (current ? { ...current, modelId: event.target.value } : current))}
              className='h-10 rounded-lg border border-slate-300 px-3'
              aria-label='Modelo del agente'
            />
          </label>
          <label className='grid gap-1 text-sm text-slate-700'>
            Instrucciones
            <textarea
              rows={8}
              value={settings.instructions}
              onChange={event =>
                setSettings(current => (current ? { ...current, instructions: event.target.value } : current))
              }
              className='rounded-lg border border-slate-300 px-3 py-2'
              aria-label='Instrucciones del agente'
            />
          </label>

          <fieldset className='grid gap-3 rounded-xl border border-slate-200 p-4'>
            <legend className='px-1 text-sm font-semibold text-slate-900'>
              DavinciAi — métricas ERP permitidas (solo lectura)
            </legend>
            <p className='text-xs text-slate-600'>
              El modelo solo puede consultar estas herramientas. No tiene SQL ni acceso arbitrario a la base.
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
                    <span className='mt-0.5 block font-mono text-xs text-slate-500'>{toolId}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className='rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-xs text-slate-600'>
            <p className='font-medium text-slate-800'>Canales WhatsApp (DavinciAi)</p>
            <ul className='mt-2 list-disc space-y-1 pl-4'>
              <li>
                Evolution API (recomendado):{' '}
                <code className='font-mono'>/api/whatsapp/evolution/webhook</code>
              </li>
              <li>
                Meta Cloud API: <code className='font-mono'>/api/whatsapp/webhook</code>
              </li>
              <li>
                Twilio (secundario / TwiML): <code className='font-mono'>/api/whatsapp/twilio/webhook</code>
              </li>
            </ul>
            <p className='mt-2 text-slate-500'>
              No se requiere Twilio. Configura{' '}
              <code className='font-mono'>EVOLUTION_API_URL</code>,{' '}
              <code className='font-mono'>EVOLUTION_API_KEY</code> y{' '}
              <code className='font-mono'>EVOLUTION_INSTANCE</code>.
            </p>
          </div>

          <button
            type='button'
            onClick={() => void handleSettingsSubmit()}
            disabled={saving}
            aria-label='Guardar configuración de Mastra'
            className='h-10 w-fit rounded-lg bg-blue-600 px-4 text-sm font-medium text-white disabled:bg-slate-400'
          >
            {saving ? 'Guardando...' : 'Guardar configuración'}
          </button>
        </section>
      )}

      <p aria-live='polite' className='text-sm text-slate-700'>
        {message}
      </p>
    </main>
  )
}
