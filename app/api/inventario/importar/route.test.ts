import { describe, expect, it } from 'vitest'

import { buildImportValidationPreview, parseCsvRows } from '@/app/api/inventario/importar/route'

describe('inventory import CSV parser', () => {
  it('accepts spanish headers and maps fields correctly', () => {
    const csv = `sku,producto,categoria,unidad,precio,stock
FRV-001,Tomate saladet,Frutas y Verduras,kg,28.50,120`

    const { parsedRows, errors } = parseCsvRows(csv)

    expect(errors).toEqual([])
    expect(parsedRows).toEqual([
      {
        sku: 'FRV-001',
        productName: 'Tomate saladet',
        category: 'Frutas y Verduras',
        stock: 120,
        unitPrice: 28.5,
        aisle: 'Granel (kg)'
      }
    ])
  })

  it('supports old header format as fallback', () => {
    const csv = `sku,productName,category,stock,unitPrice,aisle
LEC-001,Leche Entera 1L,Lacteos,120,4.50,A1`

    const { parsedRows, errors } = parseCsvRows(csv)

    expect(errors).toEqual([])
    expect(parsedRows[0]).toMatchObject({
      sku: 'LEC-001',
      productName: 'Leche Entera 1L',
      category: 'Lacteos',
      stock: 120,
      unitPrice: 4.5,
      aisle: 'A1'
    })
  })

  it('throws missing header error mentioning expected spanish headers', () => {
    const csv = `sku,productName,stock
LEC-001,Leche Entera 1L,120`

    expect(() => parseCsvRows(csv)).toThrowError(
      'CSV_HEADERS_MISSING:sku,producto,categoria,unidad,precio,stock'
    )
  })

  it('throws CSV_EMPTY when there are no data rows', () => {
    const csv = 'sku,producto,categoria,unidad,precio,stock'

    expect(() => parseCsvRows(csv)).toThrowError('CSV_EMPTY')
  })

  it('reports invalid numeric values clearly', () => {
    const csv = `sku,producto,categoria,unidad,precio,stock
FRV-001,Tomate,Frutas y Verduras,kg,abc,120`

    const { parsedRows, errors } = parseCsvRows(csv)

    expect(parsedRows).toEqual([])
    expect(errors).toEqual([{ line: 2, reason: 'Stock o precio inválido (debe ser numérico y >= 0)' }])
  })

  it('builds preview and allows import when valid rows exist', () => {
    const csv = `sku,producto,categoria,unidad,precio,stock
FRV-001,Tomate,Frutas y Verduras,kg,28.50,120
FRV-002,Cebolla,Frutas y Verduras,kg,abc,140`

    const result = buildImportValidationPreview(csv)

    expect(result.canImport).toBe(true)
    expect(result.preview.totalValidRows).toBe(1)
    expect(result.preview.rows).toHaveLength(1)
    expect(result.errors).toEqual([{ line: 3, reason: 'Stock o precio inválido (debe ser numérico y >= 0)' }])
    expect(result.message).toBeNull()
  })

  it('blocks import when all rows are invalid', () => {
    const csv = `sku,producto,categoria,unidad,precio,stock
FRV-001,Tomate,Frutas y Verduras,,28.50,120`

    const result = buildImportValidationPreview(csv)

    expect(result.canImport).toBe(false)
    expect(result.preview.totalValidRows).toBe(0)
    expect(result.message).toContain('No hay filas válidas para importar')
    expect(result.errors).toEqual([{ line: 2, reason: 'Campos obligatorios vacíos' }])
  })
})
