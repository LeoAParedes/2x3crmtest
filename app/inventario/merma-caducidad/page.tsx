import { Suspense } from 'react'
import { redirect } from 'next/navigation'

import { MermaCaducidadClient } from '@/app/inventario/merma-caducidad/merma-caducidad-client'
import { WorkspaceShell } from '@/app/components/workspace-shell'
import { getAuthenticatedActor } from '@/src/lib/security/api-auth'

export default async function MermaCaducidadPage() {
  const actor = await getAuthenticatedActor({ allowedRoles: ['admin', 'cashier'] })
  if (!actor) {
    redirect('/login')
  }

  return (
    <WorkspaceShell username={actor.username} role={actor.role}>
      <Suspense fallback={<p className='px-4 py-8 text-sm text-slate-600'>Cargando merma…</p>}>
        <MermaCaducidadClient />
      </Suspense>
    </WorkspaceShell>
  )
}
