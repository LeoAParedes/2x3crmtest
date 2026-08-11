import { z } from 'zod'

export const EXPENSE_CATEGORIES = [
  'renta',
  'luz',
  'agua',
  'gas',
  'proveedores',
  'nomina',
  'mantenimiento',
  'transporte',
  'otros'
] as const

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]

export const expenseCategoryLabels: Record<ExpenseCategory, string> = {
  renta: 'Renta',
  luz: 'Luz',
  agua: 'Agua',
  gas: 'Gas',
  proveedores: 'Proveedores',
  nomina: 'Nómina',
  mantenimiento: 'Mantenimiento',
  transporte: 'Transporte',
  otros: 'Otros'
}

export const createExpenseSchema = z
  .object({
    category: z.enum(EXPENSE_CATEGORIES),
    description: z.string().trim().min(2).max(240),
    amount: z.number().positive().max(1_000_000),
    kind: z.enum(['fixed', 'operating']).default('operating'),
    spentAt: z.string().datetime({ offset: true }).optional()
  })
  .strict()

export const EXPENSE_TEMPLATES: Array<{
  category: ExpenseCategory
  kind: 'fixed' | 'operating'
  description: string
}> = [
  { category: 'renta', kind: 'fixed', description: 'Renta del local' },
  { category: 'luz', kind: 'fixed', description: 'Servicio de luz' },
  { category: 'agua', kind: 'fixed', description: 'Servicio de agua' },
  { category: 'gas', kind: 'operating', description: 'Gas / combustible' },
  { category: 'proveedores', kind: 'operating', description: 'Compra a proveedores' },
  { category: 'nomina', kind: 'fixed', description: 'Nómina del periodo' },
  { category: 'mantenimiento', kind: 'operating', description: 'Mantenimiento' },
  { category: 'transporte', kind: 'operating', description: 'Transporte / logística' }
]

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>
