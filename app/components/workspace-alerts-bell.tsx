'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'

type LowStockAlert = {
  kind: 'low_stock'
  id: string
  sku: string
  productName: string
  stock: number
  minStock: number
  href: string
}

type ExpiryAlert = {
  kind: 'expiring' | 'expired'
  id: string
  sku: string
  productName: string
  quantityRemaining: number
  expiresOn: string
  href: string
}

type AlertsPayload = {
  success?: boolean
  totalCount?: number
  lowStock?: LowStockAlert[]
  expiry?: ExpiryAlert[]
  message?: string
}

export const WorkspaceAlertsBell = () => {
  const [open, setOpen] = useState(false)
  const [totalCount, setTotalCount] = useState(0)
  const [lowStock, setLowStock] = useState<LowStockAlert[]>([])
  const [expiry, setExpiry] = useState<ExpiryAlert[]>([])
  const mountedRef = useRef(false)

  const applyAlerts = useCallback((payload: AlertsPayload) => {
    setTotalCount(payload.totalCount || 0)
    setLowStock(payload.lowStock || [])
    setExpiry(payload.expiry || [])
  }, [])

  const loadAlerts = useCallback(async () => {
    try {
      const response = await fetch('/api/notifications/alerts')
      const payload = (await response.json()) as AlertsPayload
      if (!response.ok || !payload.success) return
      applyAlerts(payload)
    } catch {
      // Silent: header bell should not block the workspace.
    }
  }, [applyAlerts])

  useEffect(() => {
    if (mountedRef.current) return
    mountedRef.current = true
    const timer = window.setInterval(() => {
      void loadAlerts()
    }, 60_000)
    queueMicrotask(() => {
      void loadAlerts()
    })
    return () => window.clearInterval(timer)
  }, [loadAlerts])

  const handleToggle = () => {
    const nextOpen = !open
    setOpen(nextOpen)
    if (nextOpen) void loadAlerts()
  }

  return (
    <div className='relative'>
      <button
        type='button'
        aria-label={`Alertas del sistema${totalCount > 0 ? `, ${totalCount} pendientes` : ''}`}
        aria-expanded={open}
        onClick={handleToggle}
        className='relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-base text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300'
      >
        <span aria-hidden='true'>🔔</span>
        {totalCount > 0 ? (
          <span className='absolute -right-1 -top-1 rounded-full bg-rose-600 px-1.5 text-[10px] font-semibold text-white'>
            {totalCount > 99 ? '99+' : totalCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          className='absolute right-0 z-40 mt-2 w-80 rounded-xl border border-slate-200 bg-white p-3 shadow-lg'
          role='region'
          aria-label='Listado de alertas'
        >
          <div className='mb-2 flex items-center justify-between'>
            <p className='text-sm font-semibold text-slate-900'>Alertas</p>
            <button
              type='button'
              aria-label='Cerrar alertas'
              onClick={() => setOpen(false)}
              className='text-xs text-slate-500 hover:text-slate-800'
            >
              Cerrar
            </button>
          </div>

          {totalCount === 0 ? (
            <p className='text-sm text-slate-500'>Sin alertas de stock ni caducidad.</p>
          ) : (
            <ul className='max-h-80 space-y-2 overflow-y-auto'>
              {expiry.map(item => (
                <li key={`exp-${item.id}`}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className='block rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-left text-xs text-amber-950 hover:bg-amber-100'
                  >
                    <span className='font-semibold'>
                      {item.kind === 'expired' ? 'Vencido' : 'Caduca mañana'}
                    </span>
                    : {item.productName} ({item.sku}) · {item.quantityRemaining} uds · {item.expiresOn}
                  </Link>
                </li>
              ))}
              {lowStock.map(item => (
                <li key={`low-${item.id}`}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className='block rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-left text-xs text-rose-950 hover:bg-rose-100'
                  >
                    <span className='font-semibold'>Stock bajo</span>: {item.productName} ({item.sku}) ·{' '}
                    {item.stock}/{item.minStock}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  )
}
