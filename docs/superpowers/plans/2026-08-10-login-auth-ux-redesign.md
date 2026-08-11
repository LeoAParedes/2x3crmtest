# Login / Auth UX Redesign — 2026-08-10

## Problem Statement
Production Vercel deployment shows:
1. Correct password triggers an error message on the login form
2. A "reload page" state appears
3. User eventually lands on `/admin` with an empty / half-loaded shell
4. No graceful degradation when dashboard APIs fail

## Root Causes (Evidence-Based)

### RC-1 — `redirect()` swallowed by `try/catch` in `loginAction` ⚡ Critical
`app/login/actions.ts` calls `redirect(destination)` inside a `try/catch`. In Next.js,
`redirect()` works by **throwing** a special `NEXT_REDIRECT` error internally. The outer
`catch` catches it and returns `{ error: 'Error interno...' }`, making a successful login
look like a failure. The session cookie IS set (Supabase `signInWithPassword` succeeded),
but the redirect never fires from the client's perspective.

### RC-2 — No `middleware.ts` export — session proxy never runs
`proxy.ts` at project root exports `proxy` (a named function) and `config`, but Next.js
only recognises a file named **`middleware.ts`** (or `middleware.js`) with a `middleware`
named or default export. The middleware manifest confirms it: `"middleware": {}`.
Without this, session cookies are never refreshed on the edge, and the authenticated-user
redirect from `/login` also never fires.

### RC-3 — Admin page has no soft-fail / loading skeleton
`app/admin/page.tsx` fetches two APIs in parallel. If either call fails, both `dashboard`
and `settings` stay `null`, the metrics grid is empty, and the only feedback is a tiny
`<p>` message at the page bottom. Combined with RC-1, users land on an empty admin shell.

## Global Constraints
- Do NOT break Supabase auth or RBAC
- Cashiers → `/caja`, admins → `/admin` (unchanged)
- No semicolons; Tailwind classes only; accessible forms
- Prefer fixing race/error handling over workarounds
- No secrets in commits

## Implementation Tasks

### T1 — Create `middleware.ts` (re-export proxy with correct name)
**File:** `middleware.ts` (root)
**Action:** Create file that re-exports `proxy` as `middleware` and re-exports `config`.
This activates session refresh and login-page guard without touching `proxy.ts` internals.

### T2 — Fix `redirect()` inside `try/catch` in `loginAction`
**File:** `app/login/actions.ts`
**Action:** Extract the `redirect()` call **outside** the `try/catch` block.
Store the destination in a variable, return early on error, then call `redirect()` after
the try block. `redirect()` can still throw `NEXT_REDIRECT` which Next.js handles correctly.

### T3 — Redesign login form UX
**File:** `app/login/login-form.tsx`
**Action:**
- Add a `redirecting` UI state (detect via `useFormStatus` pending + no prior error)
- Show "Acceso concedido, redirigiendo…" when auth succeeds and navigation is pending
- Mark inputs `aria-invalid` when there's an error
- Ensure error message is prominent (role="alert")

### T4 — Admin page soft-fail degradation
**File:** `app/admin/page.tsx`
**Action:**
- Add animated loading skeleton for metric cards while `loading === true`
- When fetch fails, show a prominent error banner with "Reintentar" button (not blank page)
- Separate `metricsError` / `settingsError` states so partial data can still display
- Wrap API calls in individual try/catch so one failure doesn't kill the other

### T5 — Lint + typecheck
Run `npx tsc --noEmit` and `npx eslint app/login/ app/admin/ middleware.ts proxy.ts`.
Fix any reported errors.

### T6 — Commit + push
Conventional commits per task. `git push origin main` (no force).

## Verification (https://2x3crmtest.vercel.app)
1. Navigate to `/login` — should see clean login form
2. Enter correct credentials → form shows "Acceso concedido, redirigiendo…" → lands on `/admin` with data
3. Enter wrong credentials → inline error message, no page crash
4. Navigate to `/admin` while API is slow → loading skeleton visible
5. If dashboard API returns error → error banner with "Reintentar" button appears, no blank shell
6. Log out → lands on `/login`
7. While on `/login` as authenticated user → middleware redirects to role home
