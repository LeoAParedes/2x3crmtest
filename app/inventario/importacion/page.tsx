import { redirect } from 'next/navigation'

import { WorkspaceShell } from '@/app/components/workspace-shell'
import { ImportProductsClient } from '@/app/inventario/importacion/import-products-client'
import { getAuthenticatedActor } from '@/src/lib/security/api-auth'

export default async function ImportacionInventarioPage() {
  const actor = await getAuthenticatedActor({ allowedRoles: ['admin'] })
  if (!actor) {
    redirect('/login')
  }

  return (
    <WorkspaceShell username={actor.username} role={actor.role}>
      <ImportProductsClient />
    </WorkspaceShell>
  )
}
