'use client'

import { useState } from 'react'

type PromoType = 'porcentaje' | 'monto_fijo' | '2x1' | 'bundle'

type Promotion = {
  id: string
  name: string
  type: PromoType
  value: number
  minPurchase: number
  description: string
  active: boolean
  expiresAt: string | null
}

const EXAMPLE_PROMOTIONS: Promotion[] = [
  {
    id: '1',
    name: 'Descuento de bienvenida',
    type: 'porcentaje',
    value: 10,
    minPurchase: 0,
    description: '10 % de descuento en la primera compra del día',
    active: true,
    expiresAt: null
  },
  {
    id: '2',
    name: 'Compra mínima $200',
    type: 'monto_fijo',
    value: 20,
    minPurchase: 200,
    description: '$20 de descuento en compras de $200 o más',
    active: false,
    expiresAt: null
  }
]

const promoTypeLabels: Record<PromoType, string> = {
  porcentaje: 'Porcentaje (%)',
  monto_fijo: 'Monto fijo ($)',
  '2x1': '2 × 1',
  bundle: 'Paquete / bundle'
}

export const PromocionesClient = () => {
  const [promotions] = useState<Promotion[]>(EXAMPLE_PROMOTIONS)
  const [name, setName] = useState('')
  const [promoType, setPromoType] = useState<PromoType>('porcentaje')
  const [value, setValue] = useState('')
  const [description, setDescription] = useState('')
  const [showForm, setShowForm] = useState(false)

  const activeCount = promotions.filter(promo => promo.active).length
  const inactiveCount = promotions.length - activeCount

  return (
    <main className='mx-auto max-w-5xl px-4 py-8 md:px-8'>
      <section className='flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between'>
        <div>
          <h1 className='text-2xl font-semibold text-slate-950'>Descuentos y promociones</h1>
          <p className='mt-1 text-sm text-slate-600'>
            Administra promociones activas, descuentos por porcentaje o monto, y paquetes de productos.
          </p>
          <p className='mt-1 text-xs text-amber-700'>
            Módulo de configuración — la aplicación automática en POS se activa con la integración de descuentos.
          </p>
        </div>
        <button
          type='button'
          aria-label='Crear nueva promoción'
          onClick={() => setShowForm(current => !current)}
          className='h-10 self-start rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 sm:self-auto'
        >
          {showForm ? 'Cancelar' : 'Nueva promoción'}
        </button>
      </section>

      <section className='mt-5 grid gap-3 sm:grid-cols-3'>
        <article className='border border-slate-200 bg-white px-4 py-3'>
          <p className='text-[11px] font-medium uppercase tracking-wide text-slate-500'>Promociones activas</p>
          <p className='mt-1 text-xl font-semibold tabular-nums text-emerald-800'>{activeCount}</p>
        </article>
        <article className='border border-slate-200 bg-white px-4 py-3'>
          <p className='text-[11px] font-medium uppercase tracking-wide text-slate-500'>Inactivas</p>
          <p className='mt-1 text-xl font-semibold tabular-nums text-slate-950'>{inactiveCount}</p>
        </article>
        <article className='border border-slate-200 bg-white px-4 py-3'>
          <p className='text-[11px] font-medium uppercase tracking-wide text-slate-500'>Total definidas</p>
          <p className='mt-1 text-xl font-semibold tabular-nums text-slate-950'>{promotions.length}</p>
        </article>
      </section>

      {showForm ? (
        <section className='mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm'>
          <h2 className='text-lg font-semibold text-slate-950'>Nueva promoción</h2>
          <p className='mt-1 text-sm text-slate-600'>Define el nombre, tipo y valor del descuento.</p>
          <div className='mt-5 grid gap-4 sm:grid-cols-2'>
            <label className='grid gap-1 text-sm text-slate-700'>
              Nombre de la promoción
              <input
                type='text'
                value={name}
                onChange={event => setName(event.target.value)}
                placeholder='Ej. Descuento de fin de semana'
                aria-label='Nombre de la promoción'
                className='h-10 rounded-lg border border-slate-300 px-3 text-sm'
              />
            </label>
            <label className='grid gap-1 text-sm text-slate-700'>
              Tipo de descuento
              <select
                value={promoType}
                onChange={event => setPromoType(event.target.value as PromoType)}
                aria-label='Tipo de descuento'
                className='h-10 rounded-lg border border-slate-300 px-3 text-sm'
              >
                {(Object.entries(promoTypeLabels) as Array<[PromoType, string]>).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className='grid gap-1 text-sm text-slate-700'>
              Valor ({promoType === 'porcentaje' ? '%' : '$'})
              <input
                type='number'
                min='0'
                step='0.01'
                value={value}
                onChange={event => setValue(event.target.value)}
                placeholder='0'
                aria-label='Valor del descuento'
                className='h-10 rounded-lg border border-slate-300 px-3 text-sm'
              />
            </label>
            <label className='grid gap-1 text-sm text-slate-700'>
              Descripción
              <input
                type='text'
                value={description}
                onChange={event => setDescription(event.target.value)}
                placeholder='Descripción corta para el cajero'
                aria-label='Descripción de la promoción'
                className='h-10 rounded-lg border border-slate-300 px-3 text-sm'
              />
            </label>
          </div>
          <p className='mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800'>
            La persistencia de promociones estará disponible en la próxima actualización del módulo de descuentos. Por
            ahora puedes diseñar y documentar las reglas aquí.
          </p>
          <div className='mt-4 flex gap-3'>
            <button
              type='button'
              disabled={!name.trim() || !value}
              aria-label='Guardar promoción'
              className='h-10 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white disabled:opacity-50'
            >
              Guardar promoción
            </button>
            <button
              type='button'
              aria-label='Cancelar'
              onClick={() => setShowForm(false)}
              className='h-10 rounded-lg border border-slate-300 px-4 text-sm text-slate-700'
            >
              Cancelar
            </button>
          </div>
        </section>
      ) : null}

      <section className='mt-6 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm'>
        <div className='border-b border-slate-200 px-4 py-3'>
          <h2 className='text-sm font-semibold text-slate-900'>Promociones definidas</h2>
        </div>
        <table className='min-w-full divide-y divide-slate-200'>
          <thead className='bg-slate-50'>
            <tr>
              <th className='px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500'>Nombre</th>
              <th className='px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500'>Tipo</th>
              <th className='px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500'>Valor</th>
              <th className='px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500'>Descripción</th>
              <th className='px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500'>Estado</th>
            </tr>
          </thead>
          <tbody className='divide-y divide-slate-100'>
            {promotions.map(promo => (
              <tr key={promo.id}>
                <td className='px-3 py-2 text-sm font-medium text-slate-900'>{promo.name}</td>
                <td className='px-3 py-2 text-sm text-slate-700'>{promoTypeLabels[promo.type]}</td>
                <td className='px-3 py-2 text-sm tabular-nums text-slate-700'>
                  {promo.type === 'porcentaje' ? `${promo.value}%` : `$${promo.value}`}
                </td>
                <td className='max-w-xs px-3 py-2 text-sm text-slate-600'>{promo.description}</td>
                <td className='px-3 py-2 text-sm'>
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      promo.active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {promo.active ? 'Activa' : 'Inactiva'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  )
}
