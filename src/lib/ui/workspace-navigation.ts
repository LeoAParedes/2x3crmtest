import type { CrmRole } from '@/src/lib/security/rbac'

export type WorkspaceNavigationItem = {
  href: '/admin' | '/pos' | '/crm'
  label: string
}

const navigationByRole: Record<CrmRole, WorkspaceNavigationItem[]> = {
  admin: [
    { href: '/admin', label: 'Panel' },
    { href: '/pos', label: 'Punto de venta' },
    { href: '/crm', label: 'Conversaciones' }
  ],
  cashier: [{ href: '/pos', label: 'Punto de venta' }]
}

export const getWorkspaceNavigation = (role: CrmRole): WorkspaceNavigationItem[] => navigationByRole[role]
