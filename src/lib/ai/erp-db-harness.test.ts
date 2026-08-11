import { describe, expect, it } from 'vitest'

import {
  formatDeterministicErpReply,
  isErpDataQuestion,
  parseBusinessDateMention,
  selectErpToolsForQuestion,
  stampErpDbProvenance
} from '@/src/lib/ai/erp-db-harness'
import { DEFAULT_ALLOWED_ERP_TOOLS } from '@/src/lib/ai/erp-tool-ids'

describe('erp-db-harness', () => {
  it('detects ERP data questions', () => {
    expect(isErpDataQuestion('¿Cuánto vendimos hoy?')).toBe(true)
    expect(isErpDataQuestion('stock bajo en inventario')).toBe(true)
    expect(isErpDataQuestion('hola')).toBe(false)
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
})
