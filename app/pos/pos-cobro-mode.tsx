'use client'

import type { FormEvent, KeyboardEvent } from 'react'

import { PosClock } from '@/app/pos/pos-clock'
import { formatMxnCurrency } from '@/src/lib/mxn-currency'

type CobroLine = {
  key: string
  productName: string
  sku: string
  quantityLabel: string
  lineTotal: number
  lineDiscount: number
}

type CobroTotals = {
  subtotal: number
  discountTotal: number
  tax: number
  total: number
  promoName: string | null
}

type PaymentMethod = 'cash' | 'card' | 'credit'

type PosCobroModeProps = {
  cashierUsername: string
  codeQuery: string
  onCodeQueryChange: (value: string) => void
  onCodeSubmit: () => void
  lines: CobroLine[]
  totals: CobroTotals
  showIva: boolean
  paymentMethod: PaymentMethod
  onPaymentMethodChange: (method: PaymentMethod) => void
  amountReceived: string
  onAmountReceivedChange: (value: string) => void
  change: number
  creditCustomerName: string
  creditCustomerPhone: string
  onCreditCustomerNameChange: (value: string) => void
  onCreditCustomerPhoneChange: (value: string) => void
  canCheckout: boolean
  submittingSale: boolean
  message: string | null
  onCheckout: () => void
  onRemoveLine: (index: number) => void
  onAdjustQuantity: (index: number, direction: -1 | 1) => void
  onExitCobroMode: () => void
  draftSyncLabel: string
  draftSyncStatus: 'idle' | 'syncing' | 'synced' | 'error'
}

export const PosCobroMode = ({
  cashierUsername,
  codeQuery,
  onCodeQueryChange,
  onCodeSubmit,
  lines,
  totals,
  showIva,
  paymentMethod,
  onPaymentMethodChange,
  amountReceived,
  onAmountReceivedChange,
  change,
  creditCustomerName,
  creditCustomerPhone,
  onCreditCustomerNameChange,
  onCreditCustomerPhoneChange,
  canCheckout,
  submittingSale,
  message,
  onCheckout,
  onRemoveLine,
  onAdjustQuantity,
  onExitCobroMode,
  draftSyncLabel,
  draftSyncStatus
}: PosCobroModeProps) => {
  const handleCodeFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onCodeSubmit()
  }

  const handleCodeKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    onCodeSubmit()
  }

  return (
    <div
      className='fixed inset-0 z-[100] flex flex-col bg-[#0f1412] text-slate-50'
      role='application'
      aria-label='Modo cobro profesional'
    >
      <header className='flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-emerald-900/50 bg-[#121a17] px-4 py-3 md:px-6'>
        <div className='min-w-0'>
          <p className='text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400'>Modo cobro</p>
          <p className='truncate text-sm text-slate-300'>Caja · {cashierUsername}</p>
        </div>
        <PosClock className='rounded-lg border border-emerald-800/60 bg-emerald-950/40 px-3 py-2 text-base text-emerald-100 md:text-lg' />
        <div className='flex flex-wrap items-center gap-2'>
          <p
            className={`rounded-lg px-3 py-2 text-xs font-medium ${
              draftSyncStatus === 'error'
                ? 'bg-rose-950/50 text-rose-200'
                : draftSyncStatus === 'syncing'
                  ? 'bg-amber-950/40 text-amber-200'
                  : 'bg-emerald-950/40 text-emerald-200'
            }`}
            aria-live='polite'
          >
            {draftSyncLabel}
          </p>
          <button
            type='button'
            onClick={onExitCobroMode}
            aria-label='Salir de modo cobro'
            className='min-h-12 rounded-xl border border-slate-600 bg-slate-800 px-4 text-sm font-semibold text-slate-100 hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400'
          >
            Salir modo cobro
          </button>
        </div>
      </header>

      <div className='grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1.35fr)_minmax(20rem,26rem)]'>
        <section className='flex min-h-0 flex-col border-b border-emerald-900/40 lg:border-b-0 lg:border-r'>
          <form onSubmit={handleCodeFormSubmit} className='shrink-0 space-y-2 border-b border-emerald-900/40 px-4 py-4 md:px-6'>
            <label htmlFor='cobro-code-search' className='text-sm font-medium text-slate-300'>
              Búsqueda por código / SKU
            </label>
            <div className='flex gap-2'>
              <input
                id='cobro-code-search'
                value={codeQuery}
                onChange={event => onCodeQueryChange(event.target.value)}
                onKeyDown={handleCodeKeyDown}
                autoFocus
                autoComplete='off'
                inputMode='text'
                placeholder='Escanea o escribe el código y Enter'
                aria-label='Buscar producto por código'
                className='min-h-14 flex-1 rounded-2xl border border-emerald-700/50 bg-[#18241f] px-4 text-lg text-slate-50 outline-none placeholder:text-slate-500 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/30'
              />
              <button
                type='submit'
                aria-label='Agregar producto por código'
                className='min-h-14 min-w-14 rounded-2xl bg-emerald-500 px-5 text-base font-bold text-emerald-950 hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300'
              >
                +
              </button>
            </div>
          </form>

          <div className='min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6'>
            <div className='mb-3 flex items-center justify-between'>
              <h2 className='text-sm font-semibold uppercase tracking-wide text-slate-400'>Recibo en vivo</h2>
              <p className='text-xs text-slate-500'>{lines.length} línea{lines.length === 1 ? '' : 's'}</p>
            </div>

            {!lines.length ? (
              <div className='rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 px-4 py-10 text-center'>
                <p className='text-base text-slate-300'>Escanea un código para comenzar el ticket</p>
                <p className='mt-2 text-sm text-slate-500'>Ideal para F11 en escritorio o tablet a pantalla completa</p>
              </div>
            ) : (
              <ul className='space-y-2'>
                {lines.map((line, index) => (
                  <li
                    key={line.key}
                    className='rounded-2xl border border-slate-700/80 bg-[#15201b] px-3 py-3'
                  >
                    <div className='flex items-start justify-between gap-3'>
                      <div className='min-w-0'>
                        <p className='truncate text-base font-semibold text-slate-50'>{line.productName}</p>
                        <p className='text-xs text-slate-400'>
                          {line.sku} · {line.quantityLabel}
                        </p>
                        {line.lineDiscount > 0 ? (
                          <p className='text-xs text-emerald-400'>
                            Desc. −{formatMxnCurrency(line.lineDiscount)}
                          </p>
                        ) : null}
                      </div>
                      <p className='shrink-0 text-lg font-semibold tabular-nums text-emerald-300'>
                        {formatMxnCurrency(line.lineTotal)}
                      </p>
                    </div>
                    <div className='mt-3 flex gap-2'>
                      <button
                        type='button'
                        onClick={() => onAdjustQuantity(index, -1)}
                        aria-label={`Disminuir ${line.productName}`}
                        className='min-h-12 min-w-12 rounded-xl border border-slate-600 text-xl font-bold text-slate-100 hover:bg-slate-800'
                      >
                        −
                      </button>
                      <button
                        type='button'
                        onClick={() => onAdjustQuantity(index, 1)}
                        aria-label={`Aumentar ${line.productName}`}
                        className='min-h-12 min-w-12 rounded-xl border border-slate-600 text-xl font-bold text-slate-100 hover:bg-slate-800'
                      >
                        +
                      </button>
                      <button
                        type='button'
                        onClick={() => onRemoveLine(index)}
                        aria-label={`Quitar ${line.productName}`}
                        className='min-h-12 flex-1 rounded-xl border border-rose-700/60 text-sm font-semibold text-rose-300 hover:bg-rose-950/40'
                      >
                        Quitar
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <aside className='flex min-h-0 flex-col bg-[#101816] px-4 py-4 md:px-5'>
          <h2 className='text-sm font-semibold uppercase tracking-wide text-slate-400'>Centro de pago</h2>

          <div className='mt-4 space-y-2 rounded-2xl border border-emerald-800/50 bg-emerald-950/30 p-4 text-base'>
            <div className='flex justify-between gap-3 text-slate-300'>
              <span>Subtotal</span>
              <span className='tabular-nums'>{formatMxnCurrency(totals.subtotal)}</span>
            </div>
            <div className='flex justify-between gap-3 text-emerald-300'>
              <span>Descuentos{totals.promoName ? ` · ${totals.promoName}` : ''}</span>
              <span className='tabular-nums'>−{formatMxnCurrency(totals.discountTotal)}</span>
            </div>
            <div className='flex justify-between gap-3 text-slate-300'>
              <span>{showIva ? 'IVA' : 'Impuesto'}</span>
              <span className='tabular-nums'>{formatMxnCurrency(totals.tax)}</span>
            </div>
            <div className='mt-2 flex justify-between gap-3 border-t border-emerald-800/60 pt-3 text-2xl font-bold text-white'>
              <span>Total</span>
              <span className='tabular-nums text-emerald-300'>{formatMxnCurrency(totals.total)}</span>
            </div>
          </div>

          <div className='mt-4 grid grid-cols-3 gap-2'>
            {([
              { id: 'cash', label: 'Efectivo' },
              { id: 'card', label: 'Tarjeta' },
              { id: 'credit', label: 'Crédito' }
            ] as const).map(method => {
              const isActive = paymentMethod === method.id
              return (
                <button
                  key={method.id}
                  type='button'
                  onClick={() => onPaymentMethodChange(method.id)}
                  aria-pressed={isActive}
                  aria-label={`Pago ${method.label}`}
                  className={`min-h-14 rounded-xl text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                    isActive
                      ? 'bg-emerald-500 text-emerald-950'
                      : 'border border-slate-600 bg-slate-900 text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  {method.label}
                </button>
              )
            })}
          </div>

          {paymentMethod === 'cash' ? (
            <div className='mt-4 space-y-2'>
              <label htmlFor='cobro-amount-received' className='text-sm text-slate-400'>
                Monto recibido
              </label>
              <input
                id='cobro-amount-received'
                value={amountReceived}
                onChange={event => onAmountReceivedChange(event.target.value)}
                inputMode='decimal'
                placeholder='0.00'
                aria-label='Monto recibido en efectivo'
                className='min-h-14 w-full rounded-2xl border border-slate-600 bg-slate-900 px-4 text-xl tabular-nums text-white outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/30'
              />
              <p className={`text-lg font-semibold tabular-nums ${change < 0 ? 'text-rose-400' : 'text-emerald-300'}`}>
                Cambio: {formatMxnCurrency(change)}
              </p>
            </div>
          ) : null}

          {paymentMethod === 'credit' ? (
            <div className='mt-4 space-y-2'>
              <input
                value={creditCustomerName}
                onChange={event => onCreditCustomerNameChange(event.target.value)}
                placeholder='Nombre del cliente'
                aria-label='Nombre del cliente para crédito'
                className='min-h-12 w-full rounded-xl border border-slate-600 bg-slate-900 px-3 text-base text-white outline-none focus:border-emerald-400'
              />
              <input
                value={creditCustomerPhone}
                onChange={event => onCreditCustomerPhoneChange(event.target.value)}
                placeholder='Teléfono'
                inputMode='tel'
                aria-label='Teléfono del cliente para crédito'
                className='min-h-12 w-full rounded-xl border border-slate-600 bg-slate-900 px-3 text-base text-white outline-none focus:border-emerald-400'
              />
            </div>
          ) : null}

          <div className='mt-auto space-y-3 pt-6'>
            {message ? (
              <p role='alert' className='rounded-xl border border-rose-700/50 bg-rose-950/40 px-3 py-2 text-sm text-rose-200'>
                {message}
              </p>
            ) : null}
            <button
              type='button'
              onClick={onCheckout}
              disabled={!canCheckout || submittingSale}
              aria-label='Cobrar venta'
              className='min-h-16 w-full rounded-2xl bg-emerald-400 text-xl font-bold text-emerald-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200'
            >
              {submittingSale ? 'Procesando…' : 'Cobrar'}
            </button>
          </div>
        </aside>
      </div>
    </div>
  )
}
