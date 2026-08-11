/**
 * Extract human names from nómina Expense.description values.
 * Examples: "Nómina Juan Pérez", "Pago nómina — María", "Sueldo de Ana García".
 */

export type PayrollExpenseLike = {
  description: string
  amount: number
  spentAt: string
}

export type PayrollPersonAggregate = {
  name: string
  totalAmount: number
  paymentCount: number
  lastSpentAt: string
  descriptions: string[]
}

const GENERIC_TAIL =
  /\s+(del\s+)?(periodo|mes|semana|quincena|año|ano)(\s+\d{4})?$/i

const GENERIC_ONLY =
  /^(del\s+)?(periodo|mes|semana|quincena|año|ano|local|tienda|sucursal)$/i

const PAYROLL_LABEL =
  /\b(n[oó]mina|sueldos?|salarios?|pagos?)\b/i

const PREFIX_PATTERNS = [
  /^pagos?\s+(de\s+)?(n[oó]mina|sueldos?|salarios?)(\s+(?:de|del|a|para)\b)?\s*/i,
  /^(n[oó]mina|sueldos?|salarios?)(\s+(?:de|del|a|para)\b)?\s*/i
]

const normalizeKey = (name: string) =>
  name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

/** Pull the person name from a nómina expense description, or null if generic. */
export const extractPayrollPersonName = (description: string): string | null => {
  let text = description.replace(/\s+/g, ' ').trim()
  if (!text) return null

  const sepMatch = text.match(/^(.*?)(?:\s*[—–\-:/]\s+)(.+)$/)
  if (sepMatch && PAYROLL_LABEL.test(sepMatch[1])) {
    text = sepMatch[2].trim()
  }

  for (const pattern of PREFIX_PATTERNS) {
    text = text.replace(pattern, '')
  }

  text = text.replace(/^(de|del|a|para)\s+/i, '').trim()
  text = text.replace(GENERIC_TAIL, '').trim()

  if (!text || GENERIC_ONLY.test(text)) return null
  if (!/[A-Za-zÁÉÍÓÚáéíóúÑñÜü]/.test(text)) return null
  if (text.length < 2) return null
  if (/^(pago|pagos|n[oó]mina|sueldo|sueldos|salario|salarios)$/i.test(text)) return null

  return text
}

/** Deduplicate payroll people by normalized name; sum amounts across payments. */
export const aggregatePayrollPeopleFromExpenses = (
  payments: PayrollExpenseLike[]
): PayrollPersonAggregate[] => {
  const byKey = new Map<string, PayrollPersonAggregate>()

  for (const payment of payments) {
    const name = extractPayrollPersonName(payment.description)
    if (!name) continue

    const key = normalizeKey(name)
    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, {
        name,
        totalAmount: Number(payment.amount.toFixed(2)),
        paymentCount: 1,
        lastSpentAt: payment.spentAt,
        descriptions: [payment.description]
      })
      continue
    }

    existing.totalAmount = Number((existing.totalAmount + payment.amount).toFixed(2))
    existing.paymentCount += 1
    if (payment.spentAt > existing.lastSpentAt) {
      existing.lastSpentAt = payment.spentAt
    }
    existing.descriptions.push(payment.description)
  }

  return Array.from(byKey.values()).sort((a, b) =>
    a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })
  )
}
