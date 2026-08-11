import { describe, expect, it } from 'vitest'

import { buildInventorySearchWhere, parseNumericSearch } from './search-filter'

describe('parseNumericSearch', () => {
  it('parses plain amounts and strips $', () => {
    expect(parseNumericSearch('$12.50')).toEqual({ operator: 'eq', value: 12.5 })
    expect(parseNumericSearch('1,234.5')).toEqual({ operator: 'eq', value: 1234.5 })
  })

  it('parses comparison operators', () => {
    expect(parseNumericSearch('>10')).toEqual({ operator: 'gt', value: 10 })
    expect(parseNumericSearch('>=5')).toEqual({ operator: 'gte', value: 5 })
    expect(parseNumericSearch('<3')).toEqual({ operator: 'lt', value: 3 })
    expect(parseNumericSearch('<=0')).toEqual({ operator: 'lte', value: 0 })
  })
})

describe('buildInventorySearchWhere', () => {
  it('keeps legacy multi-field search without searchField', () => {
    expect(buildInventorySearchWhere('coca cola')).toEqual({
      AND: [
        {
          OR: [
            { sku: { contains: 'coca', mode: 'insensitive' } },
            { productName: { contains: 'coca', mode: 'insensitive' } },
            { category: { contains: 'coca', mode: 'insensitive' } }
          ]
        },
        {
          OR: [
            { sku: { contains: 'cola', mode: 'insensitive' } },
            { productName: { contains: 'cola', mode: 'insensitive' } },
            { category: { contains: 'cola', mode: 'insensitive' } }
          ]
        }
      ]
    })
  })

  it('scopes text fields to a single column', () => {
    expect(buildInventorySearchWhere('bebidas', 'category')).toEqual({
      category: { contains: 'bebidas', mode: 'insensitive' }
    })
    expect(buildInventorySearchWhere('ABC', 'sku')).toEqual({
      sku: { contains: 'ABC', mode: 'insensitive' }
    })
  })

  it('maps unidad aliases to weight vs piece filters', () => {
    const weightWhere = buildInventorySearchWhere('kg', 'unit')
    expect(weightWhere).toMatchObject({ OR: expect.any(Array) })

    const pieceWhere = buildInventorySearchWhere('pz', 'unit')
    expect(pieceWhere).toMatchObject({ NOT: expect.any(Object) })
  })

  it('builds numeric stock and price filters', () => {
    expect(buildInventorySearchWhere('$9.99', 'unitPrice')).toEqual({ unitPrice: 9.99 })
    expect(buildInventorySearchWhere('>10', 'stock')).toEqual({ stock: { gt: 10 } })
  })
})
