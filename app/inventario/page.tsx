import { Suspense } from 'react'
import { redirect } from 'next/navigation'

import { InventoryClient } from '@/app/inventario/inventory-client'
import { WorkspaceShell } from '@/app/components/workspace-shell'
import { getAuthenticatedActor } from '@/src/lib/security/api-auth'

type InventarioPageProps = {
  searchParams: Promise<{ shortcut?: string | string[] }>
}

export default async function InventarioPage({ searchParams }: InventarioPageProps) {
  const params = await searchParams
  const shortcut = Array.isArray(params.shortcut) ? params.shortcut[0] : params.shortcut
  if (shortcut === 'bitacora' || shortcut === 'movimientos') {
    redirect('/bitacora')
  }

  const actor = await getAuthenticatedActor({ allowedRoles: ['admin', 'cashier'] })
  if (!actor) {
    redirect('/login')
  }

  if (shortcut === 'ajuste' && actor.role !== 'admin') {
    redirect('/inventario')
  }

  return (
    <WorkspaceShell username={actor.username} role={actor.role}>
      <Suspense fallback={<main className='px-4 py-8 text-sm text-slate-600'>Cargando inventario…</main>}>
        <InventoryClient role={actor.role} />
      </Suspense>
    </WorkspaceShell>
  )
}
