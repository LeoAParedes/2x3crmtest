import { describe, expect, it } from 'vitest'

import { parseLoginUsername, usernameToInternalEmail } from '@/src/lib/security/username'

describe('username helpers', () => {
  it.each([
    ['admin', 'admin@2x3crmtest.local'],
    [' ADMIN ', 'admin@2x3crmtest.local'],
    ['cajero', 'cajero@2x3crmtest.local'],
    ['cajero_01', 'cajero_01@2x3crmtest.local']
  ])('maps %s to internal email', (input, expected) => {
    expect(usernameToInternalEmail(input)).toBe(expected)
  })

  it.each(['root!', 'admin@example.com', '', 'ab', undefined, '1cajero'])(
    'rejects disallowed username %s',
    input => {
      expect(() => parseLoginUsername(input)).toThrow('Usuario inválido')
    }
  )
})
