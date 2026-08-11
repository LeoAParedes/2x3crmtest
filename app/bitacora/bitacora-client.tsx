'use client'

import { useEffect, useMemo, useState } from 'react'

type LogbookCategory = 'sales' | 'inventory' | 'pos' | 'crm' | 'system'

type LogbookItem = {
  id: string
  category: LogbookCategory
  action: string
  actionLabel: string
  status: string
  actorUsername: string
  actorRole: string
  createdAt: string
  details: string
}

type LogbookResponse = {
  success: boolean
  filters: {
    limit: number
    action?: string
    status: 'all' | 'success' | 'failed' | 'pending'
    category: LogbookCategory | 'all'
    actor?: string
  }
  actions: string[]
  categories: LogbookCategory[]
  items: LogbookItem[]
}

type SortDirection = 'asc' | 'desc'
type LogbookSortField = 'createdAt' | 'category' | 'actionLabel' | 'details' | 'actor' | 'status'

type ToastItem = {
  id: string
  kind: 'success' | 'error' | 'info'
  text: string
}

const getLogbookActionDisplayLabel = (action: string) => {
  const actionLabelMap: Record<string, string> = {
    'sale.create': 'Venta registrada',
    'inventory.import.csv': 'Importación de inventario',
    'pos.draft.saved': 'Borrador POS guardado',
    'inventory.product.create': 'Producto agregado',
    'inventory.product.delete': 'Producto eliminado',
    'inventory.price.correct': 'Precio corregido',
    'inventory.price.schedule': 'Precio programado',
    'inventory.min_stock.update': 'Umbral de stock bajo actualizado',
    'inventory.movement.entry': 'Entrada manual de stock',
    'inventory.movement.exit': 'Salida manual de stock'
  }
  return actionLabelMap[action] || action
}

const compareText = (left: string, right: string) =>
  left.localeCompare(right, 'es', {
    sensitivity: 'base',
    numeric: true
  })

const compareNumber = (left: number, right: number) => left - right

const getSortIndicator = (isActive: boolean, direction: SortDirection) => {
  if (!isActive) return '↕'
  return direction === 'asc' ? '▲' : '▼'
}

export const BitacoraClient = () => {
  const [logbookItems, setLogbookItems] = useState<LogbookItem[]>([])
  const [logbookActionFilter, setLogbookActionFilter] = useState<string>('all')
  const [logbookStatusFilter, setLogbookStatusFilter] = useState<'all' | 'success' | 'failed' | 'pending'>('all')
  const [logbookCategoryFilter, setLogbookCategoryFilter] = useState<LogbookCategory | 'all'>('all')
  const [logbookActorFilter, setLogbookActorFilter] = useState('')
  const [logbookSortBy, setLogbookSortBy] = useState<LogbookSortField>('createdAt')
  const [logbookSortDirection, setLogbookSortDirection] = useState<SortDirection>('desc')
  const [availableLogbookActions, setAvailableLogbookActions] = useState<string[]>([])
  const [loadingLogbook, setLoadingLogbook] = useState(false)
  const [refreshSeed, setRefreshSeed] = useState(0)
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const pushToast = (text: string, kind: ToastItem['kind'] = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    setToasts(current => [...current, { id, kind, text }])
    window.setTimeout(() => {
      setToasts(current => current.filter(item => item.id !== id))
    }, 4200)
  }

  useEffect(() => {
    let cancelled = false
    const loadLogbook = async () => {
      setLoadingLogbook(true)
      try {
        const params = new URLSearchParams({
          category: logbookCategoryFilter,
          status: logbookStatusFilter,
          limit: '180'
        })
        if (logbookActionFilter !== 'all') {
          params.set('action', logbookActionFilter)
        }
        if (logbookActorFilter.trim().length > 0) {
          params.set('actor', logbookActorFilter.trim())
        }

        const response = await fetch(`/api/inventario/bitacora?${params.toString()}`)
        const payload = (await response.json()) as LogbookResponse
        if (!response.ok || !payload.success) {
          throw new Error('No fue posible cargar la bitácora')
        }
        if (cancelled) return
        setLogbookItems(payload.items)
        setAvailableLogbookActions(payload.actions)
      } catch (error) {
        if (!cancelled) {
          pushToast(error instanceof Error ? error.message : 'Error de carga de bitácora', 'error')
        }
      } finally {
        if (!cancelled) {
          setLoadingLogbook(false)
        }
      }
    }

    void loadLogbook()

    return () => {
      cancelled = true
    }
  }, [logbookActionFilter, logbookCategoryFilter, logbookStatusFilter, logbookActorFilter, refreshSeed])

  const sortedLogbookItems = useMemo(() => {
    const indexedItems = logbookItems.map((item, index) => ({ item, index }))
    indexedItems.sort((left, right) => {
      const leftItem = left.item
      const rightItem = right.item
      let comparison = 0

      if (logbookSortBy === 'createdAt') {
        comparison = compareNumber(new Date(leftItem.createdAt).getTime(), new Date(rightItem.createdAt).getTime())
      } else if (logbookSortBy === 'category') {
        comparison = compareText(leftItem.category, rightItem.category)
      } else if (logbookSortBy === 'actionLabel') {
        comparison = compareText(leftItem.actionLabel, rightItem.actionLabel)
      } else if (logbookSortBy === 'details') {
        comparison = compareText(leftItem.details, rightItem.details)
      } else if (logbookSortBy === 'actor') {
        comparison = compareText(
          `${leftItem.actorUsername} ${leftItem.actorRole}`,
          `${rightItem.actorUsername} ${rightItem.actorRole}`
        )
      } else {
        comparison = compareText(leftItem.status, rightItem.status)
      }

      if (comparison === 0) {
        return left.index - right.index
      }

      return logbookSortDirection === 'asc' ? comparison : -comparison
    })
    return indexedItems.map(entry => entry.item)
  }, [logbookItems, logbookSortBy, logbookSortDirection])

  const handleLogbookHeaderSort = (field: LogbookSortField) => {
    if (logbookSortBy === field) {
      setLogbookSortDirection(current => (current === 'asc' ? 'desc' : 'asc'))
      return
    }
    setLogbookSortBy(field)
    setLogbookSortDirection(field === 'createdAt' ? 'desc' : 'asc')
  }

  const handleRefreshLogbook = () => {
    setRefreshSeed(current => current + 1)
  }

  return (
    <main className='mx-auto max-w-7xl px-4 py-8 md:px-8'>
      <section className='rounded-2xl border border-slate-200 bg-white p-6 shadow-sm'>
        <h1 className='text-2xl font-semibold text-slate-950'>Bitácora del sistema</h1>
        <p className='mt-2 text-sm text-slate-600'>
          Registro general de operaciones: ventas, inventario, POS, CRM y sistema.
        </p>
      </section>

      <section className='mt-6 w-full min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm'>
        <div className='w-full min-w-0 space-y-4'>
          <div className='grid w-full gap-3 md:grid-cols-4'>
            <label className='sr-only' htmlFor='bitacora-action-filter'>
              Filtrar por tipo de operación
            </label>
            <select
              id='bitacora-action-filter'
              value={logbookActionFilter}
              onChange={event => setLogbookActionFilter(event.target.value)}
              aria-label='Filtrar por tipo de operación'
              className='h-10 w-full min-w-0 rounded-lg border border-slate-300 px-3 text-sm'
            >
              <option value='all'>Todos los tipos</option>
              {availableLogbookActions.map(action => (
                <option key={action} value={action}>
                  {getLogbookActionDisplayLabel(action)}
                </option>
              ))}
            </select>
            <label className='sr-only' htmlFor='bitacora-category-filter'>
              Filtrar por categoría
            </label>
            <select
              id='bitacora-category-filter'
              value={logbookCategoryFilter}
              onChange={event => setLogbookCategoryFilter(event.target.value as LogbookCategory | 'all')}
              aria-label='Filtrar por categoría'
              className='h-10 w-full min-w-0 rounded-lg border border-slate-300 px-3 text-sm'
            >
              <option value='all'>Todas las categorías</option>
              <option value='sales'>Ventas</option>
              <option value='inventory'>Inventario</option>
              <option value='pos'>POS</option>
              <option value='crm'>CRM</option>
              <option value='system'>Sistema</option>
            </select>
            <label className='sr-only' htmlFor='bitacora-status-filter'>
              Filtrar por estado
            </label>
            <select
              id='bitacora-status-filter'
              value={logbookStatusFilter}
              onChange={event =>
                setLogbookStatusFilter(event.target.value as 'all' | 'success' | 'failed' | 'pending')
              }
              aria-label='Filtrar por estado'
              className='h-10 w-full min-w-0 rounded-lg border border-slate-300 px-3 text-sm'
            >
              <option value='all'>Todos los estados</option>
              <option value='success'>Success</option>
              <option value='failed'>Failed</option>
              <option value='pending'>Pending</option>
            </select>
            <label className='sr-only' htmlFor='bitacora-actor-filter'>
              Filtrar por usuario
            </label>
            <input
              id='bitacora-actor-filter'
              value={logbookActorFilter}
              onChange={event => setLogbookActorFilter(event.target.value)}
              placeholder='Filtrar por usuario'
              aria-label='Filtrar por usuario'
              className='h-10 w-full min-w-0 rounded-lg border border-slate-300 px-3 text-sm'
            />
          </div>

          <div className='flex justify-end'>
            <button
              type='button'
              onClick={handleRefreshLogbook}
              aria-label='Actualizar bitácora'
              className='h-10 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50'
            >
              Actualizar bitácora
            </button>
          </div>

          {loadingLogbook ? <p className='text-sm text-slate-500'>Cargando bitácora...</p> : null}

          <div className='w-full max-w-full min-w-0 overflow-x-auto rounded-xl border border-slate-200'>
            <div className='border-b border-slate-200 bg-slate-50 px-3 py-2'>
              <p className='text-sm font-semibold text-slate-900'>Registro de operaciones del sistema</p>
              <p className='text-xs text-slate-600'>Ordena haciendo clic en cualquier encabezado de columna.</p>
            </div>
            <table className='w-full min-w-full table-fixed divide-y divide-slate-200 md:table-auto'>
              <thead className='bg-slate-50'>
                <tr>
                  <th className='px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500'>
                    <button
                      type='button'
                      onClick={() => handleLogbookHeaderSort('createdAt')}
                      aria-label='Ordenar por fecha'
                      className='inline-flex items-center gap-1'
                    >
                      Fecha
                      <span className='text-[10px]' aria-hidden='true'>
                        {getSortIndicator(logbookSortBy === 'createdAt', logbookSortDirection)}
                      </span>
                    </button>
                  </th>
                  <th className='px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500'>
                    <button
                      type='button'
                      onClick={() => handleLogbookHeaderSort('category')}
                      aria-label='Ordenar por categoría'
                      className='inline-flex items-center gap-1'
                    >
                      Categoría
                      <span className='text-[10px]' aria-hidden='true'>
                        {getSortIndicator(logbookSortBy === 'category', logbookSortDirection)}
                      </span>
                    </button>
                  </th>
                  <th className='px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500'>
                    <button
                      type='button'
                      onClick={() => handleLogbookHeaderSort('actionLabel')}
                      aria-label='Ordenar por operación'
                      className='inline-flex items-center gap-1'
                    >
                      Operación
                      <span className='text-[10px]' aria-hidden='true'>
                        {getSortIndicator(logbookSortBy === 'actionLabel', logbookSortDirection)}
                      </span>
                    </button>
                  </th>
                  <th className='px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500'>
                    <button
                      type='button'
                      onClick={() => handleLogbookHeaderSort('details')}
                      aria-label='Ordenar por detalle'
                      className='inline-flex items-center gap-1'
                    >
                      Detalle
                      <span className='text-[10px]' aria-hidden='true'>
                        {getSortIndicator(logbookSortBy === 'details', logbookSortDirection)}
                      </span>
                    </button>
                  </th>
                  <th className='px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500'>
                    <button
                      type='button'
                      onClick={() => handleLogbookHeaderSort('actor')}
                      aria-label='Ordenar por usuario'
                      className='inline-flex items-center gap-1'
                    >
                      Usuario
                      <span className='text-[10px]' aria-hidden='true'>
                        {getSortIndicator(logbookSortBy === 'actor', logbookSortDirection)}
                      </span>
                    </button>
                  </th>
                  <th className='px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500'>
                    <button
                      type='button'
                      onClick={() => handleLogbookHeaderSort('status')}
                      aria-label='Ordenar por estado'
                      className='inline-flex items-center gap-1'
                    >
                      Estado
                      <span className='text-[10px]' aria-hidden='true'>
                        {getSortIndicator(logbookSortBy === 'status', logbookSortDirection)}
                      </span>
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody className='divide-y divide-slate-100 bg-white'>
                {sortedLogbookItems.map(item => (
                  <tr key={item.id}>
                    <td className='whitespace-nowrap px-3 py-2 text-sm text-slate-700'>
                      {new Date(item.createdAt).toLocaleString('es-MX')}
                    </td>
                    <td className='px-3 py-2 text-sm text-slate-700'>{item.category}</td>
                    <td className='px-3 py-2 text-sm text-slate-800'>
                      <p>{item.actionLabel}</p>
                    </td>
                    <td className='px-3 py-2 text-sm text-slate-700'>
                      <div className='max-w-full whitespace-pre-wrap break-words text-xs leading-5'>{item.details}</div>
                    </td>
                    <td className='px-3 py-2 text-sm text-slate-700'>
                      {item.actorUsername} <span className='text-xs text-slate-500'>({item.actorRole})</span>
                    </td>
                    <td className='px-3 py-2 text-sm text-slate-700'>
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          item.status === 'success'
                            ? 'bg-emerald-100 text-emerald-800'
                            : item.status === 'failed'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {item.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!sortedLogbookItems.length && !loadingLogbook ? (
              <p className='px-3 py-4 text-sm text-slate-500'>Sin operaciones para los filtros seleccionados.</p>
            ) : null}
          </div>
        </div>
      </section>

      {toasts.length ? (
        <div className='fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2' aria-live='polite'>
          {toasts.map(toast => (
            <div
              key={toast.id}
              role='status'
              className={`rounded-lg border px-4 py-3 text-sm shadow-lg ${
                toast.kind === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                  : toast.kind === 'error'
                    ? 'border-rose-200 bg-rose-50 text-rose-900'
                    : 'border-slate-200 bg-white text-slate-800'
              }`}
            >
              {toast.text}
            </div>
          ))}
        </div>
      ) : null}
    </main>
  )
}
