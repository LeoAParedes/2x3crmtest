import { redirect } from 'next/navigation'

import { PosClient } from '@/app/pos/pos-client'
import { getAuthenticatedActor } from '@/src/lib/security/api-auth'

export default async function PosPage() {
  const actor = await getAuthenticatedActor({ allowedRoles: ['admin', 'cashier'] })
  if (!actor) redirect('/login')

  return <PosClient cashierUsername={actor.username} />
}
