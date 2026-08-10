'use client'

export const getPausedPosMessage = (cashierUsername: string) =>
  `Sesión activa para ${cashierUsername}. El POS permanece pausado durante la validación inicial de autenticación.`

type PosClientProps = {
  cashierUsername: string
}

export const PosClient = ({ cashierUsername }: PosClientProps) => {
  return (
    <main className='mx-auto flex min-h-screen w-full max-w-3xl items-center px-4 py-10'>
      <section className='w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8'>
        <p className='text-sm font-semibold uppercase tracking-wide text-blue-700'>2x3crmtest ERP</p>
        <h1 className='mt-2 text-3xl font-semibold text-slate-950'>Sesión de caja</h1>
        <p className='mt-3 text-sm text-slate-600' aria-live='polite'>
          {getPausedPosMessage(cashierUsername)}
        </p>
      </section>
    </main>
  )
}
