import { describe, expect, it } from 'vitest'

import { calculateCashChange, parseCurrencyInput, parsePieceQuantity, parseWeightQuantity } from '@/app/pos/pos-client'

describe('pos quantity helpers', () => {
  it('converts kg to mill units for weighted products', () => {
    expect(parseWeightQuantity('0.75')).toBe(750)
  })

  it('converts piece count to integer units', () => {
    expect(parsePieceQuantity('3')).toBe(3)
  })

  it('rejects non-positive or malformed quantities', () => {
    expect(parseWeightQuantity('0')).toBe(0)
    expect(parseWeightQuantity('abc')).toBe(0)
    expect(parsePieceQuantity('-1')).toBe(0)
    expect(parsePieceQuantity('x')).toBe(0)
  })

  it('normalizes currency input and calculates cash change', () => {
    expect(parseCurrencyInput('12,5')).toBe(12.5)
    expect(parseCurrencyInput('')).toBeNull()
    expect(calculateCashChange(20, 12.5)).toBe(7.5)
  })
})
