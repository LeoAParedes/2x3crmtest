import { redirect } from 'next/navigation'

import { InventoryClient } from '@/app/inventario/inventory-client'
import { WorkspaceShell } from '@/app/components/workspace-shell'
import { getAuthenticatedActor } from '@/src/lib/security/api-auth'

export default async function InventarioPage() {
  const actor = await getAuthenticatedActor({ allowedRoles: ['admin', 'cashier'] })
  if (!actor) {
    redirect('/login')
  }

  return (
    <WorkspaceShell username={actor.username} role={actor.role}>
      <InventoryClient role={actor.role} />
    </WorkspaceShell>
  )
}
