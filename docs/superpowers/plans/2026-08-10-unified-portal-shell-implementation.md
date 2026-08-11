# Unified Portal and Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a modern public portal and a continuous, role-aware ERP workspace with a minimizable floating assistant.

**Architecture:** Keep the existing server-side Supabase/Prisma authorization as the source of truth. Introduce pure navigation helpers, a reusable protected shell, and a client-side floating assistant that calls the existing agent API. The public portal and login use the same visual tokens but do not load protected data.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, Supabase SSR, Prisma 7, Vitest.

## Global Constraints

- Do not alter Supabase credential handling, role resolution, Prisma persistence, or API authorization.
- `admin` still lands on `/admin`; `cashier` still lands on `/pos`.
- Do not add a new inventory module in this plan; do not render the currently missing `/inventario` destination in primary navigation.
- Reuse `POST /api/agent/chat`; the floating UI must not expose technical run metadata.
- Keep the existing runtime-debug instrumentation until its separate verification loop has succeeded.
- All controls must have accessible names, keyboard support, and usable responsive layouts.

---

## File Structure

- Create: `src/lib/ui/workspace-navigation.ts` — pure, role-aware navigation model.
- Create: `src/lib/ui/workspace-navigation.test.ts` — navigation policy tests.
- Create: `app/components/floating-assistant.tsx` — minimizable client assistant.
- Create: `app/components/floating-assistant-state.ts` — pure chat state and payload helpers.
- Create: `app/components/floating-assistant-state.test.ts` — state transition tests.
- Create: `app/components/authenticated-shell.tsx` — shared protected navigation and assistant mount point.
- Modify: `app/admin/layout.tsx` — replace duplicate header with shared shell.
- Modify: `app/pos/page.tsx` — render POS inside shared shell.
- Modify: `app/page.tsx` — replace the module chooser with public portal.
- Modify: `app/login/page.tsx` and `app/login/login-form.tsx` — align authentication experience to portal visual system.
- Modify: `app/globals.css` — define reusable global visual tokens and base background.

## Task 1: Model authorized workspace navigation

**Files:**
- Create: `src/lib/ui/workspace-navigation.ts`
- Create: `src/lib/ui/workspace-navigation.test.ts`

**Interfaces:**
- Consumes: `CrmRole` from `src/lib/security/rbac.ts`.
- Produces: `getWorkspaceNavigation(role: CrmRole): WorkspaceNavigationItem[]`.

- [ ] **Step 1: Write the failing navigation-policy tests**

```ts
import { describe, expect, it } from 'vitest'

import { getWorkspaceNavigation } from '@/src/lib/ui/workspace-navigation'

describe('getWorkspaceNavigation', () => {
  it('gives administrators their operational destinations', () => {
    expect(getWorkspaceNavigation('admin')).toEqual([
      { href: '/admin', label: 'Panel' },
      { href: '/pos', label: 'Punto de venta' },
      { href: '/crm', label: 'Conversaciones' }
    ])
  })

  it('does not expose administration or conversation logs to cashiers', () => {
    expect(getWorkspaceNavigation('cashier')).toEqual([{ href: '/pos', label: 'Punto de venta' }])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/lib/ui/workspace-navigation.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the pure navigation model**

```ts
import type { CrmRole } from '@/src/lib/security/rbac'

export type WorkspaceNavigationItem = {
  href: '/admin' | '/pos' | '/crm'
  label: string
}

const navigationByRole: Record<CrmRole, WorkspaceNavigationItem[]> = {
  admin: [
    { href: '/admin', label: 'Panel' },
    { href: '/pos', label: 'Punto de venta' },
    { href: '/crm', label: 'Conversaciones' }
  ],
  cashier: [{ href: '/pos', label: 'Punto de venta' }]
}

export const getWorkspaceNavigation = (role: CrmRole): WorkspaceNavigationItem[] => navigationByRole[role]
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/lib/ui/workspace-navigation.test.ts`

Expected: PASS with 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ui/workspace-navigation.ts src/lib/ui/workspace-navigation.test.ts
git commit -m "feat(navigation): add role-aware workspace links"
```

## Task 2: Build the floating assistant state boundary

**Files:**
- Create: `app/components/floating-assistant-state.ts`
- Create: `app/components/floating-assistant-state.test.ts`

**Interfaces:**
- Produces: `createFloatingAssistantSessionId()`, `appendMessage()`, and `FloatingAssistantMessage`.
- Consumed by: `app/components/floating-assistant.tsx`.

- [ ] **Step 1: Write the failing pure-state tests**

```ts
import { describe, expect, it } from 'vitest'

import { appendMessage, type FloatingAssistantMessage } from '@/app/components/floating-assistant-state'

describe('appendMessage', () => {
  it('adds a display-safe assistant message without technical metadata', () => {
    const messages: FloatingAssistantMessage[] = [{ id: 'one', role: 'user', content: '¿Hay arroz?' }]

    expect(appendMessage(messages, { id: 'two', role: 'assistant', content: 'Hay 18 unidades disponibles.' })).toEqual([
      { id: 'one', role: 'user', content: '¿Hay arroz?' },
      { id: 'two', role: 'assistant', content: 'Hay 18 unidades disponibles.' }
    ])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- app/components/floating-assistant-state.test.ts`

Expected: FAIL because the state module does not exist.

- [ ] **Step 3: Implement the state helpers**

```ts
export type FloatingAssistantMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
}

export const createFloatingAssistantSessionId = () => `workspace-${crypto.randomUUID()}`

export const appendMessage = (
  messages: FloatingAssistantMessage[],
  message: FloatingAssistantMessage
): FloatingAssistantMessage[] => [...messages, message]
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- app/components/floating-assistant-state.test.ts`

Expected: PASS with 1 test.

- [ ] **Step 5: Commit**

```bash
git add app/components/floating-assistant-state.ts app/components/floating-assistant-state.test.ts
git commit -m "feat(chat): add floating assistant state helpers"
```

## Task 3: Implement the accessible minimizable assistant

**Files:**
- Create: `app/components/floating-assistant.tsx`

**Interfaces:**
- Consumes: `appendMessage`, `createFloatingAssistantSessionId`, and `FloatingAssistantMessage`.
- Consumes: existing `POST /api/agent/chat` contract `{ sessionId, message, locale }`.
- Produces: `<FloatingAssistant />`.

- [ ] **Step 1: Implement the client component with its closed state**

```tsx
'use client'

import { FormEvent, useState } from 'react'

import {
  appendMessage,
  createFloatingAssistantSessionId,
  type FloatingAssistantMessage
} from '@/app/components/floating-assistant-state'

export const FloatingAssistant = () => {
  const [isOpen, setIsOpen] = useState(false)
  const [sessionId] = useState(createFloatingAssistantSessionId)
  const [messages, setMessages] = useState<FloatingAssistantMessage[]>([])
  const [input, setInput] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const message = input.trim()
    if (!message || isSending) return

    setInput('')
    setErrorMessage(null)
    setMessages(current => appendMessage(current, { id: crypto.randomUUID(), role: 'user', content: message }))
    setIsSending(true)

    try {
      const response = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, message, locale: 'es-MX' })
      })
      const data = (await response.json()) as { success?: boolean; reply?: { reply?: string }; message?: string }
      if (!response.ok || !data.success || !data.reply?.reply) {
        throw new Error(data.message || 'El asistente no pudo responder')
      }
      setMessages(current =>
        appendMessage(current, { id: crypto.randomUUID(), role: 'assistant', content: data.reply?.reply || '' })
      )
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'El asistente no pudo responder')
    } finally {
      setIsSending(false)
    }
  }

  if (!isOpen) {
    return (
      <button
        type='button'
        aria-label='Abrir asistente'
        onClick={() => setIsOpen(true)}
        className='fixed bottom-5 right-5 z-50 rounded-full bg-emerald-500 px-5 py-4 text-sm font-semibold text-slate-950 shadow-lg transition hover:bg-emerald-400 focus:outline-none focus:ring-4 focus:ring-emerald-200'
      >
        Asistente
      </button>
    )
  }

  return (
    <aside
      aria-label='Asistente del sistema'
      className='fixed bottom-5 right-5 z-50 flex h-[min(36rem,calc(100vh-2.5rem))] w-[min(24rem,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-3xl border border-slate-700 bg-slate-950 text-white shadow-2xl'
    >
      <header className='flex items-center justify-between border-b border-slate-800 px-4 py-3'>
        <div>
          <p className='text-sm font-semibold'>Asistente 2×3</p>
          <p className='text-xs text-slate-400'>Consultas de operación</p>
        </div>
        <button
          type='button'
          aria-label='Minimizar asistente'
          onClick={() => setIsOpen(false)}
          className='rounded-lg px-2 py-1 text-sm text-slate-300 hover:bg-slate-800 hover:text-white'
        >
          Minimizar
        </button>
      </header>
      <div aria-live='polite' className='flex-1 space-y-3 overflow-y-auto p-4'>
        {messages.length === 0 ? (
          <p className='rounded-2xl bg-slate-800 p-3 text-sm text-slate-200'>
            Estoy listo para ayudarte con la operación.
          </p>
        ) : (
          messages.map(currentMessage => (
            <p
              key={currentMessage.id}
              className={
                currentMessage.role === 'user'
                  ? 'ml-auto max-w-[85%] rounded-2xl bg-emerald-400 p-3 text-sm text-slate-950'
                  : 'mr-auto max-w-[85%] rounded-2xl bg-slate-800 p-3 text-sm text-slate-100'
              }
            >
              {currentMessage.content}
            </p>
          ))
        )}
      </div>
      <form onSubmit={handleSubmit} className='border-t border-slate-800 p-4'>
        {errorMessage ? <p role='alert' className='mb-2 text-sm text-rose-300'>{errorMessage}</p> : null}
        <label htmlFor='floating-assistant-input' className='sr-only'>Mensaje para el asistente</label>
        <div className='flex gap-2'>
          <input
            id='floating-assistant-input'
            value={input}
            onChange={event => setInput(event.target.value)}
            disabled={isSending}
            placeholder='Escribe una consulta'
            className='min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-emerald-400'
          />
          <button
            type='submit'
            disabled={isSending || !input.trim()}
            className='rounded-xl bg-emerald-400 px-3 py-2 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50'
          >
            {isSending ? 'Enviando' : 'Enviar'}
          </button>
        </div>
      </form>
    </aside>
  )
}
```

- [ ] **Step 2: Verify the accessible open-state contract**

Confirm the implementation above includes the named minimize control, live
message region, labelled input, disabled send behavior, and error alert. Do
not render API intents, handoffs, HTTP codes, session identifiers, or any
other technical metadata.

- [ ] **Step 3: Run static verification**

Run: `npm run lint && npm run typecheck`

Expected: PASS with no warnings or TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add app/components/floating-assistant.tsx
git commit -m "feat(chat): add minimizable workspace assistant"
```

## Task 4: Compose the role-aware protected shell

**Files:**
- Create: `app/components/authenticated-shell.tsx`
- Modify: `app/admin/layout.tsx`
- Modify: `app/pos/page.tsx`

**Interfaces:**
- Consumes: `AuthenticatedActor` and `getWorkspaceNavigation`.
- Produces: `<AuthenticatedShell actor={actor}>{children}</AuthenticatedShell>`.

- [ ] **Step 1: Implement the shared shell**

```tsx
import Link from 'next/link'
import type { ReactNode } from 'react'

import { FloatingAssistant } from '@/app/components/floating-assistant'
import type { AuthenticatedActor } from '@/src/lib/security/api-auth'
import { getWorkspaceNavigation } from '@/src/lib/ui/workspace-navigation'

type AuthenticatedShellProps = {
  actor: AuthenticatedActor
  children: ReactNode
}

export const AuthenticatedShell = ({ actor, children }: AuthenticatedShellProps) => (
  <div className='min-h-screen bg-slate-950 text-slate-950'>
    <header className='border-b border-slate-800 bg-slate-950 text-white'>
      <nav aria-label='Navegación principal' className='mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-4 px-4 md:px-8'>
        <Link href={actor.role === 'admin' ? '/admin' : '/pos'} className='font-semibold tracking-tight'>
          2×3 · Operaciones
        </Link>
        <div className='hidden items-center gap-1 md:flex'>
          {getWorkspaceNavigation(actor.role).map(item => (
            <Link key={item.href} href={item.href} className='rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white'>
              {item.label}
            </Link>
          ))}
        </div>
        <div className='flex items-center gap-3'>
          <span className='text-sm text-slate-300'>{actor.username}</span>
          <form action='/auth/logout' method='post'>
            <button type='submit' aria-label='Cerrar sesión' className='rounded-lg border border-slate-700 px-3 py-2 text-sm font-medium hover:bg-slate-800'>
              Salir
            </button>
          </form>
        </div>
      </nav>
    </header>
    {children}
    <FloatingAssistant />
  </div>
)
```

- [ ] **Step 2: Refactor the admin layout**

Replace the current `<header>` and fragment in `app/admin/layout.tsx` with:

```tsx
const actor = await getAuthenticatedActor({ allowedRoles: ['admin'] })
if (!actor) redirect('/login')

return <AuthenticatedShell actor={actor}>{children}</AuthenticatedShell>
```

- [ ] **Step 3: Wrap the POS page in the shared shell**

Replace the return in `app/pos/page.tsx` with:

```tsx
return (
  <AuthenticatedShell actor={actor}>
    <PosClient cashierUsername={actor.username} />
  </AuthenticatedShell>
)
```

- [ ] **Step 4: Run tests and static verification**

Run: `npm test -- src/lib/ui/workspace-navigation.test.ts app/components/floating-assistant-state.test.ts && npm run lint && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/components/authenticated-shell.tsx app/admin/layout.tsx app/pos/page.tsx
git commit -m "feat(app): unify protected workspace shell"
```

## Task 5: Redesign the public portal and login

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/login/page.tsx`
- Modify: `app/login/login-form.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: existing `/login` route and `loginAction`.
- Produces: a public entry route with one login CTA and an aligned authentication form.

- [ ] **Step 1: Replace the public module chooser**

Render `/` with a single `Link href='/login'` CTA and four non-navigational
capability cards. Define the cards above the component:

```tsx
const capabilities = [
  { title: 'Caja en movimiento', description: 'Cobros ágiles con la operación siempre a la vista.', accent: 'bg-emerald-400' },
  { title: 'Inventario atento', description: 'Decisiones informadas antes de que falte un producto.', accent: 'bg-amber-300' },
  { title: 'Finanzas claras', description: 'Una lectura simple de la salud diaria del negocio.', accent: 'bg-sky-300' },
  { title: 'Asistente presente', description: 'Respuestas operativas sin abandonar tu tarea.', accent: 'bg-violet-300' }
]

<main className='overflow-hidden bg-slate-950 text-white'>
  <section className='mx-auto grid min-h-screen max-w-7xl gap-12 px-6 py-8 lg:grid-cols-[1.1fr_0.9fr] lg:px-10'>
    <div className='flex flex-col justify-center'>
      <p className='text-sm font-semibold uppercase tracking-[0.2em] text-emerald-300'>2×3 operaciones</p>
      <h1 className='mt-6 max-w-3xl text-5xl font-semibold tracking-tight sm:text-6xl'>El pulso de tu supermercado, en un solo lugar.</h1>
      <p className='mt-6 max-w-xl text-lg leading-8 text-slate-300'>Opera la caja, anticipa el inventario y conversa con tu sistema sin perder el contexto.</p>
      <Link href='/login' className='mt-10 w-fit rounded-full bg-emerald-400 px-6 py-3 font-semibold text-slate-950 transition hover:bg-emerald-300'>Entrar al sistema</Link>
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
```

- [ ] **Step 2: Align login with the portal**

Keep the existing server action and input names unchanged. Replace only layout
classes and explanatory copy so the page uses a dark background, an
emerald-accented brand label, and a clear return link to `/`. Keep contrast,
`autoComplete`, length constraints, pending state, and the generic failure
message.

- [ ] **Step 3: Add global visual foundations**

In `app/globals.css`, retain Tailwind import and append:

```css
:root {
  color-scheme: light;
  --surface: #f8fafc;
  --ink: #0f172a;
}

body {
  min-width: 320px;
  background: var(--surface);
  color: var(--ink);
}
```

Do not import remote fonts or introduce a component library.

- [ ] **Step 4: Run visual and static verification**

Run: `npm run lint && npm run typecheck && npm run build`

Expected: PASS.

Then open `/`, `/login`, `/admin`, and `/pos` at 320 px and desktop width.
Confirm the public page only exposes login, each authenticated page has the
same header and floating assistant, and no horizontal scrolling occurs.

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx app/login/page.tsx app/login/login-form.tsx app/globals.css
git commit -m "feat(portal): redesign entry and login experience"
```

## Task 6: Verify role routing and runtime behavior

**Files:**
- Modify only if instrumentation proves a fault: `app/login/actions.ts`, `app/admin/page.tsx`, `app/api/crm/dashboard/route.ts`, `app/api/crm/mastra/settings/route.ts`, `src/lib/db/prisma.ts`.

**Interfaces:**
- Consumes: the existing Supabase sessions, role lookup, and dashboard API.
- Produces: evidence that the new UI does not change role redirects or introduce runtime regressions.

- [ ] **Step 1: Run existing authentication tests**

Run: `npm test -- app/login/actions.test.ts src/lib/security/api-auth.test.ts`

Expected: PASS; admin resolves to `/admin` and cashier resolves to `/pos`.

- [ ] **Step 2: Start the Docker environment**

Run: `docker compose up --build -d`

Expected: container `2x3crmtest` reports `Up` and port `3000` is published.

- [ ] **Step 3: Collect runtime evidence**

Clear only `debug-449600.log` through the debug file tool. With each role,
sign in, visit the assigned destination, open/minimize the assistant, and
send one non-sensitive test query. Inspect logs before applying any fix to
the ongoing dashboard investigation.

- [ ] **Step 4: Commit only proven runtime corrections**

If runtime logs show no regression, do not create code changes. If logs prove
a defect, create a focused fix, keep instrumentation through post-fix
verification, then commit with its affected test:

```bash
git add <verified-files>
git commit -m "fix(app): resolve verified workspace regression"
```
