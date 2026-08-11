'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useMemo, type KeyboardEvent } from 'react'

import { CashiersPanel } from '@/app/configuracion/cashiers-panel'
import { ChatbotPanel } from '@/app/configuracion/chatbot-panel'
import { PosSettingsPanel } from '@/app/configuracion/pos-settings-panel'

type ConfigTab = 'general' | 'cajeros' | 'turno' | 'chatbot'

const tabs: Array<{ id: ConfigTab; label: string }> = [
  { id: 'general', label: 'General' },
  { id: 'chatbot', label: 'Chatbot' },
  { id: 'cajeros', label: 'Cajeros' },
  { id: 'turno', label: 'Turno / Corte' }
]

const parseTab = (value: string | null): ConfigTab => {
  if (value === 'cajeros' || value === 'turno' || value === 'chatbot' || value === 'general') return value
  return 'general'
}

export const ConfiguracionClient = () => {
  const searchParams = useSearchParams()
  const router = useRouter()
  const tab = useMemo(() => parseTab(searchParams.get('tab')), [searchParams])

  const handleTabChange = (nextTab: ConfigTab) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', nextTab)
    router.replace(`/configuracion?${params.toString()}`)
  }

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, nextTab: ConfigTab) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    handleTabChange(nextTab)
  }

  return (
    <main className='mx-auto max-w-5xl px-4 py-8 md:px-8'>
      <section className='border-b border-slate-200 pb-5'>
        <h1 className='text-2xl font-semibold text-slate-950'>Configuración</h1>
        <p className='mt-1 text-sm text-slate-600'>
          Punto de venta, chatbot DavinciAi, usuarios de caja y turno operativo.
        </p>
      </section>

      <div
        className='mt-5 inline-flex flex-wrap rounded-lg border border-slate-200 bg-slate-50 p-1'
        role='tablist'
        aria-label='Secciones de configuración'
      >
        {tabs.map(item => {
          const isActive = tab === item.id
          return (
            <button
              key={item.id}
              type='button'
              role='tab'
              aria-selected={isActive}
              tabIndex={0}
              aria-label={item.label}
              onClick={() => handleTabChange(item.id)}
              onKeyDown={event => handleTabKeyDown(event, item.id)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                isActive ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {item.label}
            </button>
          )
        })}
      </div>

      <div className='mt-6' role='tabpanel'>
        {tab === 'general' ? <PosSettingsPanel /> : null}

        {tab === 'chatbot' ? <ChatbotPanel /> : null}
        {tab === 'cajeros' ? <CashiersPanel /> : null}

        {tab === 'turno' ? (
          <section className='rounded-2xl border border-slate-200 bg-white p-6 shadow-sm'>
            <h2 className='text-lg font-semibold text-slate-950'>Turno y corte</h2>
            <p className='mt-2 text-sm text-slate-600'>
              Apertura de fondo, corte ciego y historial de cierres. El punto de venta ya no te saca de módulo:
              solo pide abrir turno si hace falta.
            </p>
            <Link
              href='/caja'
              aria-label='Ir a la página de turno y corte'
              className='mt-5 inline-flex h-10 items-center rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white'
            >
              Ir a Turno / Corte
            </Link>
          </section>
        ) : null}
      </div>
    </main>
  )
}
