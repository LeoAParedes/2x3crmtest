import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'

import { getAuthenticatedActor } from '@/src/lib/security/api-auth'

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const actor = await getAuthenticatedActor({ allowedRoles: ['admin'] })
  if (!actor) {
    redirect('/login')
  }

  return (
    <>
      <header className='border-b border-slate-200 bg-white'>
        <nav className='mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3 md:px-8'>
          <div className='flex items-center gap-4'>
            <Link href='/admin' className='font-semibold text-slate-950'>
              Administración
            </Link>
            <Link href='/pos' className='text-sm text-slate-600 hover:text-blue-700'>
              POS
            </Link>
            <Link href='/inventario' className='text-sm text-slate-600 hover:text-blue-700'>
              Inventario
            </Link>
          </div>
          <div className='flex items-center gap-3'>
            <span className='text-sm text-slate-600'>{actor.username}</span>
            <form action='/auth/logout' method='post'>
              <button
                type='submit'
                aria-label='Cerrar sesión'
                className='rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50'
              >
                Salir
              </button>
            </form>
          </div>
        </nav>
      </header>
      {children}
    </>
  )
}
