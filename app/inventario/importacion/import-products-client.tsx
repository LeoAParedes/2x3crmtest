'use client'

import { useMemo, useState, type ChangeEvent } from 'react'

type ImportResponse = {
  success?: boolean
  summary?: {
    created: number
    updated: number
    failed: number
  }
  errors?: Array<{ line: number; reason: string }>
  message?: string
}

const csvTemplate = `sku,producto,categoria,unidad,precio,stock
LEC-001,Leche Entera 1L,Lacteos,unidad,4.50,120
TOM-001,Tomate,Frutas y Verduras,kg,28.50,120
ARR-001,Arroz Extra 1kg,Abarrotes,unidad,5.20,80`

export const ImportProductsClient = () => {
  const [csv, setCsv] = useState(csvTemplate)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ImportResponse | null>(null)

  const canSubmit = useMemo(() => csv.trim().length > 0 && !loading, [csv, loading])

  const handleImport = async () => {
    if (!canSubmit) return
    setLoading(true)
    setResult(null)
    try {
      const response = await fetch('/api/inventario/importar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv })
      })
      const payload = (await response.json()) as ImportResponse
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || 'No fue posible importar productos')
      }
      setResult(payload)
    } catch (error) {
      setResult({
        success: false,
        message: error instanceof Error ? error.message : 'Error desconocido durante importación'
      })
    } finally {
      setLoading(false)
    }
  }

  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const text = await file.text()
    setCsv(text)
  }

  return (
    <main className='mx-auto max-w-6xl px-4 py-8 md:px-8'>
      <section className='rounded-2xl border border-slate-200 bg-white p-6 shadow-sm'>
        <h1 className='text-2xl font-semibold text-slate-950'>Importación de productos</h1>
        <p className='mt-2 text-sm text-slate-600'>
          Sube un CSV o pega el contenido para crear/actualizar inventario en base de datos del servidor.
        </p>
      </section>

      <section className='mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm'>
        <div className='grid gap-4'>
          <label className='grid gap-2 text-sm font-medium text-slate-700'>
            Archivo CSV
            <input
              type='file'
              accept='.csv,text/csv'
              onChange={event => void handleFileUpload(event)}
              aria-label='Seleccionar archivo CSV de productos'
              className='rounded-lg border border-slate-300 px-3 py-2 text-sm'
            />
          </label>
          <label className='grid gap-2 text-sm font-medium text-slate-700'>
            Contenido CSV
            <textarea
              value={csv}
              onChange={event => setCsv(event.target.value)}
              rows={14}
              className='rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs text-slate-900'
            />
          </label>
          <div>
            <button
              type='button'
              aria-label='Ejecutar importación de productos'
              onClick={() => void handleImport()}
              disabled={!canSubmit}
              className='rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50'
            >
              {loading ? 'Importando...' : 'Importar productos'}
            </button>
          </div>
        </div>
      </section>

      {result ? (
        <section className='mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm'>
          {result.success && result.summary ? (
            <>
              <h2 className='text-lg font-semibold text-slate-900'>Resultado</h2>
              <p className='mt-2 text-sm text-slate-700'>
                Creados: {result.summary.created} | Actualizados: {result.summary.updated} | Fallidos: {result.summary.failed}
              </p>
              {result.errors?.length ? (
                <ul className='mt-3 list-disc space-y-1 pl-5 text-sm text-amber-700'>
                  {result.errors.slice(0, 10).map(error => (
                    <li key={`${error.line}-${error.reason}`}>Línea {error.line}: {error.reason}</li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : (
            <p className='text-sm text-rose-700'>{result.message || 'Error en importación'}</p>
          )}
        </section>
      ) : null}
    </main>
  )
}
