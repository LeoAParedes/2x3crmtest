import { describe, expect, it } from 'vitest'

import { createPromotionSchema, updatePromotionSchema } from '@/src/lib/finance/promotions-schema'

describe('createPromotionSchema description', () => {
  const base = {
    name: '2x1 Refrescos',
    type: 'porcentaje' as const,
    value: 10
  }

  it('accepts omitted description and defaults it to the promo name', () => {
    const parsed = createPromotionSchema.parse(base)
    expect(parsed.description).toBe('2x1 Refrescos')
  })

  it('accepts empty or whitespace description and defaults to the promo name', () => {
    expect(createPromotionSchema.parse({ ...base, description: '' }).description).toBe('2x1 Refrescos')
    expect(createPromotionSchema.parse({ ...base, description: '   ' }).description).toBe('2x1 Refrescos')
  })

  it('accepts null description and defaults to the promo name', () => {
    const parsed = createPromotionSchema.parse({ ...base, description: null })
    expect(parsed.description).toBe('2x1 Refrescos')
  })

  it('keeps an explicit non-empty description', () => {
    const parsed = createPromotionSchema.parse({
      ...base,
      description: 'Descuento de fin de semana'
    })
    expect(parsed.description).toBe('Descuento de fin de semana')
  })

  it('does not require description.min(2)', () => {
    expect(() => createPromotionSchema.parse({ ...base, description: 'a' })).not.toThrow()
    expect(createPromotionSchema.parse({ ...base, description: 'a' }).description).toBe('a')
  })
})

describe('updatePromotionSchema description', () => {
  it('allows empty description without min length', () => {
    const parsed = updatePromotionSchema.parse({ description: '' })
    expect(parsed.description).toBe('')
  })

  it('allows omitting description', () => {
    const parsed = updatePromotionSchema.parse({ active: false })
    expect(parsed.description).toBeUndefined()
  })

  it('allows null description as empty string', () => {
    const parsed = updatePromotionSchema.parse({ description: null })
    expect(parsed.description).toBe('')
  })
})
