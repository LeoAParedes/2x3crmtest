import { redirect } from 'next/navigation'

import { FinancePeriodosClient } from '@/app/finanzas/finance-periodos-client'
import { WorkspaceShell } from '@/app/components/workspace-shell'
import { getAuthenticatedActor } from '@/src/lib/security/api-auth'

export default async function FinanzasPeriodosPage() {
  const actor = await getAuthenticatedActor({ allowedRoles: ['admin'] })
  if (!actor) redirect('/login')

  return (
    <WorkspaceShell username={actor.username} role={actor.role}>
      <FinancePeriodosClient />
    </WorkspaceShell>
  )
}
