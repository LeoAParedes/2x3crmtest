import { redirect } from 'next/navigation'

import { PromocionesClient } from '@/app/finanzas/promociones/promociones-client'
import { WorkspaceShell } from '@/app/components/workspace-shell'
import { getAuthenticatedActor } from '@/src/lib/security/api-auth'

export default async function FinanzasPromocionesPage() {
  const actor = await getAuthenticatedActor({ allowedRoles: ['admin'] })
  if (!actor) redirect('/login')

  return (
    <WorkspaceShell username={actor.username} role={actor.role}>
      <PromocionesClient />
    </WorkspaceShell>
  )
}
