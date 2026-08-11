import { describe, expect, it } from 'vitest'

import {
  formatDeterministicErpReply,
  formatLocalBusinessNow,
  isErpDataQuestion,
  parseBusinessDateMention,
  selectErpToolsForQuestion,
  stampErpDbProvenance
} from '@/src/lib/ai/erp-db-harness'
import { DEFAULT_ALLOWED_ERP_TOOLS } from '@/src/lib/ai/erp-tool-ids'
import { FINANCE_TIME_ZONE } from '@/src/lib/finance/period'

describe('erp-db-harness', () => {
  it('detects ERP data questions', () => {
    expect(isErpDataQuestion('¿Cuánto vendimos hoy?')).toBe(true)
    expect(isErpDataQuestion('stock bajo en inventario')).toBe(true)
    expect(isErpDataQuestion('Ventas hoy')).toBe(true)
    expect(isErpDataQuestion('Cuantas ventas hubo agosto 10?')).toBe(true)
    expect(isErpDataQuestion('¿Cuántas ganancias hubo en el último mes?')).toBe(true)
    expect(isErpDataQuestion('¿Quién está en la nómina?')).toBe(true)
    expect(isErpDataQuestion('¿Cuánto pagué de luz este año?')).toBe(true)
    expect(isErpDataQuestion('hola')).toBe(false)
  })

  it('does not treat clock or social hoy phrasing as ERP metrics', () => {
    expect(isErpDataQuestion('Que dia y hora es hoy')).toBe(false)
    expect(isErpDataQuestion('¿Qué hora es?')).toBe(false)
    expect(isErpDataQuestion('¿Qué día es hoy?')).toBe(false)
    expect(isErpDataQuestion('Nos vemos hoy')).toBe(false)
    expect(isErpDataQuestion('hoy')).toBe(false)
    expect(isErpDataQuestion('esta semana')).toBe(false)
  })

  it('formats local business now for clock answers', () => {
    const label = formatLocalBusinessNow(
      new Date('2026-08-11T12:00:00.000Z'),
      FINANCE_TIME_ZONE
    )
    expect(label.toLowerCase()).toMatch(/agosto/)
    expect(label).toMatch(/2026/)
  })

  it('parses agosto 10 as a local business date', () => {
    const parsed = parseBusinessDateMention(
      'Cuantas ventas hubo agosto 10?',
      new Date('2026-08-11T10:00:00.000Z')
    )
    expect(parsed?.isoDate).toBe('2026-08-10')
  })

  it('selects live sales tools for sales questions', () => {
    const picks = selectErpToolsForQuestion('ventas de la semana', DEFAULT_ALLOWED_ERP_TOOLS)
    expect(picks.map(pick => pick.toolId)).toEqual(expect.arrayContaining(['sales_total_period']))
  })

  it('selects cash_flow_period for ganancias del último mes', () => {
    const picks = selectErpToolsForQuestion(
      '¿Cuántas ganancias hubo en el último mes?',
      DEFAULT_ALLOWED_ERP_TOOLS
    )
    expect(picks[0]?.toolId).toBe('cash_flow_period')
    expect(picks[0]?.args).toMatchObject({ period: 'rolling', rollingDays: 31 })
  })

  it('selects payroll_roster for quién está en la nómina', () => {
    const picks = selectErpToolsForQuestion(
      '¿Quién está en la nómina?',
      DEFAULT_ALLOWED_ERP_TOOLS
    )
    expect(picks.map(pick => pick.toolId)).toContain('payroll_roster')
  })

  it('selects expenses_by_category for luz este año', () => {
    const picks = selectErpToolsForQuestion(
      '¿Cuánto pagué de luz este año?',
      DEFAULT_ALLOWED_ERP_TOOLS
    )
    expect(picks[0]?.toolId).toBe('expenses_by_category')
    expect(picks[0]?.args).toMatchObject({ category: 'luz', period: 'year' })
  })

  it('does not select sales tools for clock questions with hoy', () => {
    const picks = selectErpToolsForQuestion('Que dia y hora es hoy', DEFAULT_ALLOWED_ERP_TOOLS)
    expect(picks).toEqual([])
  })

  it('stamps supabase provenance on facts', () => {
    const stamped = stampErpDbProvenance({ totalSales: 10 })
    expect(stamped.provenance.source).toBe('supabase_postgres')
    expect(stamped.provenance.via).toBe('prisma')
    expect(stamped.totalSales).toBe(10)
  })

  it('formats reply only from tool facts', () => {
    const reply = formatDeterministicErpReply([
      {
        toolId: 'sales_total_today',
        ok: true,
        facts: {
          totalSales: 0,
          ticketCount: 0,
          lastCompletedSale: {
            saleNumber: 'SALE-1',
            total: 180,
            createdAt: '2026-08-11T03:00:00.000Z'
          }
        }
      }
    ])
    expect(reply).toContain('Ventas hoy')
    expect(reply).toContain('SALE-1')
    expect(reply).toContain('Supabase Postgres')
  })

  it('formats expenses_by_category and payroll facts', () => {
    const reply = formatDeterministicErpReply([
      {
        toolId: 'expenses_by_category',
        ok: true,
        facts: {
          categoryLabel: 'Luz',
          periodLabel: 'este año',
          totalPaid: 1200.5,
          expenseCount: 3
        }
      },
      {
        toolId: 'payroll_roster',
        ok: true,
        facts: {
          activeStaffCount: 2,
          activeStaff: [
            { username: 'ana', role: 'cashier' },
            { username: 'admin', role: 'admin' }
          ],
          periodLabel: 'este mes',
          payrollExpenseTotal: 8000,
          payrollExpenseCount: 1
        }
      }
    ])
    expect(reply).toContain('Luz')
    expect(reply).toContain('1200.50')
    expect(reply).toContain('ana')
    expect(reply).toContain('8000.00')
  })
})
