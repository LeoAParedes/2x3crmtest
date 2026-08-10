'use client'

import { useCallback, useEffect, useState } from 'react'

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
    // #region agent log
    void fetch('http://127.0.0.1:7470/ingest/f7f242f1-ff2d-40d4-bf0c-d535d5a2bbdb',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'449600'},body:JSON.stringify({sessionId:'449600',runId:'initial',hypothesisId:'E',location:'app/admin/page.tsx:74',message:'Admin viewport measured',data:{innerWidth:window.innerWidth,innerHeight:window.innerHeight,devicePixelRatio:window.devicePixelRatio,visualViewportScale:window.visualViewport?.scale},timestamp:Date.now()})}).catch(()=>{})
    // #endregion
    const timeoutId = window.setTimeout(() => {
      void handleLoad()
    }, 0)

    return () => {
      window.clearTimeout(timeoutId)
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
          <h2 className='text-xl font-semibold text-slate-950'>Control de Mastra</h2>
          <label className='flex items-center gap-3 text-sm text-slate-700'>
            <input
              type='checkbox'
              checked={settings.enabled}
              onChange={event => setSettings(current => (current ? { ...current, enabled: event.target.checked } : current))}
            />
            Agente activo
          </label>
          <label className='grid gap-1 text-sm text-slate-700'>
            Modelo
            <input
              value={settings.modelId}
              onChange={event => setSettings(current => (current ? { ...current, modelId: event.target.value } : current))}
              className='h-10 rounded-lg border border-slate-300 px-3'
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
            />
          </label>
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
