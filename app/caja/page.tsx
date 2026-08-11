import { redirect } from 'next/navigation'

import { CajaClient } from '@/app/caja/caja-client'
import { WorkspaceShell } from '@/app/components/workspace-shell'
import { getAuthenticatedActor } from '@/src/lib/security/api-auth'

export default async function CajaPage() {
  const actor = await getAuthenticatedActor({ allowedRoles: ['admin', 'cashier'] })
  if (!actor) redirect('/login')

  return (
    <WorkspaceShell username={actor.username} role={actor.role}>
      <CajaClient role={actor.role} username={actor.username} />
    </WorkspaceShell>
  )
}
