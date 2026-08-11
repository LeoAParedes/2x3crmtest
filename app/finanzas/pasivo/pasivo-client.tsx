'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'

import {
  EXPENSE_CATEGORIES,
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
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [category, setCategory] = useState<ExpenseCategory>('proveedores')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [expenseKind, setExpenseKind] = useState<'fixed' | 'operating'>('operating')

  const loadExpenses = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/finanzas/expenses?period=${period}`)
      const payload = (await response.json()) as ExpensesResponse
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || 'No fue posible cargar pasivo corriente')
      }
      setExpenses(payload.expenses || [])
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Error de carga')
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => {
    queueMicrotask(() => {
      void loadExpenses()
    })
  }, [loadExpenses])

  const handleCreateExpense = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    setMessage(null)
    setError(null)

    const parsedAmount = Number(amount.replace(',', '.'))
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError('Ingresa un monto válido mayor a cero')
      setSaving(false)
      return
    }

    try {
      const response = await fetch('/api/finanzas/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          description: description.trim(),
          amount: parsedAmount,
          kind: expenseKind
        })
      })
      const payload = (await response.json()) as { success?: boolean; message?: string }
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || 'No fue posible registrar el gasto')
      }
      setDescription('')
      setAmount('')
      setMessage('Gasto registrado correctamente')
      await loadExpenses()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteExpense = async (id: string) => {
    if (!window.confirm('¿Eliminar este gasto?')) return
    setError(null)
    setMessage(null)
    try {
      const response = await fetch(`/api/finanzas/expenses/${id}`, { method: 'DELETE' })
      const payload = (await response.json()) as { success?: boolean; message?: string }
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || 'No fue posible eliminar el gasto')
      }
      setMessage('Gasto eliminado')
      await loadExpenses()
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Error al eliminar')
    }
  }

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

      <section className='mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm'>
        <h2 className='text-sm font-semibold text-slate-900'>Registrar gasto</h2>
        <form className='mt-4 grid gap-3 sm:grid-cols-2' onSubmit={handleCreateExpense}>
          <label className='grid gap-1 text-sm text-slate-700'>
            Tipo
            <select
              value={expenseKind}
              onChange={event => setExpenseKind(event.target.value as 'fixed' | 'operating')}
              aria-label='Tipo de gasto'
              className='h-10 rounded-lg border border-slate-300 px-3'
            >
              <option value='fixed'>Fijo / producción</option>
              <option value='operating'>Corriente</option>
            </select>
          </label>
          <label className='grid gap-1 text-sm text-slate-700'>
            Categoría
            <select
              value={category}
              onChange={event => setCategory(event.target.value as ExpenseCategory)}
              aria-label='Categoría del gasto'
              className='h-10 rounded-lg border border-slate-300 px-3'
            >
              {EXPENSE_CATEGORIES.map(item => (
                <option key={item} value={item}>
                  {expenseCategoryLabels[item]}
                </option>
              ))}
            </select>
          </label>
          <label className='grid gap-1 text-sm text-slate-700 sm:col-span-2'>
            Descripción
            <input
              type='text'
              required
              minLength={2}
              value={description}
              onChange={event => setDescription(event.target.value)}
              aria-label='Descripción del gasto'
              className='h-10 rounded-lg border border-slate-300 px-3'
            />
          </label>
          <label className='grid gap-1 text-sm text-slate-700'>
            Monto (MXN)
            <input
              type='text'
              inputMode='decimal'
              required
              value={amount}
              onChange={event => setAmount(event.target.value)}
              aria-label='Monto del gasto'
              className='h-10 rounded-lg border border-slate-300 px-3'
            />
          </label>
          <div className='flex items-end'>
            <button
              type='submit'
              disabled={saving}
              aria-label='Guardar gasto'
              className='h-10 w-full rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white disabled:opacity-50'
            >
              {saving ? 'Guardando…' : 'Registrar gasto'}
            </button>
          </div>
        </form>
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
          <p className='text-xs text-slate-500'>Ordenados de más reciente a más antiguo.</p>
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
              <th className='px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500'>Acción</th>
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
                <td className='px-3 py-2 text-sm'>
                  <button
                    type='button'
                    onClick={() => void handleDeleteExpense(expense.id)}
                    aria-label={`Eliminar gasto ${expense.description}`}
                    className='rounded-lg border border-rose-200 px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50'
                  >
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading ? <p className='px-4 py-4 text-sm text-slate-500'>Cargando…</p> : null}
        {!loading && !expenses.length ? (
          <p className='px-4 py-4 text-sm text-slate-500'>Sin gastos registrados en este periodo.</p>
        ) : null}
      </section>

      {message ? (
        <p aria-live='polite' className='mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800'>
          {message}
        </p>
      ) : null}
      {error ? (
        <p role='alert' className='mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700'>
          {error}
        </p>
      ) : null}
    </main>
  )
}
