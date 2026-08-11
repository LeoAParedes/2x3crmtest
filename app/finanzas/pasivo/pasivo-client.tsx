'use client'

import { useEffect, useState } from 'react'

import {
  expenseCategoryLabels,
  type ExpenseCategory
} from '@/src/lib/finance/expense-schema'
import { formatMxnCurrency } from '@/src/lib/mxn-currency'

type ExpenseRow = {
  id: string
  category: string
  description: string
  amount: number
  kind?: string
  spentAt: string
  createdByUsername: string
}

type ExpensesResponse = {
  success: boolean
  expenses: ExpenseRow[]
  message?: string
}

type CategorySummary = {
  category: string
  label: string
  total: number
  count: number
}

const categoryLabel = (category: string) =>
  expenseCategoryLabels[category as ExpenseCategory] || category

const PERIODS = [
  { value: 'day', label: 'Hoy' },
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mes' }
] as const

type Period = (typeof PERIODS)[number]['value']

export const PasivoClient = () => {
  const [period, setPeriod] = useState<Period>('month')
  const [expenses, setExpenses] = useState<ExpenseRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch(`/api/finanzas/expenses?period=${period}`)
        const payload = (await response.json()) as ExpensesResponse
        if (!response.ok || !payload.success) {
          throw new Error(payload.message || 'No fue posible cargar pasivo corriente')
        }
        if (!cancelled) {
          setExpenses(payload.expenses || [])
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Error de carga')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [period])

  const totalLiabilities = expenses.reduce((sum, expense) => sum + expense.amount, 0)

  const categorySummaries: CategorySummary[] = Object.values(
    expenses.reduce<Record<string, CategorySummary>>((acc, expense) => {
      const key = expense.category
      if (!acc[key]) {
        acc[key] = { category: key, label: categoryLabel(key), total: 0, count: 0 }
      }
      acc[key].total += expense.amount
      acc[key].count += 1
      return acc
    }, {})
  ).sort((left, right) => right.total - left.total)

  const fixedExpenses = expenses.filter(expense => expense.kind === 'fixed')
  const operatingExpenses = expenses.filter(expense => expense.kind !== 'fixed')
  const fixedTotal = fixedExpenses.reduce((sum, expense) => sum + expense.amount, 0)
  const operatingTotal = operatingExpenses.reduce((sum, expense) => sum + expense.amount, 0)

  return (
    <main className='mx-auto max-w-5xl px-4 py-8 md:px-8'>
      <section className='flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between'>
        <div>
          <h1 className='text-2xl font-semibold text-slate-950'>Pasivo corriente</h1>
          <p className='mt-1 text-sm text-slate-600'>
            Gastos y compromisos registrados. Pasivos fijos y corrientes del periodo.
          </p>
        </div>
        <div
          className='inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1'
          role='group'
          aria-label='Periodo'
        >
          {PERIODS.map(option => {
            const isActive = period === option.value
            return (
              <button
                key={option.value}
                type='button'
                aria-pressed={isActive}
                tabIndex={0}
                aria-label={`Ver periodo ${option.label}`}
                onClick={() => setPeriod(option.value)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  isActive ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {option.label}
              </button>
            )
          })}
        </div>
      </section>

      <section className='mt-5 grid gap-3 sm:grid-cols-3'>
        <article className='border border-slate-200 bg-white px-4 py-3'>
          <p className='text-[11px] font-medium uppercase tracking-wide text-slate-500'>Total pasivo</p>
          <p className='mt-1 text-xl font-semibold tabular-nums text-amber-800'>
            {formatMxnCurrency(totalLiabilities)}
          </p>
          <p className='text-xs text-slate-500'>{expenses.length} registros</p>
        </article>
        <article className='border border-slate-200 bg-white px-4 py-3'>
          <p className='text-[11px] font-medium uppercase tracking-wide text-slate-500'>Fijos / producción</p>
          <p className='mt-1 text-xl font-semibold tabular-nums text-slate-950'>
            {formatMxnCurrency(fixedTotal)}
          </p>
          <p className='text-xs text-slate-500'>{fixedExpenses.length} compromisos</p>
        </article>
        <article className='border border-slate-200 bg-white px-4 py-3'>
          <p className='text-[11px] font-medium uppercase tracking-wide text-slate-500'>Corrientes</p>
          <p className='mt-1 text-xl font-semibold tabular-nums text-slate-950'>
            {formatMxnCurrency(operatingTotal)}
          </p>
          <p className='text-xs text-slate-500'>{operatingExpenses.length} gastos</p>
        </article>
      </section>

      {categorySummaries.length > 0 ? (
        <section className='mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
          {categorySummaries.map(item => (
            <article key={item.category} className='border border-slate-200 bg-white px-4 py-3'>
              <p className='truncate text-[11px] font-medium uppercase tracking-wide text-slate-500'>
                {item.label}
              </p>
              <p className='mt-1 text-lg font-semibold tabular-nums text-slate-950'>
                {formatMxnCurrency(item.total)}
              </p>
              <p className='text-xs text-slate-500'>{item.count} registros</p>
            </article>
          ))}
        </section>
      ) : null}

      <section className='mt-6 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm'>
        <div className='border-b border-slate-200 px-4 py-3'>
          <h2 className='text-sm font-semibold text-slate-900'>Gastos del periodo</h2>
          <p className='text-xs text-slate-500'>
            Ordenados de más reciente a más antiguo.
          </p>
        </div>
        <table className='min-w-full divide-y divide-slate-200'>
          <thead className='bg-slate-50'>
            <tr>
              <th className='px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500'>Tipo</th>
              <th className='px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500'>Categoría</th>
              <th className='px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500'>Descripción</th>
              <th className='px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500'>Monto</th>
              <th className='px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500'>Fecha</th>
              <th className='px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500'>Registrado por</th>
            </tr>
          </thead>
          <tbody className='divide-y divide-slate-100'>
            {expenses.map(expense => (
              <tr key={expense.id}>
                <td className='px-3 py-2 text-sm text-slate-700'>
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      expense.kind === 'fixed'
                        ? 'bg-slate-100 text-slate-700'
                        : 'bg-amber-50 text-amber-800'
                    }`}
                  >
                    {expense.kind === 'fixed' ? 'Fijo' : 'Corriente'}
                  </span>
                </td>
                <td className='px-3 py-2 text-sm text-slate-700'>{categoryLabel(expense.category)}</td>
                <td className='max-w-xs px-3 py-2 text-sm text-slate-800'>{expense.description}</td>
                <td className='px-3 py-2 text-sm tabular-nums text-amber-800'>
                  {formatMxnCurrency(expense.amount)}
                </td>
                <td className='whitespace-nowrap px-3 py-2 text-sm text-slate-700'>
                  {new Date(expense.spentAt).toLocaleString('es-MX')}
                </td>
                <td className='px-3 py-2 text-sm text-slate-600'>{expense.createdByUsername}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading ? <p className='px-4 py-4 text-sm text-slate-500'>Cargando…</p> : null}
        {!loading && !expenses.length ? (
          <p className='px-4 py-4 text-sm text-slate-500'>
            Sin gastos registrados en este periodo.
          </p>
        ) : null}
      </section>

      {error ? (
        <p role='alert' className='mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700'>
          {error}
        </p>
      ) : null}
    </main>
  )
}
