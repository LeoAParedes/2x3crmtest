import { redirect } from 'next/navigation'

import { PasivoClient } from '@/app/finanzas/pasivo/pasivo-client'
import { WorkspaceShell } from '@/app/components/workspace-shell'
import { getAuthenticatedActor } from '@/src/lib/security/api-auth'

export default async function FinanzasPasivoPage() {
  const actor = await getAuthenticatedActor({ allowedRoles: ['admin'] })
  if (!actor) redirect('/login')

  return (
    <WorkspaceShell username={actor.username} role={actor.role}>
      <PasivoClient />
    </WorkspaceShell>
  )
}
