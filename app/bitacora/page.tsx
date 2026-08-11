import { redirect } from 'next/navigation'

import { BitacoraClient } from '@/app/bitacora/bitacora-client'
import { WorkspaceShell } from '@/app/components/workspace-shell'
import { getAuthenticatedActor } from '@/src/lib/security/api-auth'

export default async function BitacoraPage() {
  const actor = await getAuthenticatedActor({ allowedRoles: ['admin', 'cashier'] })
  if (!actor) {
    redirect('/login')
  }

  return (
    <WorkspaceShell username={actor.username} role={actor.role}>
      <BitacoraClient />
    </WorkspaceShell>
  )
}
