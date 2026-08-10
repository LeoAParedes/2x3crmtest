import Link from 'next/link'

const capabilities = [
  {
    title: 'Caja en movimiento',
    description: 'Cobros ágiles con la operación siempre a la vista.',
    accent: 'bg-emerald-400'
  },
  {
    title: 'Inventario atento',
    description: 'Decisiones informadas antes de que falte un producto.',
    accent: 'bg-amber-300'
  },
  {
    title: 'Finanzas claras',
    description: 'Una lectura simple de la salud diaria del negocio.',
    accent: 'bg-sky-300'
  },
  {
    title: 'Asistente presente',
    description: 'Respuestas operativas sin abandonar tu tarea.',
    accent: 'bg-violet-300'
  }
] as const

export default function HomePage() {
  return (
    <main className='overflow-hidden bg-slate-950 text-white'>
      <section className='mx-auto grid min-h-screen max-w-7xl gap-12 px-6 py-8 lg:grid-cols-[1.1fr_0.9fr] lg:px-10'>
        <div className='flex flex-col justify-center'>
          <p className='text-sm font-semibold uppercase tracking-[0.2em] text-emerald-300'>2x3 operaciones</p>
          <h1 className='mt-6 max-w-3xl text-5xl font-semibold tracking-tight sm:text-6xl'>
            El pulso de tu supermercado, en un solo lugar.
          </h1>
          <p className='mt-6 max-w-xl text-lg leading-8 text-slate-300'>
            Opera la caja, anticipa el inventario y conversa con tu sistema sin perder el contexto.
          </p>
          <Link
            href='/login'
            className='mt-10 w-fit rounded-full bg-emerald-400 px-6 py-3 font-semibold text-slate-950 transition hover:bg-emerald-300'
          >
            Entrar al sistema
          </Link>
        </div>
        <div aria-label='Capacidades conectadas' className='grid content-center gap-4 sm:grid-cols-2'>
          {capabilities.map(capability => (
            <article key={capability.title} className='rounded-3xl border border-slate-800 bg-slate-900 p-5'>
              <span aria-hidden='true' className={`mb-8 block h-2 w-12 rounded-full ${capability.accent}`} />
              <h2 className='text-xl font-semibold'>{capability.title}</h2>
              <p className='mt-2 text-sm leading-6 text-slate-400'>{capability.description}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}
