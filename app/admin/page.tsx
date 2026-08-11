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

const MetricSkeleton = () => (
  <article className='animate-pulse rounded-xl border border-slate-200 bg-white p-4 shadow-sm' aria-hidden='true'>
    <div className='h-2.5 w-20 rounded-full bg-slate-200' />
    <div className='mt-3 h-7 w-10 rounded-md bg-slate-200' />
  </article>
)

const SectionError = ({ message, onRetry }: { message: string; onRetry: () => void }) => (
  <div
    role='alert'
    className='flex flex-col items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between'
  >
    <div className='flex items-center gap-3'>
      <span aria-hidden='true' className='shrink-0 text-rose-400'>
        ⚠
      </span>
      <p className='text-sm font-medium text-rose-800'>{message}</p>
    </div>
    <button
      type='button'
      onClick={onRetry}
      aria-label='Reintentar carga'
      className='shrink-0 rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-rose-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400'
    >
      Reintentar
    </button>
  </div>
)

export default function AdminPage() {
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null)
  const [settings, setSettings] = useState<MastraSettings | null>(null)
  const [loadingMetrics, setLoadingMetrics] = useState(true)
  const [loadingSettings, setLoadingSettings] = useState(true)
  const [metricsError, setMetricsError] = useState<string | null>(null)
  const [settingsError, setSettingsError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  const handleLoadMetrics = useCallback(async () => {
    setLoadingMetrics(true)
    setMetricsError(null)
    try {
      const response = await fetch('/api/crm/dashboard')
      if (!response.ok) {
        throw new Error(`Error ${response.status}: no fue posible cargar el panel`)
      }
      const data = (await response.json()) as DashboardPayload
      setDashboard(data)
    } catch (error) {
      setMetricsError(error instanceof Error ? error.message : 'No fue posible cargar las métricas')
    } finally {
      setLoadingMetrics(false)
    }
  }, [])

  const handleLoadSettings = useCallback(async () => {
    setLoadingSettings(true)
    setSettingsError(null)
    try {
      const response = await fetch('/api/crm/mastra/settings')
      if (!response.ok) {
        throw new Error(`Error ${response.status}: no fue posible cargar la configuración`)
      }
      const data = (await response.json()) as { settings: MastraSettings }
      setSettings(data.settings)
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : 'No fue posible cargar la configuración')
    } finally {
      setLoadingSettings(false)
    }
  }, [])

  const handleLoadAll = useCallback(() => {
    void handleLoadMetrics()
    void handleLoadSettings()
  }, [handleLoadMetrics, handleLoadSettings])

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      if (cancelled) return
      await Promise.allSettled([handleLoadMetrics(), handleLoadSettings()])
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [handleLoadMetrics, handleLoadSettings])

  const handleSettingsSubmit = async () => {
    if (!settings || saving) return

    setSaving(true)
    setSaveMessage(null)
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
      setSaveMessage('Configuración guardada')
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : 'Error al guardar')
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

  const isLoading = loadingMetrics || loadingSettings
  const metricEntries = dashboard
    ? (Object.entries(metricLabels) as Array<[keyof typeof metricLabels, string]>)
    : []

  return (
    <main className='mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-8'>
      {/* Header */}
      <section className='flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between'>
        <div>
          <h1 className='text-3xl font-semibold text-slate-950'>Panel administrativo</h1>
          <p className='mt-1 text-sm text-slate-500'>Métricas en tiempo real y configuración del agente.</p>
        </div>
        <button
          type='button'
          onClick={handleLoadAll}
          disabled={isLoading}
          aria-label='Refrescar panel completo'
          className='h-10 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition hover:bg-blue-500 disabled:bg-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400'
        >
          {isLoading ? 'Cargando…' : 'Refrescar'}
        </button>
      </section>

      {/* Metrics section */}
      {metricsError ? (
        <SectionError
          message={metricsError}
          onRetry={handleLoadMetrics}
        />
      ) : loadingMetrics ? (
        <section
          aria-label='Cargando métricas'
          className='grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5'
        >
          {Array.from({ length: 9 }).map((_, i) => (
            <MetricSkeleton key={i} />
          ))}
        </section>
      ) : dashboard ? (
        <section
          aria-label='Métricas del sistema'
          className='grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5'
        >
          {metricEntries.map(([key, label]) => (
            <article key={key} className='rounded-xl border border-slate-200 bg-white p-4 shadow-sm'>
              <p className='text-xs uppercase tracking-wide text-slate-500'>{label}</p>
              <p className='mt-2 text-2xl font-semibold text-slate-950'>{dashboard.metrics[key] ?? 0}</p>
            </article>
          ))}
        </section>
      ) : null}

      {/* Settings section */}
      {settingsError ? (
        <SectionError
          message={settingsError}
          onRetry={handleLoadSettings}
        />
      ) : loadingSettings ? (
        <section
          aria-label='Cargando configuración'
          className='animate-pulse rounded-2xl border border-slate-200 bg-white p-6 shadow-sm'
        >
          <div className='h-5 w-48 rounded-md bg-slate-200' />
          <div className='mt-4 grid gap-3'>
            <div className='h-10 rounded-lg bg-slate-100' />
            <div className='h-10 rounded-lg bg-slate-100' />
            <div className='h-32 rounded-lg bg-slate-100' />
          </div>
        </section>
      ) : settings ? (
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
              className='h-10 rounded-lg border border-slate-300 px-3 focus:outline-none focus:ring-2 focus:ring-blue-300'
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
              className='rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300'
              aria-label='Instrucciones del agente'
            />
          </label>

          <fieldset className='grid gap-3 rounded-xl border border-slate-200 p-4'>
            <legend className='px-1 text-sm font-semibold text-slate-900'>
              DavinciAi — métricas ERP permitidas (solo lectura)
            </legend>
            <p className='text-xs text-slate-500'>
              El modelo solo puede consultar estas herramientas. No tiene acceso SQL arbitrario a la base.
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

          <div className='flex items-center gap-4'>
            <button
              type='button'
              onClick={() => void handleSettingsSubmit()}
              disabled={saving}
              aria-label='Guardar configuración de Mastra'
              className='h-10 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition hover:bg-blue-500 disabled:bg-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400'
            >
              {saving ? 'Guardando…' : 'Guardar configuración'}
            </button>
            {saveMessage ? (
              <p
                role='status'
                aria-live='polite'
                className={`text-sm font-medium ${saveMessage.includes('Error') || saveMessage.includes('error') || saveMessage.includes('posible') ? 'text-rose-600' : 'text-emerald-600'}`}
              >
                {saveMessage}
              </p>
            ) : null}
          </div>
        </section>
      ) : null}
    </main>
  )
}
