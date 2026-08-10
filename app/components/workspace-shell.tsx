'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react'

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
  iconSrc: string
  adminOnly?: boolean
}

type ParsedNavHref = {
  pathname: string
  searchParams: URLSearchParams
}

const navItems: NavItem[] = [
  { href: '/pos', label: 'Punto de venta', section: 'pos', iconSrc: '/icons/nav/pos.png' },
  { href: '/admin', label: 'Dashboard operativo', section: 'operations', iconSrc: '/icons/nav/dashboard.png' },
  { href: '/operaciones', label: 'Operaciones', section: 'operations', iconSrc: '/icons/nav/operations.png' },
  { href: '/inventario', label: 'Inventarios', section: 'inventory', iconSrc: '/icons/nav/inventory.png' },
  { href: '/inventario?shortcut=ajuste', label: 'Ajuste rápido', section: 'inventory', iconSrc: '/icons/nav/adjust.png' },
  { href: '/inventario?shortcut=bitacora', label: 'Bitácora', section: 'inventory', iconSrc: '/icons/nav/bitacora.png' },
  { href: '/finanzas', label: 'Finanzas', section: 'finance', iconSrc: '/icons/nav/finance.png' }
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

const handleNavKeyDown = (event: KeyboardEvent<HTMLAnchorElement>) => {
  if (event.key !== 'Enter' && event.key !== ' ') return
  if (event.key === ' ') event.preventDefault()
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

  const handleToggleExpanded = () => {
    setExpanded(current => !current)
  }

  const handleOpenMobileNav = () => {
    setMobileOpenRouteKey(routeKey)
    setMobileOpen(true)
  }

  const handleCloseMobileNav = () => {
    setMobileOpen(false)
  }

  const renderNavigation = () => (
    <nav className='flex-1 space-y-5 overflow-y-auto overscroll-contain px-3 py-4' aria-label='Navegación principal del sistema'>
      {(Object.keys(sectionTitle) as Array<NavItem['section']>).map(section => {
        const items = visibleItems.filter(item => item.section === section)
        if (!items.length) return null

        return (
          <section key={section} className='space-y-1'>
            {isSidebarExpanded ? (
              <p className='px-2 font-mono text-[11px] font-normal uppercase tracking-[1.2px] text-[#898989]'>
                {sectionTitle[section]}
              </p>
            ) : null}
            {items.map(item => {
              const active = item.href === activeItemHref
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-label={item.label}
                  aria-current={active ? 'page' : undefined}
                  tabIndex={0}
                  onClick={handleCloseMobileNav}
                  onKeyDown={handleNavKeyDown}
                  className={`group flex items-center gap-2.5 rounded-[6px] px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3ecf8e]/40 ${
                    active
                      ? 'border border-[rgba(62,207,142,0.3)] bg-[rgba(62,207,142,0.12)] text-[#fafafa]'
                      : 'border border-transparent text-[#b4b4b4] hover:border-[#363636] hover:bg-[#1c1c1c] hover:text-[#fafafa]'
                  }`}
                >
                  <Image
                    src={item.iconSrc}
                    alt=''
                    width={18}
                    height={18}
                    aria-hidden='true'
                    className={`h-[18px] w-[18px] shrink-0 object-contain transition ${
                      active ? 'opacity-100' : 'opacity-75'
                    }`}
                  />
                  {isSidebarExpanded ? <span className='truncate'>{item.label}</span> : null}
                </Link>
              )
            })}
          </section>
        )
      })}
    </nav>
  )

  return (
    <div className='flex min-h-dvh bg-[#171717] text-[#fafafa]'>
      {isMobileDrawerOpen ? (
        <button
          type='button'
          aria-label='Cerrar menú'
          onClick={handleCloseMobileNav}
          className='fixed inset-0 z-30 bg-black/50 lg:hidden'
        />
      ) : null}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex h-dvh flex-col border-r border-[#2e2e2e] bg-[#171717] transition-[width,transform] duration-300 ease-out lg:sticky lg:top-0 lg:z-30 ${
          isMobileDrawerOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        } ${isSidebarExpanded ? 'w-72' : 'w-20'}`}
      >
        <div className='flex shrink-0 items-center justify-between border-b border-[#242424] px-4 py-4'>
          {isSidebarExpanded ? (
            <p className='text-sm font-medium tracking-wide text-[#3ecf8e]'>2x3 Operaciones</p>
          ) : (
            <span className='sr-only'>2x3 Operaciones</span>
          )}
          <button
            type='button'
            aria-label={expanded ? 'Contraer navegación' : 'Expandir navegación'}
            onClick={handleToggleExpanded}
            className='rounded-[6px] border border-[#2e2e2e] px-2 py-1 text-xs text-[#b4b4b4] transition hover:border-[#363636] hover:bg-[#1c1c1c] hover:text-[#fafafa] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3ecf8e]/40'
          >
            {expanded ? '<<' : '>>'}
          </button>
        </div>

        {renderNavigation()}

        <div className='shrink-0 border-t border-[#242424] px-3 py-4'>
          {isSidebarExpanded ? (
            <div className='space-y-3'>
              <p className='font-mono text-[11px] uppercase tracking-[1.2px] text-[#898989]'>Sesión</p>
              <p className='truncate text-sm font-medium text-[#fafafa]'>{username}</p>
              <form action='/auth/logout' method='post'>
                <button
                  type='submit'
                  aria-label='Cerrar sesión'
                  className='w-full rounded-[6px] border border-[#2e2e2e] px-3 py-2 text-sm font-medium text-[#fafafa] transition hover:border-[#363636] hover:bg-[#1c1c1c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3ecf8e]/40'
                >
                  Salir
                </button>
              </form>
              <a
                href='https://icons8.com'
                target='_blank'
                rel='noreferrer'
                aria-label='Iconos por Icons8'
                tabIndex={0}
                className='block text-[10px] text-[#898989] transition hover:text-[#b4b4b4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3ecf8e]/40'
              >
                Icons by Icons8
              </a>
            </div>
          ) : (
            <form action='/auth/logout' method='post'>
              <button
                type='submit'
                aria-label='Cerrar sesión'
                className='w-full rounded-[6px] border border-[#2e2e2e] px-2 py-2 text-xs text-[#fafafa] transition hover:border-[#363636] hover:bg-[#1c1c1c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3ecf8e]/40'
              >
                X
              </button>
            </form>
          )}
        </div>
      </aside>

      <div className='flex min-h-dvh min-w-0 flex-1 flex-col overflow-x-hidden bg-slate-100 text-slate-950'>
        <header className='sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur'>
          <div className='mx-auto flex h-14 max-w-7xl items-center justify-between px-4 md:px-8'>
            <button
              type='button'
              aria-label='Abrir navegación'
              onClick={handleOpenMobileNav}
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
                  tabIndex={0}
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
