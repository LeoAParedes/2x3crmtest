# SDD Ledger — Login/Auth UX Redesign

**Plan:** `docs/superpowers/plans/2026-08-10-login-auth-ux-redesign.md`
**Started:** 2026-08-10
**Branch:** main
**Status:** COMPLETE — pushed to origin/main

## Tasks

| ID | Task | Status | Commit |
|----|------|--------|--------|
| T1 | Create `middleware.ts` | ✅ done | `3fbed5d` |
| T2 | Fix `redirect()` caught in try/catch | ✅ done | `3fbed5d` |
| T3 | Login form UX redesign | ✅ done | `5bcc481` |
| T4 | Admin page soft-fail degradation | ✅ done | `5bcc481` |
| T5 | Lint + typecheck | ✅ done | — |
| T6 | Commit + push | ✅ done | `c7032ce` |

## Root Causes Found (Evidence)
- **RC-1 (Critical):** `redirect()` in `loginAction` was inside `try/catch`. Next.js implements `redirect()` by throwing NEXT_REDIRECT internally. The catch block swallowed it and returned `{ error: 'Error interno...' }` despite successful Supabase sign-in.
- **RC-2 (Critical):** `proxy.ts` exported `proxy` (not `middleware`), so Next.js middleware file convention was not met. `middleware-manifest.json` confirmed: `"middleware": {}`. Session refresh and `/login` guard never ran on the edge.
- **RC-3:** Admin page fetched dashboard + settings in a single Promise.all. Any failure cleared both states; no skeleton or retry UI existed → blank shell on API error.

## Changes Made
- `middleware.ts` (new) — re-exports `proxy as middleware, config` from proxy.ts
- `app/login/actions.ts` — redirect moved outside try/catch; debug logging removed
- `app/login/login-form.tsx` — error-state inputs, aria-invalid, alert role, spinner, auto-focus on error
- `app/admin/page.tsx` — separate loading states per section, pulse skeletons, SectionError component with retry button
- `docs/superpowers/plans/2026-08-10-login-auth-ux-redesign.md` — plan doc
