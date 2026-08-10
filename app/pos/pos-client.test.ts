import { describe, expect, it } from 'vitest'

import { getPausedPosMessage } from '@/app/pos/pos-client'

describe('getPausedPosMessage', () => {
  it('identifies the authenticated cashier while POS remains paused', () => {
    expect(getPausedPosMessage('cajero')).toContain('cajero')
  })
})
