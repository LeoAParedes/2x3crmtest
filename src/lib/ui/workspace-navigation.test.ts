import { describe, expect, it } from 'vitest'

import { getWorkspaceNavigation } from '@/src/lib/ui/workspace-navigation'

describe('getWorkspaceNavigation', () => {
  it('gives administrators their operational destinations', () => {
    expect(getWorkspaceNavigation('admin')).toEqual([
      { href: '/admin', label: 'Panel' },
      { href: '/pos', label: 'Punto de venta' },
      { href: '/crm', label: 'Conversaciones' }
    ])
  })

  it('does not expose administration or conversation logs to cashiers', () => {
    expect(getWorkspaceNavigation('cashier')).toEqual([{ href: '/pos', label: 'Punto de venta' }])
  })
})
