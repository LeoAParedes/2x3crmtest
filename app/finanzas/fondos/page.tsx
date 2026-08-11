import { redirect } from 'next/navigation'

import { FinanzasFondosClient } from '@/app/finanzas/fondos/fondos-client'
import { WorkspaceShell } from '@/app/components/workspace-shell'
import { getAuthenticatedActor } from '@/src/lib/security/api-auth'

export default async function FinanzasFondosPage() {
  const actor = await getAuthenticatedActor({ allowedRoles: ['admin'] })
  if (!actor) redirect('/login')

  return (
    <WorkspaceShell username={actor.username} role={actor.role}>
      <FinanzasFondosClient />
    </WorkspaceShell>
  )
}
