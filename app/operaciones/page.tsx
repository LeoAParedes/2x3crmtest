import { redirect } from 'next/navigation'

import { OperationsClient } from '@/app/operaciones/operations-client'
import { WorkspaceShell } from '@/app/components/workspace-shell'
import { getAuthenticatedActor } from '@/src/lib/security/api-auth'

export default async function OperacionesPage() {
  const actor = await getAuthenticatedActor({ allowedRoles: ['admin', 'cashier'] })
  if (!actor) {
    redirect('/login')
  }

  return (
    <WorkspaceShell username={actor.username} role={actor.role}>
      <OperationsClient role={actor.role} />
    </WorkspaceShell>
  )
}
