import { describe, expect, it } from 'vitest'

import {
  aggregatePayrollPeopleFromExpenses,
  extractPayrollPersonName
} from '@/src/lib/ai/payroll-names'

describe('extractPayrollPersonName', () => {
  it('extracts names from common nómina description patterns', () => {
    expect(extractPayrollPersonName('Nómina Juan Pérez')).toBe('Juan Pérez')
    expect(extractPayrollPersonName('Pago nómina — María')).toBe('María')
    expect(extractPayrollPersonName('Pago de nómina a Carlos López')).toBe('Carlos López')
    expect(extractPayrollPersonName('Sueldo Ana García')).toBe('Ana García')
    expect(extractPayrollPersonName('Salario de Pedro')).toBe('Pedro')
    expect(extractPayrollPersonName('Nómina: Lucía Fernández')).toBe('Lucía Fernández')
  })

  it('returns null for generic descriptions without a person', () => {
    expect(extractPayrollPersonName('Nómina del periodo')).toBeNull()
    expect(extractPayrollPersonName('Nómina')).toBeNull()
    expect(extractPayrollPersonName('Pago nómina')).toBeNull()
    expect(extractPayrollPersonName('')).toBeNull()
  })
})

describe('aggregatePayrollPeopleFromExpenses', () => {
  it('deduplicates the same person across multiple payments', () => {
    const people = aggregatePayrollPeopleFromExpenses([
      {
        description: 'Nómina Juan Pérez',
        amount: 4000,
        spentAt: '2026-08-01T12:00:00.000Z'
      },
      {
        description: 'Pago nómina — Juan Pérez',
        amount: 4000,
        spentAt: '2026-08-15T12:00:00.000Z'
      },
      {
        description: 'Nómina María',
        amount: 3500,
        spentAt: '2026-08-10T12:00:00.000Z'
      },
      {
        description: 'Nómina del periodo',
        amount: 100,
        spentAt: '2026-08-05T12:00:00.000Z'
      }
    ])

    expect(people).toHaveLength(2)
    expect(people.map(person => person.name)).toEqual(['Juan Pérez', 'María'])
    expect(people[0]).toMatchObject({
      name: 'Juan Pérez',
      totalAmount: 8000,
      paymentCount: 2
    })
    expect(people[1]).toMatchObject({
      name: 'María',
      totalAmount: 3500,
      paymentCount: 1
    })
  })
})
