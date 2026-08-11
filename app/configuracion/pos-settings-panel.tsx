'use client'

import { useCallback, useEffect, useState } from 'react'

type PosSettings = {
  showIvaOnReceipt: boolean
  defaultIvaRate: number
  updatedAt: string
}

export const PosSettingsPanel = () => {
  const [settings, setSettings] = useState<PosSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleLoad = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/pos/settings')
      const payload = (await response.json()) as { success?: boolean; settings?: PosSettings }
      if (!response.ok || !payload.settings) {
        throw new Error('No fue posible cargar la configuración de punto de venta')
      }
      setSettings(payload.settings)
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
      const response = await fetch('/api/pos/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          showIvaOnReceipt: settings.showIvaOnReceipt,
          defaultIvaRate: settings.defaultIvaRate
        })
      })
      const payload = (await response.json()) as { success?: boolean; settings?: PosSettings; message?: string }
      if (!response.ok || !payload.settings) {
        throw new Error(payload.message || 'No fue posible guardar')
      }
      setSettings(payload.settings)
      setMessage('Configuración de recibo guardada')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <p className='text-sm text-slate-500'>Cargando preferencias de punto de venta…</p>
  }

  if (error && !settings) {
    return (
      <div className='rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700'>
        {error}
        <button
          type='button'
          onClick={() => void handleLoad()}
          className='mt-2 block font-medium underline'
          aria-label='Reintentar carga de configuración POS'
        >
          Reintentar
        </button>
      </div>
    )
  }

  if (!settings) return null

  const ivaPercent = (settings.defaultIvaRate * 100).toFixed(2)

  return (
    <section className='rounded-2xl border border-slate-200 bg-white p-6 shadow-sm'>
      <h2 className='text-lg font-semibold text-slate-950'>Punto de venta y recibo</h2>
      <p className='mt-2 text-sm text-slate-600'>
        El precio de piso en inventario se mantiene sin IVA. Al activar la opción, el recibo suma IVA por
        producto y muestra el desglose en cada línea.
      </p>

      <label className='mt-5 flex items-start gap-3 text-sm text-slate-700'>
        <input
          type='checkbox'
          className='mt-1'
          checked={settings.showIvaOnReceipt}
          onChange={event =>
            setSettings(current =>
              current ? { ...current, showIvaOnReceipt: event.target.checked } : current
            )
          }
          aria-label='Mostrar IVA en el precio final del recibo'
        />
        <span>
          <span className='font-medium'>Mostrar IVA en el precio final del recibo</span>
          <span className='mt-1 block text-xs text-slate-500'>
            Cada producto lleva su propio cálculo de IVA sobre el precio de piso registrado. El total del
            ticket incluye subtotal + IVA por línea.
          </span>
        </span>
      </label>

      <label className='mt-4 grid max-w-xs gap-1 text-sm text-slate-700'>
        Tasa de IVA predeterminada (%)
        <input
          type='number'
          min='0'
          max='100'
          step='0.01'
          value={ivaPercent}
          onChange={event => {
            const parsed = Number(event.target.value.replace(',', '.'))
            if (!Number.isFinite(parsed)) return
            setSettings(current =>
              current ? { ...current, defaultIvaRate: Math.max(0, Math.min(1, parsed / 100)) } : current
            )
          }}
          aria-label='Tasa de IVA predeterminada en porcentaje'
          className='h-10 rounded-lg border border-slate-300 px-3'
        />
        <span className='text-xs text-slate-500'>
          Predeterminado 16%. Puedes definir una tasa distinta por producto en inventario (campo avanzado).
        </span>
      </label>

      <div className='mt-5 flex items-center gap-3'>
        <button
          type='button'
          onClick={() => void handleSave()}
          disabled={saving}
          aria-label='Guardar configuración de recibo'
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
  )
}
