import { describe, expect, it } from 'vitest'

import { usernameToInternalEmail } from '@/src/lib/security/username'

describe('usernameToInternalEmail', () => {
  it.each([
    ['admin', 'admin@2x3crmtest.local'],
    [' ADMIN ', 'admin@2x3crmtest.local'],
    ['cajero', 'cajero@2x3crmtest.local']
  ])('maps %s to its internal identity', (input, expected) => {
    expect(usernameToInternalEmail(input)).toBe(expected)
  })

  it.each(['root', 'admin@example.com', '', undefined])('rejects disallowed username %s', input => {
    expect(() => usernameToInternalEmail(input)).toThrow('Usuario inválido')
  })
})
