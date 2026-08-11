'use client'

import type { CSSProperties, FormEvent, KeyboardEvent } from 'react'

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

/** Warm POS cobro palette derived from sandy-brown / apricot / vanilla / pearl-aqua / emerald. */
const cobroPaletteStyle = {
  '--cobro-sand-50': '#fef0e6',
  '--cobro-sand-100': '#fee1cd',
  '--cobro-sand-200': '#fdc49b',
  '--cobro-sand-400': '#fb8937',
  '--cobro-sand-600': '#c85604',
  '--cobro-sand-800': '#642b02',
  '--cobro-sand-900': '#321501',
  '--cobro-apricot-50': '#fef3e7',
  '--cobro-apricot-100': '#fde7ce',
  '--cobro-apricot-300': '#f9b76c',
  '--cobro-apricot-500': '#f5870a',
  '--cobro-vanilla-50': '#faf7eb',
  '--cobro-vanilla-100': '#f4f0d7',
  '--cobro-vanilla-200': '#eae1ae',
  '--cobro-vanilla-400': '#d4c25e',
  '--cobro-vanilla-700': '#796c20',
  '--cobro-aqua-50': '#ecf8f5',
  '--cobro-aqua-100': '#daf1ea',
  '--cobro-aqua-400': '#6ac8ac',
  '--cobro-aqua-600': '#379579',
  '--cobro-aqua-800': '#1c4a3c',
  '--cobro-emerald-300': '#85e0b3',
  '--cobro-emerald-400': '#5cd699',
  '--cobro-emerald-500': '#33cc80',
  '--cobro-emerald-600': '#29a366',
  '--cobro-emerald-700': '#1f7a4d',
  '--cobro-emerald-900': '#0a291a',
  '--cobro-emerald-950': '#071d12'
} as CSSProperties

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

  const syncTone =
    draftSyncStatus === 'error'
      ? 'border-[#f9b76c] bg-[#fee1cd] text-[#642b02]'
      : draftSyncStatus === 'syncing'
        ? 'border-[#eae1ae] bg-[#f4f0d7] text-[#796c20]'
        : 'border-[#b5e3d5] bg-[#ecf8f5] text-[#1c4a3c]'

  return (
    <div
      className='fixed inset-0 z-[100] flex flex-col bg-[var(--cobro-vanilla-50)] text-[var(--cobro-sand-900)]'
      role='application'
      aria-label='Modo cobro profesional'
      style={cobroPaletteStyle}
    >
      <header className='flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[var(--cobro-sand-200)] bg-[linear-gradient(90deg,var(--cobro-apricot-50),var(--cobro-vanilla-50)_45%,var(--cobro-aqua-50))] px-4 py-3 md:px-6'>
        <div className='min-w-0'>
          <p className='text-xs font-semibold uppercase tracking-[0.18em] text-[var(--cobro-sand-600)]'>
            Modo cobro
          </p>
          <p className='truncate text-sm text-[var(--cobro-sand-800)]'>Caja · {cashierUsername}</p>
        </div>
        <PosClock className='rounded-lg border border-[var(--cobro-aqua-400)] bg-[var(--cobro-aqua-50)] px-3 py-2 text-base text-[var(--cobro-aqua-800)] md:text-lg' />
        <div className='flex flex-wrap items-center gap-2'>
          <p className={`rounded-lg border px-3 py-2 text-xs font-medium ${syncTone}`} aria-live='polite'>
            {draftSyncLabel}
          </p>
          <button
            type='button'
            onClick={onExitCobroMode}
            aria-label='Salir de modo cobro'
            className='min-h-12 rounded-xl border border-[var(--cobro-sand-200)] bg-white px-4 text-sm font-semibold text-[var(--cobro-sand-800)] hover:bg-[var(--cobro-sand-50)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cobro-apricot-500)]'
          >
            Salir modo cobro
          </button>
        </div>
      </header>

      <div className='grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1.35fr)_minmax(20rem,26rem)]'>
        <section className='flex min-h-0 flex-col border-b border-[var(--cobro-vanilla-200)] bg-[var(--cobro-vanilla-50)] lg:border-b-0 lg:border-r'>
          <form
            onSubmit={handleCodeFormSubmit}
            className='shrink-0 space-y-2 border-b border-[var(--cobro-vanilla-200)] bg-[var(--cobro-apricot-50)]/70 px-4 py-4 md:px-6'
          >
            <label htmlFor='cobro-code-search' className='text-sm font-medium text-[var(--cobro-sand-800)]'>
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
                className='min-h-14 flex-1 rounded-2xl border border-[var(--cobro-sand-200)] bg-white px-4 text-lg text-[var(--cobro-sand-900)] outline-none placeholder:text-[var(--cobro-vanilla-700)] focus:border-[var(--cobro-apricot-500)] focus:ring-2 focus:ring-[var(--cobro-apricot-300)]/50'
              />
              <button
                type='submit'
                aria-label='Agregar producto por código'
                className='min-h-14 min-w-14 rounded-2xl bg-[var(--cobro-emerald-500)] px-5 text-base font-bold text-[var(--cobro-emerald-950)] hover:bg-[var(--cobro-emerald-400)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cobro-emerald-300)]'
              >
                +
              </button>
            </div>
          </form>

          <div className='min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6'>
            <div className='mb-3 flex items-center justify-between'>
              <h2 className='text-sm font-semibold uppercase tracking-wide text-[var(--cobro-vanilla-700)]'>
                Recibo en vivo
              </h2>
              <p className='text-xs text-[var(--cobro-sand-600)]'>
                {lines.length} línea{lines.length === 1 ? '' : 's'}
              </p>
            </div>

            {!lines.length ? (
              <div className='rounded-2xl border border-dashed border-[var(--cobro-sand-200)] bg-[var(--cobro-sand-50)] px-4 py-10 text-center'>
                <p className='text-base text-[var(--cobro-sand-800)]'>Escanea un código para comenzar el ticket</p>
                <p className='mt-2 text-sm text-[var(--cobro-vanilla-700)]'>
                  Ideal para F11 en escritorio o tablet a pantalla completa
                </p>
              </div>
            ) : (
              <ul className='space-y-2'>
                {lines.map((line, index) => (
                  <li
                    key={line.key}
                    className='rounded-2xl border border-[var(--cobro-sand-100)] bg-white px-3 py-3'
                  >
                    <div className='flex items-start justify-between gap-3'>
                      <div className='min-w-0'>
                        <p className='truncate text-base font-semibold text-[var(--cobro-sand-900)]'>
                          {line.productName}
                        </p>
                        <p className='text-xs text-[var(--cobro-vanilla-700)]'>
                          {line.sku} · {line.quantityLabel}
                        </p>
                        {line.lineDiscount > 0 ? (
                          <p className='text-xs font-medium text-[var(--cobro-aqua-600)]'>
                            Desc. −{formatMxnCurrency(line.lineDiscount)}
                          </p>
                        ) : null}
                      </div>
                      <p className='shrink-0 text-lg font-semibold tabular-nums text-[var(--cobro-emerald-700)]'>
                        {formatMxnCurrency(line.lineTotal)}
                      </p>
                    </div>
                    <div className='mt-3 flex gap-2'>
                      <button
                        type='button'
                        onClick={() => onAdjustQuantity(index, -1)}
                        aria-label={`Disminuir ${line.productName}`}
                        className='min-h-12 min-w-12 rounded-xl border border-[var(--cobro-vanilla-200)] bg-[var(--cobro-vanilla-50)] text-xl font-bold text-[var(--cobro-sand-800)] hover:bg-[var(--cobro-vanilla-100)]'
                      >
                        −
                      </button>
                      <button
                        type='button'
                        onClick={() => onAdjustQuantity(index, 1)}
                        aria-label={`Aumentar ${line.productName}`}
                        className='min-h-12 min-w-12 rounded-xl border border-[var(--cobro-vanilla-200)] bg-[var(--cobro-vanilla-50)] text-xl font-bold text-[var(--cobro-sand-800)] hover:bg-[var(--cobro-vanilla-100)]'
                      >
                        +
                      </button>
                      <button
                        type='button'
                        onClick={() => onRemoveLine(index)}
                        aria-label={`Quitar ${line.productName}`}
                        className='min-h-12 flex-1 rounded-xl border border-[#fdc49b] bg-[var(--cobro-sand-50)] text-sm font-semibold text-[var(--cobro-sand-800)] hover:bg-[var(--cobro-sand-100)]'
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

        <aside className='flex min-h-0 flex-col bg-[linear-gradient(180deg,var(--cobro-aqua-50),var(--cobro-vanilla-50)_55%,var(--cobro-apricot-50))] px-4 py-4 md:px-5'>
          <h2 className='text-sm font-semibold uppercase tracking-wide text-[var(--cobro-aqua-800)]'>
            Centro de pago
          </h2>

          <div className='mt-4 space-y-2 rounded-2xl border border-[var(--cobro-aqua-400)]/50 bg-white/90 p-4 text-base'>
            <div className='flex justify-between gap-3 text-[var(--cobro-sand-800)]'>
              <span>Subtotal</span>
              <span className='tabular-nums'>{formatMxnCurrency(totals.subtotal)}</span>
            </div>
            <div className='flex justify-between gap-3 text-[var(--cobro-aqua-600)]'>
              <span>Descuentos{totals.promoName ? ` · ${totals.promoName}` : ''}</span>
              <span className='tabular-nums'>−{formatMxnCurrency(totals.discountTotal)}</span>
            </div>
            <div className='flex justify-between gap-3 text-[var(--cobro-sand-800)]'>
              <span>{showIva ? 'IVA' : 'Impuesto'}</span>
              <span className='tabular-nums'>{formatMxnCurrency(totals.tax)}</span>
            </div>
            <div className='mt-2 flex justify-between gap-3 border-t border-[var(--cobro-vanilla-200)] pt-3 text-2xl font-bold text-[var(--cobro-sand-900)]'>
              <span>Total</span>
              <span className='tabular-nums text-[var(--cobro-emerald-700)]'>
                {formatMxnCurrency(totals.total)}
              </span>
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
                  className={`min-h-14 rounded-xl text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cobro-apricot-500)] ${
                    isActive
                      ? 'bg-[var(--cobro-sand-400)] text-[var(--cobro-sand-900)]'
                      : 'border border-[var(--cobro-vanilla-200)] bg-white text-[var(--cobro-sand-800)] hover:bg-[var(--cobro-vanilla-100)]'
                  }`}
                >
                  {method.label}
                </button>
              )
            })}
          </div>

          {paymentMethod === 'cash' ? (
            <div className='mt-4 space-y-2'>
              <label htmlFor='cobro-amount-received' className='text-sm text-[var(--cobro-sand-800)]'>
                Monto recibido
              </label>
              <input
                id='cobro-amount-received'
                value={amountReceived}
                onChange={event => onAmountReceivedChange(event.target.value)}
                inputMode='decimal'
                placeholder='0.00'
                aria-label='Monto recibido en efectivo'
                className='min-h-14 w-full rounded-2xl border border-[var(--cobro-sand-200)] bg-white px-4 text-xl tabular-nums text-[var(--cobro-sand-900)] outline-none focus:border-[var(--cobro-apricot-500)] focus:ring-2 focus:ring-[var(--cobro-apricot-300)]/40'
              />
              <p
                className={`text-lg font-semibold tabular-nums ${
                  change < 0 ? 'text-[var(--cobro-sand-600)]' : 'text-[var(--cobro-emerald-700)]'
                }`}
              >
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
                className='min-h-12 w-full rounded-xl border border-[var(--cobro-sand-200)] bg-white px-3 text-base text-[var(--cobro-sand-900)] outline-none focus:border-[var(--cobro-apricot-500)]'
              />
              <input
                value={creditCustomerPhone}
                onChange={event => onCreditCustomerPhoneChange(event.target.value)}
                placeholder='Teléfono'
                inputMode='tel'
                aria-label='Teléfono del cliente para crédito'
                className='min-h-12 w-full rounded-xl border border-[var(--cobro-sand-200)] bg-white px-3 text-base text-[var(--cobro-sand-900)] outline-none focus:border-[var(--cobro-apricot-500)]'
              />
            </div>
          ) : null}

          <div className='mt-auto space-y-3 pt-6'>
            {message ? (
              <p
                role='alert'
                className='rounded-xl border border-[var(--cobro-sand-400)] bg-[var(--cobro-sand-50)] px-3 py-2 text-sm text-[var(--cobro-sand-800)]'
              >
                {message}
              </p>
            ) : null}
            <button
              type='button'
              onClick={onCheckout}
              disabled={!canCheckout || submittingSale}
              aria-label='Cobrar venta'
              className='min-h-16 w-full rounded-2xl bg-[var(--cobro-emerald-500)] text-xl font-bold text-[var(--cobro-emerald-950)] transition hover:bg-[var(--cobro-emerald-400)] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cobro-emerald-300)]'
            >
              {submittingSale ? 'Procesando…' : 'Cobrar'}
            </button>
          </div>
        </aside>
      </div>
    </div>
  )
}
