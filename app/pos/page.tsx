import { redirect } from 'next/navigation'

import { WorkspaceShell } from '@/app/components/workspace-shell'
import { PosClient } from '@/app/pos/pos-client'
import { getCashierRuntimeState } from '@/src/lib/caja/cash-session-service'
import { getAuthenticatedActor } from '@/src/lib/security/api-auth'

export default async function PosPage() {
  const actor = await getAuthenticatedActor({ allowedRoles: ['admin', 'cashier'] })
  if (!actor) redirect('/login')

  const runtime = await getCashierRuntimeState(actor)
  if (actor.role === 'cashier' && runtime.gate === 'must_logout') {
    redirect('/caja')
  }
  if (!runtime.openSession) {
    redirect('/caja')
  }

  return (
    <WorkspaceShell username={actor.username} role={actor.role}>
      <PosClient cashierUsername={actor.username} />
    </WorkspaceShell>
  )
}
