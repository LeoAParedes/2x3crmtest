import { redirect } from 'next/navigation'

import { WorkspaceShell } from '@/app/components/workspace-shell'
import { getAuthenticatedActor } from '@/src/lib/security/api-auth'

/** Avoid duplicating the admin hub: operaciones redirects to Dashboard. */
export default async function OperacionesPage() {
  const actor = await getAuthenticatedActor({ allowedRoles: ['admin', 'cashier'] })
  if (!actor) {
    redirect('/login')
  }

  if (actor.role === 'admin') {
    redirect('/admin')
  }

  return (
    <WorkspaceShell username={actor.username} role={actor.role}>
      <main className='mx-auto max-w-3xl px-4 py-10'>
        <h1 className='text-2xl font-semibold text-slate-950'>Operaciones</h1>
        <p className='mt-2 text-sm text-slate-600'>
          Usa POS, Inventarios, Bitácora y Turno / Corte desde el menú. El hub administrativo vive en Dashboard.
        </p>
      </main>
    </WorkspaceShell>
  )
}
