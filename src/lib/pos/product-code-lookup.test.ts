import { describe, expect, it } from 'vitest'

import {
  buildPosProductCodeSearchParams,
  formatProductCodeLookupMessage,
  normalizeProductCodeQuery,
  pickBestProductCodeMatch,
  type PosLookupProduct
} from './product-code-lookup'

const product = (overrides: Partial<PosLookupProduct> & Pick<PosLookupProduct, 'id' | 'sku' | 'productName'>): PosLookupProduct => ({
  category: 'gral',
  stock: 10,
  unitPrice: 12,
  aisle: null,
  supportsWeight: false,
  ...overrides
})

describe('normalizeProductCodeQuery', () => {
  it('strips scanner CR/LF/tabs and trims', () => {
    expect(normalizeProductCodeQuery('  ABC123\r\n')).toBe('ABC123')
    expect(normalizeProductCodeQuery('SKU\t001')).toBe('SKU001')
  })
})

describe('pickBestProductCodeMatch', () => {
  const catalog = [
    product({ id: '1', sku: 'TOM-001', productName: 'Tomate saladette' }),
    product({ id: '2', sku: 'TOM-002', productName: 'Tomate bola' }),
    product({ id: '3', sku: 'COCA-600', productName: 'Coca Cola 600ml' }),
    product({ id: '4', sku: 'PAN', productName: 'Pan blanco', supportsWeight: true })
  ]

  it('returns not_found for empty code or empty catalog', () => {
    expect(pickBestProductCodeMatch('', catalog).status).toBe('not_found')
    expect(pickBestProductCodeMatch('TOM-001', []).status).toBe('not_found')
  })

  it('prefers exact SKU over partials', () => {
    const match = pickBestProductCodeMatch('tom-001', catalog)
    expect(match).toEqual({ status: 'found', product: catalog[0] })
  })

  it('accepts exact product name', () => {
    const match = pickBestProductCodeMatch('Coca Cola 600ml', catalog)
    expect(match).toEqual({ status: 'found', product: catalog[2] })
  })

  it('auto-adds a single SKU prefix match', () => {
    const match = pickBestProductCodeMatch('COCA', catalog)
    expect(match).toEqual({ status: 'found', product: catalog[2] })
  })

  it('does not auto-pick first row among ambiguous SKU prefixes', () => {
    const match = pickBestProductCodeMatch('TOM', catalog)
    expect(match.status).toBe('ambiguous')
    if (match.status === 'ambiguous') {
      expect(match.count).toBe(2)
      expect(match.samples.map(item => item.sku)).toEqual(['TOM-001', 'TOM-002'])
    }
  })

  it('accepts a unique catalog hit even without exact SKU', () => {
    const match = pickBestProductCodeMatch('blanco', [
      product({ id: '4', sku: 'PAN', productName: 'Pan blanco' })
    ])
    expect(match).toEqual({
      status: 'found',
      product: product({ id: '4', sku: 'PAN', productName: 'Pan blanco' })
    })
  })
})

describe('buildPosProductCodeSearchParams', () => {
  it('mirrors traditional POS multi-field search (no searchField)', () => {
    const params = buildPosProductCodeSearchParams(' ABC\r ')
    expect(params.get('q')).toBe('ABC')
    expect(params.get('searchField')).toBeNull()
    expect(params.get('sortBy')).toBe('sku')
    expect(params.get('pageSize')).toBe('40')
  })
})

describe('formatProductCodeLookupMessage', () => {
  it('explains not found and ambiguous cases', () => {
    expect(
      formatProductCodeLookupMessage('XYZ', { status: 'not_found' })
    ).toBe('Sin producto para el código XYZ')

    expect(
      formatProductCodeLookupMessage('TOM', {
        status: 'ambiguous',
        count: 2,
        samples: [
          product({ id: '1', sku: 'TOM-001', productName: 'Tomate saladette' }),
          product({ id: '2', sku: 'TOM-002', productName: 'Tomate bola' })
        ]
      })
    ).toContain('Varios productos coinciden')
  })
})
