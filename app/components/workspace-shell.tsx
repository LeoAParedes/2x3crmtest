'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react'

import { WorkspaceAlertsBell } from '@/app/components/workspace-alerts-bell'
import type { CrmRole } from '@/src/lib/security/rbac'

type WorkspaceShellProps = {
  username: string
  role: CrmRole
  children: ReactNode
}

type NavLeaf = {
  href: string
  label: string
  iconSrc: string
  adminOnly?: boolean
  cashierHidden?: boolean
}

type NavGroup = {
  id: string
  label: string
  href?: string
  iconSrc: string
  adminOnly?: boolean
  cashierHidden?: boolean
  children?: NavLeaf[]
}

const navTree: NavGroup[] = [
  {
    id: 'pos',
    label: 'POS',
    href: '/pos',
    iconSrc: '/icons/nav/pos.png'
  },
  {
    id: 'dashboard',
    label: 'Dashboard',
    href: '/admin',
    iconSrc: '/icons/nav/dashboard.png',
    adminOnly: true
  },
  {
    id: 'bitacora',
    label: 'Bitácora',
    href: '/bitacora',
    iconSrc: '/icons/nav/bitacora.png'
  },
  {
    id: 'inventarios',
    label: 'Inventarios',
    href: '/inventario',
    iconSrc: '/icons/nav/inventory.png',
    children: [
      {
        href: '/inventario/merma-caducidad',
        label: 'Merma y Caducidad',
        iconSrc: '/icons/nav/adjust.png'
      },
      {
        href: '/inventario?shortcut=ajuste',
        label: 'Ajuste rápido',
        iconSrc: '/icons/nav/adjust.png'
      }
    ]
  },
  {
    id: 'finanzas',
    label: 'Finanzas',
    href: '/finanzas',
    iconSrc: '/icons/nav/finance.png',
    adminOnly: true,
    children: [
      { href: '/finanzas/periodos', label: 'Periodos', iconSrc: '/icons/nav/finance.png' },
      { href: '/finanzas/fondos', label: 'Fondos activo', iconSrc: '/icons/nav/finance.png' },
      { href: '/finanzas/pasivo', label: 'Pasivo', iconSrc: '/icons/nav/finance.png' },
      {
        href: '/finanzas/compras',
        label: 'Compras y Proveedores',
        iconSrc: '/icons/nav/finance.png'
      },
      {
        href: '/finanzas/promociones',
        label: 'Descuentos y promociones',
        iconSrc: '/icons/nav/finance.png'
      }
    ]
  },
  {
    id: 'configuracion',
    label: 'Configuración',
    href: '/configuracion',
    iconSrc: '/icons/nav/operations.png',
    adminOnly: true,
    children: [
      {
        href: '/configuracion?tab=cajeros',
        label: 'Cajeros',
        iconSrc: '/icons/nav/adjust.png',
        adminOnly: true
      },
      {
        href: '/configuracion?tab=turno',
        label: 'Turno / Corte',
        iconSrc: '/icons/nav/pos.png'
      }
    ]
  }
]

type ParsedNavHref = {
  pathname: string
  searchParams: URLSearchParams
}

const parseNavHref = (href: string): ParsedNavHref => {
  const [rawPathname, rawQuery = ''] = href.split('?')
  return {
    pathname: rawPathname || '/',
    searchParams: new URLSearchParams(rawQuery)
  }
}

const doesHrefMatchRoute = (href: string, pathname: string, currentSearchParams: URLSearchParams) => {
  const parsed = parseNavHref(href)
  if (parsed.pathname !== pathname) {
    if (pathname.startsWith(`${parsed.pathname}/`) && !Array.from(parsed.searchParams.keys()).length) {
      return false
    }
    return false
  }

  const expectedEntries = Array.from(parsed.searchParams.entries())
  if (!expectedEntries.length) {
    const hasShortcut = currentSearchParams.has('shortcut') || currentSearchParams.has('tab')
    if (hasShortcut && (pathname === '/inventario' || pathname === '/configuracion')) {
      return false
    }
    return true
  }

  return expectedEntries.every(([key, value]) => currentSearchParams.get(key) === value)
}

const flattenNavHrefs = (groups: NavGroup[]) => {
  const hrefs: string[] = []
  for (const group of groups) {
    if (group.href) hrefs.push(group.href)
    for (const child of group.children || []) {
      hrefs.push(child.href)
    }
  }
  return hrefs
}

const getActiveHref = (hrefs: string[], pathname: string, currentSearchParams: URLSearchParams) => {
  const sorted = [...hrefs].sort((left, right) => {
    const rightScore =
      Array.from(parseNavHref(right).searchParams.keys()).length * 10 + parseNavHref(right).pathname.length
    const leftScore =
      Array.from(parseNavHref(left).searchParams.keys()).length * 10 + parseNavHref(left).pathname.length
    return rightScore - leftScore
  })

  return sorted.find(href => doesHrefMatchRoute(href, pathname, currentSearchParams)) ?? null
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
      cart?: Array<{ inventoryItemId?: string }>
    }
    const cart = parsed.cart ?? []
    const productIds = new Set(
      cart
        .map(item => item.inventoryItemId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    )
    return productIds.size
  } catch {
    return 0
  }
}

const formatCartCount = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return '0'
  return String(Math.round(value))
}

const handleNavKeyDown = (event: KeyboardEvent<HTMLAnchorElement | HTMLButtonElement>) => {
  if (event.key !== 'Enter' && event.key !== ' ') return
  if (event.key === ' ') event.preventDefault()
}

export const WorkspaceShell = ({ username, role, children }: WorkspaceShellProps) => {
  const [expanded, setExpanded] = useState(true)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [mobileOpenRouteKey, setMobileOpenRouteKey] = useState<string | null>(null)
  const [manualOpenGroups, setOpenGroups] = useState<Record<string, boolean>>({})
  const [cashierGate, setCashierGate] = useState<'ready' | 'on_shift' | 'must_logout' | null>(
    role === 'cashier' ? null : 'ready'
  )
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const routeKey = `${pathname}?${searchParams.toString()}`
  const postCutLock = role === 'cashier' && cashierGate === 'must_logout'

  const visibleGroups = useMemo(() => {
    return navTree
      .filter(group => {
        if (postCutLock) return false
        if (group.adminOnly && role !== 'admin') return false
        if (group.cashierHidden && role === 'cashier') return false
        return true
      })
      .map(group => ({
        ...group,
        children: (group.children || []).filter(child => {
          if (child.adminOnly && role !== 'admin') return false
          if (child.cashierHidden && role === 'cashier') return false
          return true
        })
      }))
  }, [role, postCutLock])

  const allHrefs = useMemo(() => flattenNavHrefs(visibleGroups), [visibleGroups])
  const activeHref = useMemo(
    () => getActiveHref(allHrefs, pathname, new URLSearchParams(searchParams.toString())),
    [allHrefs, pathname, searchParams]
  )

  const currentModule = useMemo(() => {
    for (const group of visibleGroups) {
      if (group.href === activeHref) return group.label
      const child = group.children?.find(item => item.href === activeHref)
      if (child) return child.label
    }
    if (pathname.startsWith('/caja')) return 'Turno / Corte'
    return 'Sistema'
  }, [visibleGroups, activeHref, pathname])

  const canAccessPos = (role === 'admin' || role === 'cashier') && !postCutLock
  const [universalCartCount, setUniversalCartCount] = useState(0)
  const isMobileDrawerOpen = mobileOpen && mobileOpenRouteKey === routeKey
  const isSidebarExpanded = isMobileDrawerOpen || expanded

  const openGroups = useMemo(() => {
    const computed = { ...manualOpenGroups }
    for (const group of visibleGroups) {
      const childActive = group.children?.some(child => child.href === activeHref)
      const parentActive = group.href === activeHref || pathname.startsWith(`${group.href}/`)
      if (childActive || parentActive) {
        computed[group.id] = true
      }
    }
    return computed
  }, [manualOpenGroups, visibleGroups, activeHref, pathname])

  useEffect(() => {
    if (role !== 'cashier') return
    let cancelled = false
    const loadGate = async () => {
      try {
        const response = await fetch('/api/caja/session')
        const payload = (await response.json()) as { gate?: 'ready' | 'on_shift' | 'must_logout' }
        if (!cancelled) {
          setCashierGate(payload.gate || 'ready')
        }
      } catch {
        if (!cancelled) setCashierGate('ready')
      }
    }
    void loadGate()
    return () => {
      cancelled = true
    }
  }, [role, pathname])

  useEffect(() => {
    if (postCutLock && pathname !== '/caja') {
      router.replace('/caja')
    }
  }, [postCutLock, pathname, router])

  useEffect(() => {
    const syncFromCookie = () => {
      setUniversalCartCount(readCartCountFromDraftCookie())
    }

    syncFromCookie()
    const handleCartUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ distinctProductCount?: number }>).detail
      const nextCount =
        typeof detail?.distinctProductCount === 'number'
          ? detail.distinctProductCount
          : readCartCountFromDraftCookie()
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

  const handleToggleGroup = (groupId: string) => {
    setOpenGroups(current => ({ ...current, [groupId]: !current[groupId] }))
  }

  const renderLeafLink = (item: NavLeaf, nested: boolean) => {
    const active = item.href === activeHref
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
          nested ? 'ml-2' : ''
        } ${
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
  }

  const renderNavigation = () => (
    <nav className='flex-1 space-y-1 overflow-y-auto overscroll-contain px-3 py-4' aria-label='Navegación principal del sistema'>
      {visibleGroups.map(group => {
        const hasChildren = Boolean(group.children?.length)
        const isOpen = openGroups[group.id] ?? false
        const groupActive =
          group.href === activeHref || group.children?.some(child => child.href === activeHref)

        if (!hasChildren && group.href) {
          return (
            <div key={group.id} className='space-y-1'>
              {renderLeafLink(
                {
                  href: group.href,
                  label: group.label,
                  iconSrc: group.iconSrc,
                  adminOnly: group.adminOnly
                },
                false
              )}
            </div>
          )
        }

        return (
          <div key={group.id} className='space-y-1'>
            <div className='flex items-center gap-1'>
              {group.href ? (
                <Link
                  href={group.href}
                  aria-label={group.label}
                  aria-current={group.href === activeHref ? 'page' : undefined}
                  tabIndex={0}
                  onClick={handleCloseMobileNav}
                  onKeyDown={handleNavKeyDown}
                  className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-[6px] px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3ecf8e]/40 ${
                    groupActive
                      ? 'border border-[rgba(62,207,142,0.3)] bg-[rgba(62,207,142,0.12)] text-[#fafafa]'
                      : 'border border-transparent text-[#b4b4b4] hover:border-[#363636] hover:bg-[#1c1c1c] hover:text-[#fafafa]'
                  }`}
                >
                  <Image
                    src={group.iconSrc}
                    alt=''
                    width={18}
                    height={18}
                    aria-hidden='true'
                    className='h-[18px] w-[18px] shrink-0 object-contain opacity-90'
                  />
                  {isSidebarExpanded ? <span className='truncate'>{group.label}</span> : null}
                </Link>
              ) : (
                <span className='flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2 text-sm text-[#b4b4b4]'>
                  <Image
                    src={group.iconSrc}
                    alt=''
                    width={18}
                    height={18}
                    aria-hidden='true'
                    className='h-[18px] w-[18px] shrink-0 object-contain'
                  />
                  {isSidebarExpanded ? <span className='truncate'>{group.label}</span> : null}
                </span>
              )}
              {isSidebarExpanded && hasChildren ? (
                <button
                  type='button'
                  aria-label={isOpen ? `Contraer ${group.label}` : `Expandir ${group.label}`}
                  aria-expanded={isOpen}
                  onClick={() => handleToggleGroup(group.id)}
                  onKeyDown={handleNavKeyDown}
                  className='rounded-[6px] border border-transparent px-2 py-2 text-xs text-[#898989] hover:border-[#363636] hover:bg-[#1c1c1c] hover:text-[#fafafa] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3ecf8e]/40'
                >
                  {isOpen ? '▾' : '▸'}
                </button>
              ) : null}
            </div>
            {isSidebarExpanded && hasChildren && isOpen ? (
              <div className='space-y-1 border-l border-[#2e2e2e] pl-2'>
                {group.children?.map(child => renderLeafLink(child, true))}
              </div>
            ) : null}
          </div>
        )
      })}

      {role === 'cashier' && !postCutLock ? (
        <div className='pt-3'>
          {renderLeafLink(
            {
              href: '/caja',
              label: 'Turno / Corte',
              iconSrc: '/icons/nav/pos.png'
            },
            false
          )}
        </div>
      ) : null}
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
              <WorkspaceAlertsBell />
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
