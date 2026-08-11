import { formatMxnCurrency } from '@/src/lib/mxn-currency'

export type TicketPrinterWidth = '58mm' | '80mm'

export type TicketItem = {
  sku: string
  productName: string
  quantity: number
  unitMode: 'piece' | 'weight'
  lineTotal: number
}

export type TicketSale = {
  saleNumber: string
  createdAt: string
  cashierUsername: string
  items: TicketItem[]
  subtotal: number
  tax: number
  total: number
  paymentMethod: 'cash' | 'card'
  amountReceived: number | null
  changeDue: number
}

type TicketBuildOptions = {
  storeHeader?: string[]
  footerLines?: string[]
  printerWidth?: TicketPrinterWidth
}

const printerColumns: Record<TicketPrinterWidth, number> = {
  '58mm': 32,
  '80mm': 42
}

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
  return `${value}${' '.repeat(length - value.length)}`
}

const padLeft = (value: string, length: number) => {
  if (value.length >= length) return value.slice(0, length)
  return `${' '.repeat(length - value.length)}${value}`
}

const centered = (value: string, length: number) => {
  if (value.length >= length) return value.slice(0, length)
  const left = Math.floor((length - value.length) / 2)
  const right = length - value.length - left
  return `${' '.repeat(left)}${value}${' '.repeat(right)}`
}

const labelAmountLine = (label: string, amount: number, columns: number) => {
  const amountLabel = formatMoney(amount)
  const leftWidth = Math.max(0, columns - amountLabel.length)
  return `${padRight(label, leftWidth)}${padLeft(amountLabel, amountLabel.length)}`
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
  lines.push(`Venta: ${sale.saleNumber}`)
  lines.push(`Fecha: ${formatTicketDateTime(sale.createdAt)}`)
  lines.push(`Cajero: ${sale.cashierUsername}`)
  lines.push(divider)

  for (const item of sale.items) {
    lines.push(item.productName.slice(0, columns))
    const leftLabel = `${item.sku} ${formatTicketQuantity(item)}`
    const rightLabel = formatMoney(item.lineTotal)
    const leftWidth = Math.max(0, columns - rightLabel.length - 1)
    lines.push(`${padRight(leftLabel, leftWidth)} ${rightLabel}`)
  }

  lines.push(divider)
  lines.push(labelAmountLine('Subtotal', sale.subtotal, columns))
  lines.push(labelAmountLine('Impuesto', sale.tax, columns))
  lines.push(labelAmountLine('Total', sale.total, columns))
  lines.push(labelAmountLine(`Pago (${sale.paymentMethod === 'cash' ? 'Efectivo' : 'Tarjeta'})`, sale.total, columns))
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
