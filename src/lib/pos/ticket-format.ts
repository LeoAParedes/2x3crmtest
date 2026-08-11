import { formatMxnCurrency } from '@/src/lib/mxn-currency'

export type TicketPrinterWidth = '58mm' | '80mm'

export type TicketItem = {
  sku: string
  productName: string
  quantity: number
  unitMode: 'piece' | 'weight'
  lineTotal: number
  lineTax?: number
}

export type TicketSale = {
  saleNumber: string
  createdAt: string
  cashierUsername: string
  items: TicketItem[]
  subtotal: number
  tax: number
  discountTotal?: number
  total: number
  showIvaOnReceipt?: boolean
  paymentMethod: 'cash' | 'card' | 'credit'
  amountReceived: number | null
  changeDue: number
}

type TicketBuildOptions = {
  storeHeader?: string[]
  footerLines?: string[]
  printerWidth?: TicketPrinterWidth
}

/** Fixed column counts for monospace thermal layout (must match print CSS `Nch`). */
export const printerColumns: Record<TicketPrinterWidth, number> = {
  '58mm': 32,
  '80mm': 42
}

/** Non-breaking space — keeps label/value padding from wrapping under `pre-wrap`. */
const PAD = '\u00A0'

export const formatMoney = (value: number) => formatMxnCurrency(value)

export const formatTicketDateTime = (isoDate: string) =>
  new Intl.DateTimeFormat('es-PE', {
    dateStyle: 'short',
    timeStyle: 'short',
    hour12: false
  }).format(new Date(isoDate))

export const formatTicketQuantity = (item: Pick<TicketItem, 'quantity' | 'unitMode'>) => {
  if (item.unitMode === 'weight') {
    return `${(item.quantity / 1000).toFixed(3)}kg`
  }
  return `${item.quantity}pz`
}

const padRight = (value: string, length: number) => {
  if (value.length >= length) return value.slice(0, length)
  return `${value}${PAD.repeat(length - value.length)}`
}

const centered = (value: string, length: number) => {
  if (value.length >= length) return value.slice(0, length)
  const left = Math.floor((length - value.length) / 2)
  const right = length - value.length - left
  return `${PAD.repeat(left)}${value}${PAD.repeat(right)}`
}

/** Label left, amount right on one line (padded to exact column width). */
export const labelAmountLine = (label: string, amount: number, columns: number) => {
  const amountLabel = formatMoney(amount)
  if (amountLabel.length >= columns) return amountLabel.slice(0, columns)

  const maxLabelWidth = columns - amountLabel.length
  const safeLabel = label.length > maxLabelWidth ? label.slice(0, maxLabelWidth) : label
  const gap = columns - safeLabel.length - amountLabel.length
  return `${safeLabel}${PAD.repeat(gap)}${amountLabel}`
}

export const buildSaleTicketText = (sale: TicketSale, options: TicketBuildOptions = {}) => {
  const printerWidth = options.printerWidth || '80mm'
  const columns = printerColumns[printerWidth]
  const divider = '-'.repeat(columns)
  const header = options.storeHeader || ['2x3 CRM Store', 'POS - Ticket de venta']
  const footer = options.footerLines || ['Gracias por su compra']

  const lines: string[] = []

  for (const headerLine of header) {
    lines.push(centered(headerLine, columns))
  }
  lines.push(divider)
  lines.push(`Venta: ${sale.saleNumber}`.slice(0, columns))
  lines.push(`Fecha: ${formatTicketDateTime(sale.createdAt)}`.slice(0, columns))
  lines.push(`Cajero: ${sale.cashierUsername}`.slice(0, columns))
  lines.push(divider)

  for (const item of sale.items) {
    lines.push(item.productName.slice(0, columns))
    const leftLabel = `${item.sku} ${formatTicketQuantity(item)}`
    const rightLabel = formatMoney(item.lineTotal)
    const leftWidth = Math.max(0, columns - rightLabel.length - 1)
    lines.push(`${padRight(leftLabel, leftWidth)}${PAD}${rightLabel}`)
    if (sale.showIvaOnReceipt && (item.lineTax ?? 0) > 0) {
      const ivaLabel = `  IVA`
      const ivaAmount = formatMoney(item.lineTax ?? 0)
      const ivaLeftWidth = Math.max(0, columns - ivaAmount.length - 1)
      lines.push(`${padRight(ivaLabel, ivaLeftWidth)}${PAD}${ivaAmount}`)
    }
  }

  lines.push(divider)
  lines.push(labelAmountLine('Subtotal', sale.subtotal, columns))
  if ((sale.discountTotal || 0) > 0) {
    lines.push(labelAmountLine('Descuento', sale.discountTotal || 0, columns))
  }
  if (sale.showIvaOnReceipt && sale.tax > 0) {
    lines.push(labelAmountLine('IVA', sale.tax, columns))
  } else {
    lines.push(labelAmountLine('Impuesto', sale.tax, columns))
  }
  lines.push(labelAmountLine('Total', sale.total, columns))
  const paymentLabel =
    sale.paymentMethod === 'cash' ? 'Efectivo' : sale.paymentMethod === 'credit' ? 'Crédito' : 'Tarjeta'
  lines.push(labelAmountLine(`Pago (${paymentLabel})`, sale.total, columns))
  if (sale.paymentMethod === 'cash') {
    lines.push(labelAmountLine('Recibido', sale.amountReceived || 0, columns))
    lines.push(labelAmountLine('Cambio', sale.changeDue, columns))
  }
  lines.push(divider)
  for (const footerLine of footer) {
    lines.push(centered(footerLine, columns))
  }

  return lines.join('\n')
}
