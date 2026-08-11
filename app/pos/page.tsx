import { redirect } from 'next/navigation'

import { WorkspaceShell } from '@/app/components/workspace-shell'
import { PosClient } from '@/app/pos/pos-client'
import { PosOpenShift } from '@/app/pos/pos-open-shift'
import { getCashierRuntimeState } from '@/src/lib/caja/cash-session-service'
import { getAuthenticatedActor } from '@/src/lib/security/api-auth'

export default async function PosPage() {
  const actor = await getAuthenticatedActor({ allowedRoles: ['admin', 'cashier'] })
  if (!actor) redirect('/login')

  const runtime = await getCashierRuntimeState(actor)
  if (actor.role === 'cashier' && runtime.gate === 'must_logout') {
    redirect('/caja')
  }

  return (
    <WorkspaceShell username={actor.username} role={actor.role}>
      {runtime.openSession ? (
        <PosClient cashierUsername={actor.username} role={actor.role} />
      ) : (
        <PosOpenShift
          username={actor.username}
          role={actor.role}
          exclusiveCashierSession={runtime.exclusiveCashierSession}
        />
      )}
    </WorkspaceShell>
  )
}
