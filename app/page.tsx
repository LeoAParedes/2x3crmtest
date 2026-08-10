export default function HomePage() {
  return (
    <main className='mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-8'>
      <section className='rounded-2xl border border-slate-200 bg-white p-6 shadow-sm'>
        <h1 className='text-3xl font-semibold text-slate-900 md:text-4xl'>2x3crmtest ERP</h1>
        <p className='mt-3 max-w-3xl text-sm text-slate-600 md:text-base'>
          Plataforma CRM + ERP de supermercado con arquitectura Vercel-compatible, agente AI en Mastra y conectividad
          WhatsApp Cloud API.
        </p>
      </section>

      <section className='grid gap-4 md:grid-cols-2'>
        <a
          href='/crm'
          className='rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-300 hover:shadow-md'
        >
          <h2 className='text-lg font-semibold text-slate-900'>Consola Chat CRM</h2>
          <p className='mt-2 text-sm text-slate-600'>Valida conversacion web usando el mismo orquestador de WhatsApp.</p>
        </a>

        <a
          href='/admin'
          className='rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-300 hover:shadow-md'
        >
          <h2 className='text-lg font-semibold text-slate-900'>Dashboard Operativo</h2>
          <p className='mt-2 text-sm text-slate-600'>
            Supervisa metricas, handoffs y conversaciones recientes con trazabilidad.
          </p>
        </a>
      </section>

      <section className='rounded-2xl border border-slate-200 bg-white p-6 shadow-sm'>
        <h2 className='text-xl font-semibold text-slate-900'>Endpoints base</h2>
        <ul className='mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700'>
          <li>
            <code>/api/agent/chat</code>
          </li>
          <li>
            <code>/api/whatsapp/webhook</code>
          </li>
          <li>
            <code>/api/crm/dashboard</code>
          </li>
          <li>
            <code>/api/observability/metrics</code>
          </li>
        </ul>
      </section>
    </main>
  )
}
