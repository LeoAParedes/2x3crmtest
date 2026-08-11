'use client'

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

import { formatMxnCurrency } from '@/src/lib/mxn-currency'
import { buildSaleTicketText, type TicketSale } from '@/src/lib/pos/ticket-format'

const DESKTOP_VIEWPORT_QUERY = '(min-width: 1024px)'

const subscribeDesktopViewport = (onStoreChange: () => void) => {
  const mediaQuery = window.matchMedia(DESKTOP_VIEWPORT_QUERY)
  mediaQuery.addEventListener('change', onStoreChange)
  return () => mediaQuery.removeEventListener('change', onStoreChange)
}

const getDesktopViewportSnapshot = () => window.matchMedia(DESKTOP_VIEWPORT_QUERY).matches
const getDesktopViewportServerSnapshot = () => false

type Product = {
  id: string
  sku: string
  productName: string
  category: string
  stock: number
  unitPrice: number
  aisle: string | null
  supportsWeight: boolean
}

type CartItem = {
  inventoryItemId: string
  sku: string
  productName: string
  unitPrice: number
  supportsWeight: boolean
  unitMode: 'piece' | 'weight'
  quantityInput: string
}

type InventoryResponse = {
  success: boolean
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
  items: Product[]
}

type SaleResponse = {
  success: boolean
  sale?: {
    id: string
    saleNumber: string
    cashierUsername: string
    total: number
    subtotal: number
    tax: number
    paymentMethod: 'cash' | 'card'
    amountReceived: number | null
    changeDue: number
    createdAt: string
    items: Array<{
      sku: string
      productName: string
      quantity: number
      unitMode: 'piece' | 'weight'
      unitPrice: number
      lineTotal: number
    }>
  }
  message?: string
  error?: {
    code?: string
    message?: string
  }
}

export const resolveSaleErrorMessage = (data: Pick<SaleResponse, 'message' | 'error'>) => {
  const fromBody = data.message?.trim() || data.error?.message?.trim()
  if (fromBody) return fromBody
  return 'No fue posible registrar la venta'
}

type PosDraft = {
  cart: CartItem[]
  paymentMethod: 'cash' | 'card'
  amountReceived: number | null
}

const POS_DRAFT_COOKIE = 'pos_draft'

type PosClientProps = {
  cashierUsername: string
}

export const parseWeightQuantity = (input: string) => {
  const normalized = Number(input.replace(',', '.'))
  if (!Number.isFinite(normalized) || normalized <= 0) return 0
  return Math.round(normalized * 1000)
}

export const parsePieceQuantity = (input: string) => {
  const normalized = Number(input)
  if (!Number.isFinite(normalized) || normalized <= 0) return 0
  return Math.round(normalized)
}

export const parseCurrencyInput = (input: string) => {
  if (!input.trim()) return null
  const normalized = Number(input.replace(',', '.'))
  if (!Number.isFinite(normalized) || normalized < 0) return null
  return Number(normalized.toFixed(2))
}

export const calculateCashChange = (amountReceived: number | null, total: number) => {
  if (amountReceived === null) return Number((0 - total).toFixed(2))
  return Number((amountReceived - total).toFixed(2))
}

const quantityToDisplay = (item: CartItem) => {
  if (item.unitMode === 'weight') {
    const kilos = Number(item.quantityInput.replace(',', '.'))
    return Number.isFinite(kilos) ? kilos : 0
  }
  const pieces = Number(item.quantityInput)
  return Number.isFinite(pieces) ? pieces : 0
}

const quantityStepByMode: Record<CartItem['unitMode'], number> = {
  piece: 1,
  weight: 0.25
}

const quantityMinByMode: Record<CartItem['unitMode'], number> = {
  piece: 1,
  weight: 0.25
}

const parseQuantityInputValue = (item: CartItem) => {
  if (item.unitMode === 'weight') {
    const value = Number(item.quantityInput.replace(',', '.'))
    return Number.isFinite(value) ? value : 0
  }
  const value = Number(item.quantityInput)
  return Number.isFinite(value) ? value : 0
}

const formatQuantityInputValue = (value: number, unitMode: CartItem['unitMode']) => {
  if (unitMode === 'weight') return value.toFixed(2)
  return String(Math.round(value))
}

const formatCartBadgeCount = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return '0'
  return String(Math.round(value))
}

const safeJsonParse = <T,>(value: string): T | null => {
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

const readDraftCookie = (): PosDraft | null => {
  const draftCookie = document.cookie
    .split('; ')
    .find(item => item.startsWith(`${POS_DRAFT_COOKIE}=`))
    ?.split('=')
    .slice(1)
    .join('=')
  if (!draftCookie) return null
  const decoded = decodeURIComponent(draftCookie)
  return safeJsonParse<PosDraft>(decoded)
}

const writeDraftCookie = (draft: PosDraft) => {
  document.cookie = `${POS_DRAFT_COOKIE}=${encodeURIComponent(JSON.stringify(draft))}; path=/; max-age=604800; samesite=lax`
}

const normalizeQuantityInput = (item: CartItem) => {
  if (item.unitMode === 'weight') {
    const value = Number(item.quantityInput.replace(',', '.'))
    if (!Number.isFinite(value) || value <= 0) return '0.25'
    return value.toFixed(2)
  }

  const value = Number(item.quantityInput)
  if (!Number.isFinite(value) || value <= 0) return '1'
  return String(Math.round(value))
}

const sanitizeCartItem = (item: CartItem): CartItem => {
  const normalizedMode: CartItem['unitMode'] = item.unitMode === 'weight' ? 'weight' : 'piece'
  const supportsWeight = item.supportsWeight ?? normalizedMode === 'weight'
  const enforcedMode: CartItem['unitMode'] = supportsWeight ? 'weight' : 'piece'
  return {
    ...item,
    supportsWeight,
    unitMode: enforcedMode,
    quantityInput: normalizeQuantityInput({ ...item, supportsWeight, unitMode: enforcedMode })
  }
}

const sanitizeCartItems = (items: CartItem[]) => items.map(sanitizeCartItem)

export const PosClient = ({ cashierUsername }: PosClientProps) => {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [products, setProducts] = useState<Product[]>([])
  const [cart, setCart] = useState<CartItem[]>([])
  const [query, setQuery] = useState('')
  const [sortBy, setSortBy] = useState<'productName' | 'sku' | 'stock' | 'unitPrice'>('productName')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card'>('cash')
  const [amountReceived, setAmountReceived] = useState<string>('')
  const [loadingProducts, setLoadingProducts] = useState(false)
  const [submittingSale, setSubmittingSale] = useState(false)
  const [ticket, setTicket] = useState<SaleResponse['sale'] | null>(null)
  const [isTicketModalOpen, setIsTicketModalOpen] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [draftLoaded, setDraftLoaded] = useState(false)
  // SSR-safe desktop default via useSyncExternalStore (avoids React #418 hydration mismatch).
  const isDesktopViewport = useSyncExternalStore(
    subscribeDesktopViewport,
    getDesktopViewportSnapshot,
    getDesktopViewportServerSnapshot
  )
  const [cartPanelUserOverride, setCartPanelUserOverride] = useState<boolean | null>(null)
  const isCartPanelOpen = cartPanelUserOverride ?? isDesktopViewport

  useEffect(() => {
    // #region agent log
    fetch('http://127.0.0.1:7470/ingest/f7f242f1-ff2d-40d4-bf0c-d535d5a2bbdb',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'449600'},body:JSON.stringify({sessionId:'449600',runId:'post-fix-418',hypothesisId:'H3',location:'pos-client.tsx:cartPanelMount',message:'cart panel open via sync external store',data:{isDesktopViewport,cartPanelUserOverride,isCartPanelOpen},timestamp:Date.now()})}).catch(()=>{})
    // #endregion
  }, [cartPanelUserOverride, isCartPanelOpen, isDesktopViewport])

  const subtotal = useMemo(
    () =>
      Number(
        cart
          .reduce((sum, item) => {
            if (item.unitMode === 'weight') {
              return sum + item.unitPrice * quantityToDisplay(item)
            }
            return sum + item.unitPrice * quantityToDisplay(item)
          }, 0)
          .toFixed(2)
      ),
    [cart]
  )
  const tax = 0
  const total = Number((subtotal + tax).toFixed(2))
  const parsedAmountReceived = parseCurrencyInput(amountReceived)
  const change = paymentMethod === 'cash' ? calculateCashChange(parsedAmountReceived, total) : 0

  const hasInvalidQuantities = useMemo(() => {
    return cart.some(item => {
      if (item.unitMode === 'weight') {
        return parseWeightQuantity(item.quantityInput) <= 0
      }
      return parsePieceQuantity(item.quantityInput) <= 0
    })
  }, [cart])

  const ticketText = useMemo(() => {
    if (!ticket) return null
    return buildSaleTicketText(ticket as TicketSale, {
      printerWidth: '80mm',
      storeHeader: ['2x3 CRM TEST', 'Ticket de venta']
    })
  }, [ticket])

  const persistDraft = async (draft: PosDraft) => {
    writeDraftCookie(draft)
    await fetch('/api/pos/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft)
    }).catch(() => {})
  }

  useEffect(() => {
    let cancelled = false

    const loadProducts = async () => {
      setLoadingProducts(true)
      try {
        const searchParams = new URLSearchParams({
          q: query,
          sortBy,
          sortDirection,
          page: String(page),
          pageSize: '20'
        })
        const response = await fetch(`/api/pos/inventory?${searchParams.toString()}`)
        const data = (await response.json()) as InventoryResponse
        if (!response.ok || !data.success) {
          throw new Error('No fue posible cargar productos para caja')
        }
        if (cancelled) return
        setProducts(data.items)
        setTotalPages(data.pagination.totalPages)
      } catch (error) {
        if (cancelled) return
        setMessage(error instanceof Error ? error.message : 'Error al cargar productos')
      } finally {
        if (cancelled) return
        setLoadingProducts(false)
      }
    }

    void loadProducts()

    return () => {
      cancelled = true
    }
  }, [query, sortBy, sortDirection, page, reloadToken])

  useEffect(() => {
    let cancelled = false

    const loadDraft = async () => {
      const cookieDraft = readDraftCookie()
      if (cookieDraft && !cancelled) {
        setCart(sanitizeCartItems(cookieDraft.cart))
        setPaymentMethod(cookieDraft.paymentMethod)
        setAmountReceived(cookieDraft.amountReceived !== null ? String(cookieDraft.amountReceived) : '')
      }

      try {
        const response = await fetch('/api/pos/draft')
        const data = (await response.json()) as { success?: boolean; draft?: PosDraft | null }
        if (response.ok && data.success && data.draft && !cancelled) {
          setCart(sanitizeCartItems(data.draft.cart))
          setPaymentMethod(data.draft.paymentMethod)
          setAmountReceived(data.draft.amountReceived !== null ? String(data.draft.amountReceived) : '')
        }
      } catch {}

      if (!cancelled) {
        setDraftLoaded(true)
      }
    }

    void loadDraft()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!draftLoaded) return
    const timeoutId = window.setTimeout(() => {
      void persistDraft({
        cart,
        paymentMethod,
        amountReceived: parsedAmountReceived
      })
    }, 300)
    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [cart, paymentMethod, parsedAmountReceived, draftLoaded])

  const handleAddToCart = (product: Product) => {
    setMessage(null)
    const unitMode: CartItem['unitMode'] = product.supportsWeight ? 'weight' : 'piece'
    const existing = cart.find(item => item.inventoryItemId === product.id)
    const nextCart: CartItem[] = existing
      ? cart.map(item =>
          item.inventoryItemId === product.id
            ? {
                ...item,
                supportsWeight: product.supportsWeight,
                unitMode,
                quantityInput:
                  unitMode === 'weight'
                    ? String((Number(item.quantityInput || '0') + 0.25).toFixed(2))
                    : String(parsePieceQuantity(item.quantityInput) + 1)
              }
            : item
        )
      : [
          ...cart,
          {
            inventoryItemId: product.id,
            sku: product.sku,
            productName: product.productName,
            unitPrice: product.unitPrice,
            supportsWeight: product.supportsWeight,
            unitMode,
            quantityInput: unitMode === 'weight' ? '0.25' : '1'
          }
        ]
    setCart(nextCart)
  }

  const handleUpdateCartItem = (index: number, patch: Partial<CartItem>) => {
    const nextCart = cart.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item))
    setCart(nextCart)
  }

  const handleRemoveCartItem = (index: number) => {
    const nextCart = cart.filter((_, itemIndex) => itemIndex !== index)
    setCart(nextCart)
  }

  const handleAdjustCartQuantity = (index: number, direction: -1 | 1) => {
    setCart(currentCart =>
      currentCart.map((item, itemIndex) => {
        if (itemIndex !== index) return item
        const step = quantityStepByMode[item.unitMode]
        const min = quantityMinByMode[item.unitMode]
        const currentValue = Math.max(parseQuantityInputValue(item), min)
        const nextValue = Math.max(min, currentValue + direction * step)
        return {
          ...item,
          quantityInput: formatQuantityInputValue(nextValue, item.unitMode)
        }
      })
    )
  }

  const handleSubmitSale = async () => {
    if (!cart.length || submittingSale) return
    const items = cart
      .map(item => ({
        inventoryItemId: item.inventoryItemId,
        quantity: item.unitMode === 'weight' ? parseWeightQuantity(item.quantityInput) : parsePieceQuantity(item.quantityInput),
        unitMode: item.unitMode
      }))
      .filter(item => item.quantity > 0)
    if (items.length !== cart.length) {
      setMessage('Corrige las cantidades del carrito antes de cobrar')
      return
    }

    if (paymentMethod === 'cash' && (parsedAmountReceived === null || parsedAmountReceived < total)) {
      setMessage('Monto recibido insuficiente para pago en efectivo')
      return
    }

    setSubmittingSale(true)
    setMessage(null)
    setTicket(null)
    try {
      const payload = {
        items,
        paymentMethod,
        amountReceived: paymentMethod === 'cash' ? parsedAmountReceived || undefined : undefined
      }
      const response = await fetch('/api/pos/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const data = (await response.json()) as SaleResponse
      if (!response.ok || !data.success || !data.sale) {
        throw new Error(resolveSaleErrorMessage(data))
      }
      setTicket(data.sale)
      setIsTicketModalOpen(true)
      setCart([])
      setAmountReceived('')
      await persistDraft({
        cart: [],
        paymentMethod,
        amountReceived: null
      })
      setReloadToken(current => current + 1)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Error al registrar venta')
    } finally {
      setSubmittingSale(false)
    }
  }

  const buildTicketPrintDocument = (closeAfterPrint: boolean) => {
    if (!ticketText) return null

    const escapedTicket = ticketText
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')

    // Do not close during print(): browsers return when the dialog opens, so an
    // immediate window.close() blanks Save as PDF / print preview.
    return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <title>Ticket de venta</title>
    <style>
      @page {
        size: 80mm auto;
        margin: 4mm;
      }

      html, body {
        width: 80mm;
        margin: 0;
        padding: 0;
        background: #fff;
      }

      body {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
        font-size: 11px;
        line-height: 1.35;
        color: #111827;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }

      .ticket {
        box-sizing: border-box;
        width: 80mm;
        max-width: 80mm;
        padding: 2mm;
        margin: 0;
        white-space: pre-wrap;
        word-break: break-word;
        overflow-wrap: anywhere;
      }
    </style>
  </head>
  <body>
    <pre class="ticket">${escapedTicket}</pre>
    <script>
      (function () {
        var printed = false
        var closeWhenDone = ${closeAfterPrint ? 'true' : 'false'}

        var runPrint = function () {
          if (printed) return
          printed = true
          window.focus()
          window.print()
        }

        var cleanup = function () {
          if (!closeWhenDone) return
          try {
            window.close()
          } catch (error) {}
        }

        window.addEventListener('afterprint', cleanup)

        if (document.readyState === 'complete') {
          window.setTimeout(runPrint, 50)
        } else {
          window.addEventListener('load', function () {
            window.setTimeout(runPrint, 50)
          })
        }
      })()
    </script>
  </body>
</html>`
  }

  const handlePrintTicket = () => {
    const popupHtml = buildTicketPrintDocument(true)
    if (!popupHtml) return

    // Avoid noopener/noreferrer: Chrome often returns null and print never runs.
    const popup = window.open('', '_blank', 'width=420,height=900')
    if (popup) {
      popup.document.open()
      popup.document.write(popupHtml)
      popup.document.close()
      return
    }

    const iframeHtml = buildTicketPrintDocument(false)
    if (!iframeHtml) return

    // Popup blocked: print via a same-origin iframe (still ticket-only).
    const iframe = document.createElement('iframe')
    iframe.setAttribute('title', 'Impresión de ticket')
    iframe.setAttribute('aria-hidden', 'true')
    iframe.style.position = 'fixed'
    iframe.style.right = '0'
    iframe.style.bottom = '0'
    iframe.style.width = '80mm'
    iframe.style.height = '100vh'
    iframe.style.opacity = '0'
    iframe.style.pointerEvents = 'none'
    iframe.style.border = '0'
    iframe.style.zIndex = '-1'
    document.body.appendChild(iframe)

    const iframeWindow = iframe.contentWindow
    const iframeDocument = iframe.contentDocument || iframeWindow?.document
    if (!iframeWindow || !iframeDocument) {
      iframe.remove()
      setMessage('No fue posible abrir la ventana de impresión. Habilita popups para continuar.')
      return
    }

    const handleAfterPrint = () => {
      iframeWindow.removeEventListener('afterprint', handleAfterPrint)
      iframe.remove()
    }
    iframeWindow.addEventListener('afterprint', handleAfterPrint)

    iframeDocument.open()
    iframeDocument.write(iframeHtml)
    iframeDocument.close()

    // Safety net if afterprint never fires (some WebView/PDF flows).
    window.setTimeout(() => {
      if (document.body.contains(iframe)) {
        iframe.remove()
      }
    }, 60_000)
  }

  const canCheckout =
    cart.length > 0 &&
    !hasInvalidQuantities &&
    (paymentMethod === 'card' || (parsedAmountReceived !== null && parsedAmountReceived >= total))
  const distinctProductCount = useMemo(() => {
    const productIds = new Set(cart.map(item => item.inventoryItemId))
    return productIds.size
  }, [cart])

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('pos-cart-updated', {
        detail: {
          distinctProductCount
        }
      })
    )
  }, [distinctProductCount])

  const cartDrawerId = 'pos-cart-drawer'
  const shouldOpenCartFromUrl = searchParams.get('openCart') === '1'
  const isCartPanelVisible = isCartPanelOpen || shouldOpenCartFromUrl

  const clearOpenCartParam = () => {
    if (!shouldOpenCartFromUrl) return
    const cleanedSearchParams = new URLSearchParams(searchParams.toString())
    cleanedSearchParams.delete('openCart')
    const cleanedQuery = cleanedSearchParams.toString()
    const nextHref = cleanedQuery ? `${pathname}?${cleanedQuery}` : pathname
    router.replace(nextHref, { scroll: false })
  }

  const handleSetCartPanelOpen = (nextOpen: boolean) => {
    if (!nextOpen) {
      setCartPanelUserOverride(false)
      clearOpenCartParam()
      return
    }
    setCartPanelUserOverride(true)
  }

  useEffect(() => {
    if (!isCartPanelVisible) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setCartPanelUserOverride(false)
        if (shouldOpenCartFromUrl) {
          const cleanedSearchParams = new URLSearchParams(searchParams.toString())
          cleanedSearchParams.delete('openCart')
          const cleanedQuery = cleanedSearchParams.toString()
          const nextHref = cleanedQuery ? `${pathname}?${cleanedQuery}` : pathname
          router.replace(nextHref, { scroll: false })
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isCartPanelVisible, shouldOpenCartFromUrl, pathname, router, searchParams])

  useEffect(() => {
    if (!isTicketModalOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsTicketModalOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isTicketModalOpen])

  // #region agent log
  useEffect(() => {
    fetch('http://127.0.0.1:7470/ingest/f7f242f1-ff2d-40d4-bf0c-d535d5a2bbdb',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'449600'},body:JSON.stringify({sessionId:'449600',runId:'cart-compact',hypothesisId:'H1-H3',location:'pos-client.tsx:cartPanelContent',message:'cart panel render density',data:{layout:'compact-row',cartLines:cart.length,controlHeight:32,itemPadding:8,panelGap:8},timestamp:Date.now()})}).catch(()=>{})
  }, [cart.length])
  // #endregion

  const cartPanelContent = (
    <>
      <div className='space-y-2'>
        {cart.map((item, index) => {
          const minQuantity = quantityMinByMode[item.unitMode]
          const currentQuantity = parseQuantityInputValue(item)
          const canDecreaseQuantity = currentQuantity > minQuantity
          const lineTotal = formatMxnCurrency(item.unitPrice * quantityToDisplay(item))

          return (
            <div key={`${item.inventoryItemId}-${item.unitMode}-${index}`} className='rounded-lg border border-slate-200 p-2'>
              <div className='flex items-start justify-between gap-2'>
                <div className='min-w-0'>
                  <p className='truncate text-sm font-medium leading-tight text-slate-900'>{item.productName}</p>
                  <p className='text-[11px] leading-tight text-slate-500'>{item.sku}</p>
                </div>
                <p className='shrink-0 text-sm font-semibold tabular-nums text-slate-900'>{lineTotal}</p>
              </div>
              <div className='mt-1.5 flex w-full items-center gap-1.5'>
                <select
                  value={item.unitMode}
                  onChange={event => {
                    const selectedMode = event.target.value as 'piece' | 'weight'
                    const allowedMode: CartItem['unitMode'] = item.supportsWeight ? 'weight' : 'piece'
                    const nextMode = item.supportsWeight ? allowedMode : selectedMode
                    handleUpdateCartItem(index, {
                      unitMode: nextMode,
                      quantityInput: nextMode === 'weight' ? '0.25' : '1'
                    })
                  }}
                  aria-label={`Modo de venta para ${item.productName}`}
                  disabled={item.supportsWeight}
                  className='h-8 w-12 shrink-0 rounded-md border border-slate-300 bg-white px-1 text-xs outline-none focus:border-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500'
                >
                  {item.supportsWeight ? (
                    <option value='weight'>kg</option>
                  ) : (
                    <>
                      <option value='piece'>pz</option>
                      <option value='weight'>kg</option>
                    </>
                  )}
                </select>
                <button
                  type='button'
                  onClick={() => handleAdjustCartQuantity(index, -1)}
                  aria-label={`Disminuir cantidad de ${item.productName}`}
                  disabled={!canDecreaseQuantity}
                  className='flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300'
                >
                  -
                </button>
                <input
                  value={item.quantityInput}
                  onChange={event => handleUpdateCartItem(index, { quantityInput: event.target.value })}
                  onBlur={event => {
                    const draftItem = { ...item, quantityInput: event.currentTarget.value }
                    handleUpdateCartItem(index, { quantityInput: normalizeQuantityInput(draftItem) })
                  }}
                  onKeyDown={event => {
                    if (event.key === 'ArrowUp') {
                      event.preventDefault()
                      handleAdjustCartQuantity(index, 1)
                    }
                    if (event.key === 'ArrowDown') {
                      event.preventDefault()
                      handleAdjustCartQuantity(index, -1)
                    }
                  }}
                  inputMode={item.unitMode === 'weight' ? 'decimal' : 'numeric'}
                  pattern={item.unitMode === 'weight' ? '^[0-9]*[\\.,]?[0-9]*$' : '^[0-9]*$'}
                  placeholder={item.unitMode === 'weight' ? '0.75' : '1'}
                  aria-label={`Cantidad de ${item.productName}`}
                  className='h-8 min-w-[4.5rem] flex-1 rounded-md border border-slate-300 bg-white px-2 text-center text-sm font-medium tabular-nums text-slate-900 outline-none focus:border-emerald-500'
                />
                <button
                  type='button'
                  onClick={() => handleAdjustCartQuantity(index, 1)}
                  aria-label={`Aumentar cantidad de ${item.productName}`}
                  className='flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50'
                >
                  +
                </button>
                <button
                  type='button'
                  onClick={() => handleRemoveCartItem(index)}
                  aria-label={`Eliminar del carrito ${item.productName}`}
                  className='flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-rose-300 text-base font-semibold leading-none text-rose-600 hover:bg-rose-50 focus:outline-none focus:ring-2 focus:ring-rose-200'
                >
                  <span aria-hidden='true'>−</span>
                </button>
              </div>
            </div>
          )
        })}
        {!cart.length ? <p className='text-sm text-slate-500'>Sin productos en carrito</p> : null}
      </div>

      <div className='rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-sm leading-5 text-slate-700'>
        <div className='flex justify-between gap-2'><span>Subtotal</span><span className='tabular-nums'>{formatMxnCurrency(subtotal)}</span></div>
        <div className='flex justify-between gap-2'><span>Impuesto</span><span className='tabular-nums'>{formatMxnCurrency(tax)}</span></div>
        <div className='flex justify-between gap-2 font-semibold text-slate-900'><span>Total</span><span className='tabular-nums'>{formatMxnCurrency(total)}</span></div>
      </div>

      <div className='grid gap-1.5'>
        <select
          value={paymentMethod}
          onChange={event => {
            const nextMethod = event.target.value as 'cash' | 'card'
            setPaymentMethod(nextMethod)
            if (nextMethod === 'card') setAmountReceived('')
          }}
          className='h-9 rounded-md border border-slate-300 px-2.5 text-sm'
        >
          <option value='cash'>Efectivo</option>
          <option value='card'>Tarjeta</option>
        </select>
        {paymentMethod === 'cash' ? (
          <>
            <input
              value={amountReceived}
              onChange={event => {
                setAmountReceived(event.target.value)
              }}
              placeholder='Monto recibido'
              className='h-9 rounded-md border border-slate-300 px-2.5 text-sm'
            />
            <p className={`text-sm ${change < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>Cambio: {formatMxnCurrency(change)}</p>
          </>
        ) : null}
      </div>

      <button
        type='button'
        onClick={() => void handleSubmitSale()}
        disabled={!canCheckout || submittingSale}
        aria-label='Cobrar venta'
        className='h-10 w-full rounded-md bg-emerald-600 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50'
      >
        {submittingSale ? 'Procesando venta...' : 'Cobrar y emitir ticket'}
      </button>

      {message ? (
        <p aria-live='polite' className='rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-sm text-rose-700'>
          {message}
        </p>
      ) : null}

      {hasInvalidQuantities ? (
        <p className='rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-sm text-amber-800'>
          Revisa cantidades: no se permiten valores vacíos, cero o negativos.
        </p>
      ) : null}
    </>
  )

  return (
    <main className='mx-auto max-w-7xl px-4 py-8 md:px-8'>
      <section className='rounded-2xl border border-slate-200 bg-white p-6 shadow-sm'>
        <div className='flex flex-wrap items-start justify-between gap-3'>
          <div>
            <p className='text-sm font-semibold uppercase tracking-[0.15em] text-emerald-700'>Punto de venta</p>
            <h1 className='mt-2 text-3xl font-semibold text-slate-950'>Caja activa: {cashierUsername}</h1>
            <p className='mt-2 text-sm text-slate-600'>
              Busca por SKU o nombre, agrega al carrito y confirma la venta con persistencia de borrador en cookie y servidor.
            </p>
          </div>
          <button
            type='button'
            onClick={() => handleSetCartPanelOpen(!isCartPanelVisible)}
            aria-expanded={isCartPanelVisible}
            aria-controls={cartDrawerId}
            aria-label={isCartPanelVisible ? 'Ocultar carrito y cobro' : 'Mostrar carrito y cobro'}
            className='inline-flex h-12 min-w-12 items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 text-sm font-semibold text-emerald-700 hover:bg-emerald-100'
          >
            <span aria-hidden='true' className='text-lg leading-none'>
              🛒
            </span>
            <span>Carrito</span>
            <span className='rounded-full bg-emerald-600 px-2 py-0.5 text-xs text-white'>
              {formatCartBadgeCount(distinctProductCount)}
            </span>
          </button>
        </div>
      </section>

      <section className='mt-6'>
        <div className={`grid gap-6 ${isCartPanelVisible ? 'lg:grid-cols-[minmax(0,1fr)_minmax(20rem,24rem)]' : 'lg:grid-cols-1'}`}>
        <article className='space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm'>
          <div className='grid gap-3 md:grid-cols-4'>
            <input
              value={query}
              onChange={event => {
                setPage(1)
                setQuery(event.target.value)
              }}
              placeholder='Buscar SKU o producto'
              className='h-10 rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 md:col-span-2'
            />
            <select
              value={sortBy}
              onChange={event => setSortBy(event.target.value as 'productName' | 'sku' | 'stock' | 'unitPrice')}
              className='h-10 rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100'
            >
              <option value='productName'>Ordenar: nombre</option>
              <option value='sku'>Ordenar: SKU</option>
              <option value='stock'>Ordenar: stock</option>
              <option value='unitPrice'>Ordenar: precio</option>
            </select>
            <select
              value={sortDirection}
              onChange={event => setSortDirection(event.target.value as 'asc' | 'desc')}
              className='h-10 rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100'
            >
              <option value='asc'>Ascendente</option>
              <option value='desc'>Descendente</option>
            </select>
          </div>

          <div className='overflow-x-auto rounded-xl border border-slate-200'>
            <table className='min-w-full divide-y divide-slate-200'>
              <thead className='bg-slate-50'>
                <tr>
                  <th className='px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500'>SKU</th>
                  <th className='px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500'>Producto</th>
                  <th className='px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500'>Stock</th>
                  <th className='px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500'>Precio</th>
                  <th className='px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500'>Acción</th>
                </tr>
              </thead>
              <tbody className='divide-y divide-slate-100 bg-white'>
                {products.map(product => (
                  <tr key={product.id}>
                    <td className='px-3 py-2 text-sm text-slate-700'>{product.sku}</td>
                    <td className='px-3 py-2 text-sm text-slate-900'>
                      <p className='font-medium'>{product.productName}</p>
                      <p className='text-xs text-slate-500'>{product.category}</p>
                    </td>
                    <td className='px-3 py-2 text-sm text-slate-700'>
                      {product.supportsWeight ? `${(product.stock / 1000).toFixed(3)} kg` : product.stock}
                    </td>
                    <td className='px-3 py-2 text-sm text-slate-700'>{formatMxnCurrency(product.unitPrice)}</td>
                    <td className='px-3 py-2'>
                      <button
                        type='button'
                        onClick={() => handleAddToCart(product)}
                        aria-label={`Agregar ${product.productName}`}
                        className='rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600'
                      >
                        Agregar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className='flex items-center justify-between text-sm text-slate-600'>
            <button
              type='button'
              disabled={page <= 1 || loadingProducts}
              onClick={() => setPage(current => Math.max(1, current - 1))}
              aria-label='Página anterior'
              className='rounded-lg border border-slate-300 px-3 py-1 disabled:cursor-not-allowed disabled:opacity-50'
            >
              Anterior
            </button>
            <p>
              Página {page} de {totalPages}
            </p>
            <button
              type='button'
              disabled={page >= totalPages || loadingProducts}
              onClick={() => setPage(current => Math.min(totalPages, current + 1))}
              aria-label='Página siguiente'
              className='rounded-lg border border-slate-300 px-3 py-1 disabled:cursor-not-allowed disabled:opacity-50'
            >
              Siguiente
            </button>
          </div>
        </article>

        {isCartPanelVisible ? (
          <aside
            className='hidden max-h-[calc(100vh-8rem)] space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 shadow-sm lg:block'
          >
            <h2 className='text-base font-semibold text-slate-900'>Carrito y cobro</h2>
            {cartPanelContent}
          </aside>
        ) : null}
        </div>

        {isCartPanelVisible ? (
          <div className='fixed inset-0 z-40 bg-slate-900/50 lg:hidden' aria-hidden='true' onClick={() => handleSetCartPanelOpen(false)} />
        ) : null}
        <aside
          id={cartDrawerId}
          className={`fixed right-0 top-0 z-50 h-full w-full max-w-sm space-y-2 overflow-y-auto border-l border-slate-200 bg-white p-3 shadow-xl transition-transform duration-200 lg:hidden ${
            isCartPanelVisible ? 'translate-x-0' : 'translate-x-full'
          }`}
          aria-hidden={!isCartPanelVisible}
        >
          <div className='flex items-center justify-between'>
            <h2 className='text-base font-semibold text-slate-900'>Carrito y cobro</h2>
            <button
              type='button'
              onClick={() => handleSetCartPanelOpen(false)}
              aria-label='Cerrar carrito y cobro'
              className='rounded-lg border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50'
            >
              Cerrar
            </button>
          </div>
          {cartPanelContent}
        </aside>
      </section>

      {ticket ? (
        <section className='mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm no-print'>
          <div className='flex flex-wrap items-center justify-between gap-3'>
            <div>
              <h2 className='text-lg font-semibold text-slate-900'>Último ticket generado</h2>
              <p className='mt-1 text-sm text-slate-600'>
                Nro: {ticket.saleNumber} | Total: {formatMxnCurrency(ticket.total)}
              </p>
            </div>
            <button
              type='button'
              onClick={() => setIsTicketModalOpen(true)}
              className='rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50'
            >
              Ver ticket
            </button>
          </div>
        </section>
      ) : null}

      {ticket && isTicketModalOpen ? (
        <>
          <div
            className='fixed inset-0 z-[70] bg-slate-950/70 no-print'
            aria-hidden='true'
            onClick={() => setIsTicketModalOpen(false)}
          />
          <section
            role='dialog'
            aria-modal='true'
            aria-label='Ticket de venta para impresión'
            className='fixed left-1/2 top-1/2 z-[80] w-[min(720px,94vw)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl print:static print:left-auto print:top-auto print:w-auto print:translate-x-0 print:translate-y-0 print:border-0 print:p-0 print:shadow-none'
          >
            <div className='no-print mb-4 flex items-center justify-between gap-3'>
              <div>
                <h2 className='text-lg font-semibold text-slate-900'>Recibo de venta</h2>
                <p className='text-sm text-slate-600'>Vista previa lista para impresión o guardado en PDF.</p>
              </div>
              <div className='flex items-center gap-2'>
                <button
                  type='button'
                  onClick={handlePrintTicket}
                  className='rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700'
                >
                  Mostrar impresión
                </button>
                <button
                  type='button'
                  onClick={() => setIsTicketModalOpen(false)}
                  className='rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50'
                >
                  Cerrar
                </button>
              </div>
            </div>

            <pre className='pos-ticket-print mx-auto w-[80mm] max-w-full overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 p-4 font-mono text-xs leading-5 text-slate-900'>
              {ticketText}
            </pre>
          </section>
        </>
      ) : null}
    </main>
  )
}
