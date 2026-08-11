import { redirect } from 'next/navigation'

import { ComprasClient } from '@/app/finanzas/compras/compras-client'
import { WorkspaceShell } from '@/app/components/workspace-shell'
import { getAuthenticatedActor } from '@/src/lib/security/api-auth'

export default async function FinanzasComprasPage() {
  const actor = await getAuthenticatedActor({ allowedRoles: ['admin'] })
  if (!actor) redirect('/login')

  return (
    <WorkspaceShell username={actor.username} role={actor.role}>
      <ComprasClient />
    </WorkspaceShell>
  )
}
