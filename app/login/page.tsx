import { LoginForm } from '@/app/login/login-form'
import Link from 'next/link'

export default function LoginPage() {
  return (
    <main className='flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10'>
      <section className='w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl md:p-8'>
        <Link href='/' className='text-xs font-medium text-slate-400 transition hover:text-emerald-300'>
          Volver al portal
        </Link>
        <p className='mt-4 text-sm font-semibold uppercase tracking-[0.2em] text-emerald-300'>2x3 operaciones</p>
        <h1 className='mt-2 text-3xl font-semibold text-white'>Acceso seguro</h1>
        <p className='mb-6 mt-2 text-sm text-slate-300'>Ingresa con tu cuenta de administración o caja para continuar.</p>
        <LoginForm />
      </section>
    </main>
  )
}
