import { Suspense } from 'react'
import { redirect } from 'next/navigation'

import { ConfiguracionClient } from '@/app/configuracion/configuracion-client'
import { WorkspaceShell } from '@/app/components/workspace-shell'
import { getAuthenticatedActor } from '@/src/lib/security/api-auth'

export default async function ConfiguracionPage() {
  const actor = await getAuthenticatedActor({ allowedRoles: ['admin'] })
  if (!actor) {
    redirect('/login')
  }

  return (
    <WorkspaceShell username={actor.username} role={actor.role}>
      <Suspense fallback={<main className='px-4 py-8 text-sm text-slate-600'>Cargando configuración…</main>}>
        <ConfiguracionClient />
      </Suspense>
    </WorkspaceShell>
  )
}
