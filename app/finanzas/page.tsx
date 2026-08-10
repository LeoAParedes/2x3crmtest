import { redirect } from 'next/navigation'

import { FinanceClient } from '@/app/finanzas/finance-client'
import { WorkspaceShell } from '@/app/components/workspace-shell'
import { getAuthenticatedActor } from '@/src/lib/security/api-auth'

export default async function FinanzasPage() {
  const actor = await getAuthenticatedActor({ allowedRoles: ['admin'] })
  if (!actor) {
    redirect('/login')
  }

  return (
    <WorkspaceShell username={actor.username} role={actor.role}>
      <FinanceClient />
    </WorkspaceShell>
  )
}
