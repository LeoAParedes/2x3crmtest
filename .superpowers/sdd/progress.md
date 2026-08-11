# SDD Ledger — Login/Auth UX Redesign

**Plan:** `docs/superpowers/plans/2026-08-10-login-auth-ux-redesign.md`
**Started:** 2026-08-10
**Branch:** main

## Tasks

| ID | Task | Status | Commit |
|----|------|--------|--------|
| T1 | Create `middleware.ts` | ⏳ in-progress | — |
| T2 | Fix `redirect()` caught in try/catch | ⏳ pending | — |
| T3 | Login form UX redesign | ⏳ pending | — |
| T4 | Admin page soft-fail degradation | ⏳ pending | — |
| T5 | Lint + typecheck | ⏳ pending | — |
| T6 | Commit + push | ⏳ pending | — |

## Root Causes Found
- **RC-1 (Critical):** `redirect()` in `loginAction` is inside `try/catch` → NEXT_REDIRECT error swallowed → error displayed to user despite correct credentials
- **RC-2:** No `middleware.ts` exported → session proxy never ran → cookies not refreshed
- **RC-3:** Admin page has no skeleton/retry UI → blank on API failure

## Notes
- `proxy.ts` (root) exports `proxy` not `middleware`, so Next.js middleware was never active
- `src/lib/supabase/proxy.ts` is the actual session refresh logic (correct)
- Fix is to create `middleware.ts` that re-exports `proxy as middleware`
