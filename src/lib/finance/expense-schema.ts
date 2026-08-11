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
    spentAt: z.string().datetime({ offset: true }).optional()
  })
  .strict()

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>
