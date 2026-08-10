'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState, type ReactNode } from 'react'

import type { CrmRole } from '@/src/lib/security/rbac'

type WorkspaceShellProps = {
  username: string
  role: CrmRole
  children: ReactNode
}

type NavItem = {
  href: string
  label: string
  section: 'pos' | 'operations' | 'inventory' | 'finance'
  icon: string
  adminOnly?: boolean
}

type ParsedNavHref = {
  pathname: string
  searchParams: URLSearchParams
}

const navItems: NavItem[] = [
  { href: '/pos', label: 'Punto de venta', section: 'pos', icon: '🧾' },
  { href: '/admin', label: 'Dashboard operativo', section: 'operations', icon: '📊' },
  { href: '/operaciones', label: 'Operaciones', section: 'operations', icon: '⚙️' },
  { href: '/inventario', label: 'Inventarios', section: 'inventory', icon: '📦' },
  { href: '/inventario?shortcut=ajuste', label: 'Ajuste rápido', section: 'inventory', icon: '🛠️' },
  { href: '/inventario?shortcut=movimientos', label: 'Movimientos', section: 'inventory', icon: '🔁' },
  { href: '/finanzas', label: 'Finanzas', section: 'finance', icon: '💳' }
]

const sectionTitle: Record<NavItem['section'], string> = {
  pos: 'POS',
  operations: 'Operaciones',
  inventory: 'Inventarios',
  finance: 'Finanzas'
}

const parseNavHref = (href: string): ParsedNavHref => {
  const [rawPathname, rawQuery = ''] = href.split('?')
  return {
    pathname: rawPathname || '/',
    searchParams: new URLSearchParams(rawQuery)
  }
}

const doesNavItemMatchRoute = (item: NavItem, pathname: string, currentSearchParams: URLSearchParams) => {
  const parsedItemHref = parseNavHref(item.href)
  if (parsedItemHref.pathname !== pathname) return false

  const expectedEntries = Array.from(parsedItemHref.searchParams.entries())
  if (!expectedEntries.length) return true

  return expectedEntries.every(([key, value]) => currentSearchParams.get(key) === value)
}

const getActiveNavItemHref = (items: NavItem[], pathname: string, currentSearchParams: URLSearchParams) => {
  const sortedBySpecificity = [...items].sort((leftItem, rightItem) => {
    const rightSpecificity = Array.from(parseNavHref(rightItem.href).searchParams.keys()).length
    const leftSpecificity = Array.from(parseNavHref(leftItem.href).searchParams.keys()).length
    return rightSpecificity - leftSpecificity
  })

  const activeItem = sortedBySpecificity.find(item => doesNavItemMatchRoute(item, pathname, currentSearchParams))
  return activeItem?.href ?? null
}

const POS_DRAFT_COOKIE = 'pos_draft'

const readCartCountFromDraftCookie = () => {
  if (typeof document === 'undefined') return 0
  const rawCookie = document.cookie
    .split('; ')
    .find(item => item.startsWith(`${POS_DRAFT_COOKIE}=`))
    ?.split('=')
    .slice(1)
    .join('=')

  if (!rawCookie) return 0

  try {
    const decoded = decodeURIComponent(rawCookie)
    const parsed = JSON.parse(decoded) as {
      cart?: Array<{ quantityInput?: string; unitMode?: 'piece' | 'weight' }>
    }
    const cart = parsed.cart ?? []
    return Number(
      cart
        .reduce((sum, item) => {
          const rawValue = String(item.quantityInput ?? '0').replace(',', '.')
          const numericValue = Number(rawValue)
          if (!Number.isFinite(numericValue) || numericValue <= 0) return sum
          return sum + numericValue
        }, 0)
        .toFixed(2)
    )
  } catch {
    return 0
  }
}

const formatCartCount = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return '0'
  return Number.isInteger(value) ? String(value) : value.toFixed(2)
}

export const WorkspaceShell = ({ username, role, children }: WorkspaceShellProps) => {
  const [expanded, setExpanded] = useState(true)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [mobileOpenRouteKey, setMobileOpenRouteKey] = useState<string | null>(null)
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const routeKey = `${pathname}?${searchParams.toString()}`
  const visibleItems = navItems.filter(item => {
    if (item.adminOnly && role !== 'admin') return false
    if (role === 'cashier' && (item.section === 'finance' || item.href === '/admin')) return false
    return true
  })
  const activeItemHref = useMemo(
    () => getActiveNavItemHref(visibleItems, pathname, new URLSearchParams(searchParams.toString())),
    [visibleItems, pathname, searchParams]
  )
  const currentModule = visibleItems.find(item => item.href === activeItemHref)?.label || 'Sistema'
  const canAccessPos = role === 'admin' || role === 'cashier'
  const [universalCartCount, setUniversalCartCount] = useState(0)
  const isMobileDrawerOpen = mobileOpen && mobileOpenRouteKey === routeKey
  const isSidebarExpanded = isMobileDrawerOpen || expanded

  useEffect(() => {
    const syncFromCookie = () => {
      setUniversalCartCount(readCartCountFromDraftCookie())
    }

    syncFromCookie()
    const handleCartUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ totalQuantity?: number }>).detail
      const nextCount = typeof detail?.totalQuantity === 'number' ? detail.totalQuantity : readCartCountFromDraftCookie()
      setUniversalCartCount(nextCount)
    }

    const handleWindowFocus = () => {
      syncFromCookie()
    }

    window.addEventListener('pos-cart-updated', handleCartUpdated as EventListener)
    window.addEventListener('focus', handleWindowFocus)
    return () => {
      window.removeEventListener('pos-cart-updated', handleCartUpdated as EventListener)
      window.removeEventListener('focus', handleWindowFocus)
    }
  }, [])

  const renderNavigation = () => (
    <nav className='space-y-4 px-3 py-4' aria-label='Navegación principal del sistema'>
      {(Object.keys(sectionTitle) as Array<NavItem['section']>).map(section => {
        const items = visibleItems.filter(item => item.section === section)
        if (!items.length) return null

        return (
          <section key={section} className='space-y-1'>
            {isSidebarExpanded ? (
              <p className='px-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-400'>{sectionTitle[section]}</p>
            ) : null}
            {items.map(item => {
              const active = item.href === activeItemHref
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-label={item.label}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
                    active ? 'bg-emerald-400 font-semibold text-slate-950' : 'text-slate-200 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <span aria-hidden='true' className='text-base'>
                    {item.icon}
                  </span>
                  {isSidebarExpanded ? <span>{item.label}</span> : null}
                </Link>
              )
            })}
          </section>
        )
      })}
    </nav>
  )

  return (
    <div className='flex min-h-screen bg-slate-950 text-slate-100'>
      {isMobileDrawerOpen ? (
        <button
          type='button'
          aria-label='Cerrar menú'
          onClick={() => setMobileOpen(false)}
          className='fixed inset-0 z-30 bg-black/50 lg:hidden'
        />
      ) : null}
      <aside
        className={`fixed left-0 top-0 z-40 h-screen border-r border-slate-800 bg-slate-900 transition-[width,transform] duration-300 ease-out lg:static ${
          isMobileDrawerOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        } ${isSidebarExpanded ? 'w-72' : 'w-20'}`}
      >
        <div className='flex items-center justify-between border-b border-slate-800 px-4 py-4'>
          {isSidebarExpanded ? <p className='text-sm font-semibold tracking-wide text-emerald-300'>2x3 Operaciones</p> : null}
          <button
            type='button'
            aria-label={expanded ? 'Contraer navegación' : 'Expandir navegación'}
            onClick={() => setExpanded(current => !current)}
            className='rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800'
          >
            {expanded ? '<<' : '>>'}
          </button>
        </div>

        {renderNavigation()}

        <div className='border-t border-slate-800 px-3 py-4'>
          {isSidebarExpanded ? (
            <div className='space-y-3'>
              <p className='text-xs text-slate-400'>Sesión</p>
              <p className='text-sm font-medium text-white'>{username}</p>
              <form action='/auth/logout' method='post'>
                <button
                  type='submit'
                  aria-label='Cerrar sesión'
                  className='w-full rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-100 hover:bg-slate-800'
                >
                  Salir
                </button>
              </form>
            </div>
          ) : (
            <form action='/auth/logout' method='post'>
              <button
                type='submit'
                aria-label='Cerrar sesión'
                className='w-full rounded-lg border border-slate-700 px-2 py-2 text-xs text-slate-100 hover:bg-slate-800'
              >
                X
              </button>
            </form>
          )}
        </div>
      </aside>

      <div className='min-h-screen flex-1 overflow-x-hidden bg-slate-100 text-slate-950 lg:pl-0'>
        <header className='sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur'>
          <div className='mx-auto flex h-14 max-w-7xl items-center justify-between px-4 md:px-8'>
            <button
              type='button'
              aria-label='Abrir navegación'
              onClick={() => {
                setMobileOpenRouteKey(routeKey)
                setMobileOpen(true)
              }}
              className='rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-700 lg:hidden'
            >
              Menú
            </button>
            <div className='flex items-center gap-3'>
              <p className='text-sm font-semibold text-slate-900'>{currentModule}</p>
              <span className='rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600'>{role}</span>
            </div>
            <div className='flex items-center gap-2'>
              {canAccessPos ? (
                <Link
                  href='/pos?openCart=1'
                  aria-label='Abrir carrito universal'
                  className='inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300'
                >
                  <span aria-hidden='true'>🛒</span>
                  <span className='hidden sm:inline'>Carrito</span>
                  <span className='rounded-full bg-emerald-600 px-1.5 py-0.5 text-[10px] text-white'>
                    {formatCartCount(universalCartCount)}
                  </span>
                </Link>
              ) : null}
              <p className='hidden text-sm text-slate-600 md:block'>Usuario: {username}</p>
            </div>
          </div>
        </header>
        {children}
      </div>
    </div>
  )
}
