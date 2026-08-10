import { z } from 'zod'

export const crmRoleSchema = z.enum(['admin', 'cashier'])

export type CrmRole = z.infer<typeof crmRoleSchema>

const rolePermissions: Record<CrmRole, Set<string>> = {
  cashier: new Set(['pos:create', 'pos:view-own', 'inventory:view']),
  admin: new Set(['*'])
}

export const isAllowed = (role: CrmRole, permission: string) => {
  const permissions = rolePermissions[role]
  return permissions.has('*') || permissions.has(permission)
}

export const parseCrmRole = (value: string | null | undefined): CrmRole | null => {
  const parsed = crmRoleSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}
