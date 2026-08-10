import { LoginForm } from '@/app/login/login-form'

export default function LoginPage() {
  return (
    <main className='flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10'>
      <section className='w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8'>
        <p className='text-sm font-semibold uppercase tracking-wide text-blue-700'>2x3crmtest ERP</p>
        <h1 className='mt-2 text-3xl font-semibold text-slate-950'>Acceso seguro</h1>
        <p className='mb-6 mt-2 text-sm text-slate-600'>
          Ingresa con la cuenta administrativa o de caja asignada.
        </p>
        <LoginForm />
      </section>
    </main>
  )
}
