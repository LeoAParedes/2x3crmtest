# Supabase Auth, RBAC y Persistencia Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar la autenticación falsificable por Supabase Auth SSR, persistir todos los flujos CRM críticos y registrar transaccionalmente cada venta con el cajero autenticado.

**Architecture:** Supabase Auth será la autoridad de identidad y Prisma/PostgreSQL la fuente de verdad para perfiles, roles, inventario, ventas, auditoría y configuración. Las APIs obtendrán el actor desde cookies verificadas y nunca desde headers enviados por el navegador; `proxy.ts` renovará sesiones y los servicios críticos fallarán cerrados si PostgreSQL no está disponible.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 6, Supabase Auth + `@supabase/ssr`, Prisma 7 + PostgreSQL adapter, Zod 4, Vitest, Tailwind CSS 4.

## Global Constraints

- Roles válidos: `admin` y `cashier`
- Usuario `admin` usa identidad interna `admin@2x3crmtest.local`
- Usuario `cajero` usa identidad interna `cajero@2x3crmtest.local`
- Las contraseñas bootstrap se leen solo desde variables de entorno y nunca se escriben en código, logs o archivos versionados
- Ninguna clave privada puede incluir prefijo `NEXT_PUBLIC_`
- Toda identidad de cajero se obtiene de la sesión verificada
- No existe fallback mock para autenticación, ventas, auditoría, aprobaciones, conversaciones, métricas ni configuración Mastra
- Las rutas Meta conservan verificación por verify token/firma y no dependen de sesión humana
- No crear commits sin solicitud explícita del usuario

---

## File Map

### Configuración y pruebas

- Modify: `package.json` — dependencias Supabase/Prisma PostgreSQL, Vitest y scripts
- Create: `vitest.config.ts` — aliases y entorno Node
- Modify: `.github/workflows/ci.yml` — ejecutar pruebas
- Modify: `.env.example` — contrato de variables públicas y privadas
- Modify: `src/lib/config/env.ts` — validación fail-closed de configuración

### Base de datos

- Modify: `prisma/schema.prisma` — perfiles, ventas, aprobaciones, settings e idempotencia
- Create: `prisma/migrations/20260810100000_auth_rbac_persistence/migration.sql` — tablas, índices y RLS
- Modify: `prisma.config.ts` — conexión PostgreSQL
- Modify: `src/lib/db/prisma.ts` — `PrismaPg` con conexión Supabase pooler
- Create: `scripts/bootstrap-users.ts` — alta idempotente de admin/cajero

### Supabase Auth y RBAC

- Create: `src/lib/supabase/client.ts` — cliente navegador
- Create: `src/lib/supabase/server.ts` — cliente SSR
- Create: `src/lib/supabase/proxy.ts` — refresh de sesión
- Modify: `proxy.ts` — refresh, redirects y security headers
- Modify: `src/lib/security/rbac.ts` — dos roles y permisos ERP
- Modify: `src/lib/security/api-auth.ts` — sesión + perfil persistido
- Create: `src/lib/security/username.ts` — username interno permitido
- Create: `src/lib/security/auth-errors.ts` — errores tipados

### UI de sesión

- Create: `app/login/page.tsx` — pantalla de login
- Create: `app/login/actions.ts` — login server-side
- Create: `app/auth/logout/route.ts` — logout
- Create: `app/(authenticated)/layout.tsx` — shell autenticado
- Move/Modify: `app/admin/page.tsx` → `app/(authenticated)/admin/page.tsx` — guard admin
- Create: `app/(authenticated)/admin/admin-dashboard.tsx` — dashboard sin selector de rol/token
- Create: `app/(authenticated)/pos/page.tsx` — POS admin/cashier
- Create: `app/(authenticated)/inventario/page.tsx` — consulta admin/cashier
- Modify: `app/page.tsx` — navegación según sesión

### Persistencia CRM

- Modify: `src/lib/crm/services/inventory-service.ts`
- Modify: `src/lib/crm/services/order-service.ts`
- Modify: `src/lib/crm/services/finance-service.ts`
- Modify: `src/lib/crm/services/write-actions-service.ts`
- Modify: `src/lib/crm/services/approval-service.ts`
- Modify: `src/lib/crm/agent-action-audit.ts`
- Modify: `src/lib/crm/audit-log.ts`
- Modify: `src/lib/crm/mastra-settings.ts`
- Modify: `src/lib/observability/metrics-store.ts`
- Delete: `src/lib/crm/data-store.ts`

### POS y APIs

- Create: `src/lib/pos/sale-schema.ts`
- Create: `src/lib/pos/sale-service.ts`
- Create: `app/api/pos/inventory/route.ts`
- Create: `app/api/pos/sales/route.ts`
- Modify: `app/api/crm/dashboard/route.ts`
- Modify: `app/api/crm/approvals/route.ts`
- Modify: `app/api/crm/audit/route.ts`
- Modify: `app/api/crm/mastra/settings/route.ts`
- Modify: `app/api/observability/metrics/route.ts`
- Modify: `app/api/whatsapp/send/route.ts`
- Modify: `app/api/agent/chat/route.ts`
- Modify: `app/api/whatsapp/webhook/route.ts`

### Documentación

- Modify: `README.md`
- Modify: `docs/manual-tecnico/manual-tecnico-erp-supermercado.md`
- Modify: `docs/manual-usuario/manual-usuario-erp-supermercado.md`
- Modify: `docs/operaciones/release-runbook-vercel.md`

---

### Task 1: Test Harness and Secure Environment Contract

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `src/lib/config/env.test.ts`
- Modify: `src/lib/config/env.ts`
- Modify: `.env.example`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Produces: `getServerEnv(): ServerEnv`
- Produces: `getPublicSupabaseEnv(): PublicSupabaseEnv`

- [ ] **Step 1: Install dependencies**

Run:

```powershell
npm install @supabase/ssr @supabase/supabase-js @prisma/adapter-pg pg
npm install -D vitest tsx @types/pg
```

Expected: `package-lock.json` changes and npm exits `0`.

- [ ] **Step 2: Add scripts**

Add:

```json
"test": "vitest run",
"test:watch": "vitest",
"prisma:migrate": "prisma migrate dev",
"prisma:deploy": "prisma migrate deploy",
"bootstrap:users": "tsx scripts/bootstrap-users.ts"
```

- [ ] **Step 3: Configure Vitest**

```ts
import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url))
    }
  },
  test: {
    environment: 'node',
    clearMocks: true
  }
})
```

- [ ] **Step 4: Write failing env tests**

```ts
import { afterEach, describe, expect, it } from 'vitest'

import { getPublicSupabaseEnv, getServerEnv } from '@/src/lib/config/env'

describe('environment contract', () => {
  const originalEnv = process.env

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('rejects missing private server configuration', () => {
    process.env = {}
    expect(() => getServerEnv()).toThrow('SUPABASE_SERVICE_ROLE_KEY')
  })

  it('returns only browser-safe Supabase values', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'publishable'
    expect(getPublicSupabaseEnv()).toEqual({
      url: 'https://example.supabase.co',
      publishableKey: 'publishable'
    })
  })
})
```

- [ ] **Step 5: Run the failing tests**

Run: `npm test -- src/lib/config/env.test.ts`

Expected: FAIL because the two env functions do not exist.

- [ ] **Step 6: Implement Zod environment validation**

Define separate public/server schemas. `ServerEnv` must include:

```ts
type ServerEnv = {
  supabaseUrl: string
  supabasePublishableKey: string
  supabaseServiceRoleKey: string
  databaseUrl: string
  bootstrapAdminPassword?: string
  bootstrapCashierPassword?: string
}
```

Remove `DATA_MODE`, `APP_INTERNAL_API_TOKEN` and every insecure default. Keep Meta/LLM options server-only.

- [ ] **Step 7: Update `.env.example`**

```dotenv
HOST_PORT=3000
NEXT_PUBLIC_BASE_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=postgresql://postgres.PROJECT_REF:PASSWORD@POOLER_HOST:6543/postgres?pgbouncer=true
BOOTSTRAP_ADMIN_PASSWORD=
BOOTSTRAP_CASHIER_PASSWORD=
```

Remove `NEXT_PUBLIC_APP_INTERNAL_API_TOKEN`, `APP_INTERNAL_API_TOKEN` and `DATA_MODE`.

- [ ] **Step 8: Add `npm test` to CI and verify**

Run:

```powershell
npm test
npm run typecheck
npm run lint
```

Expected: all commands exit `0`.

---

### Task 2: Prisma Models, Migration, RLS and Database Client

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260810100000_auth_rbac_persistence/migration.sql`
- Modify: `src/lib/db/prisma.ts`
- Create: `src/lib/db/prisma.test.ts`

**Interfaces:**
- Produces: `getPrisma(): Promise<PrismaClient>`
- Produces models: `UserProfile`, `Sale`, `SaleItem`, `SystemActionLog`, `ApprovalRequest`, `MastraSettings`, `ProcessedEvent`

- [ ] **Step 1: Write failing client tests**

Mock `PrismaPg` and assert `getPrisma()` rejects when `DATABASE_URL` is absent and constructs one cached client when present.

- [ ] **Step 2: Run the failing test**

Run: `npm test -- src/lib/db/prisma.test.ts`

Expected: FAIL because the current client requires `PRISMA_ACCELERATE_URL`.

- [ ] **Step 3: Extend Prisma schema**

Add:

```prisma
enum UserRole {
  admin
  cashier
}

model UserProfile {
  id         String   @id @default(cuid())
  authUserId String   @unique @db.Uuid
  username   String   @unique
  role       UserRole
  isActive   Boolean  @default(true)
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  sales      Sale[]
}

model Sale {
  id                String      @id @default(cuid())
  saleNumber        String      @unique
  cashierProfileId  String
  cashierAuthUserId String      @db.Uuid
  cashierUsername   String
  subtotal          Decimal     @db.Decimal(10, 2)
  tax               Decimal     @db.Decimal(10, 2)
  total             Decimal     @db.Decimal(10, 2)
  paymentMethod     String
  amountReceived    Decimal?    @db.Decimal(10, 2)
  status            String      @default("completed")
  createdAt         DateTime    @default(now())
  cashierProfile    UserProfile @relation(fields: [cashierProfileId], references: [id], onDelete: Restrict)
  items             SaleItem[]

  @@index([cashierAuthUserId, createdAt])
}

model SaleItem {
  id              String        @id @default(cuid())
  saleId          String
  inventoryItemId String
  sku             String
  productName     String
  quantity        Int
  unitPrice       Decimal       @db.Decimal(10, 2)
  lineTotal       Decimal       @db.Decimal(10, 2)
  sale            Sale          @relation(fields: [saleId], references: [id], onDelete: Cascade)
  inventoryItem   InventoryItem @relation(fields: [inventoryItemId], references: [id], onDelete: Restrict)

  @@index([saleId])
  @@index([inventoryItemId])
}

model SystemActionLog {
  id              String   @id @default(cuid())
  actorAuthUserId String?  @db.Uuid
  actorUsername   String
  actorRole       String
  action          String
  entityType      String
  entityId        String
  status          String
  metadata        Json?
  createdAt       DateTime @default(now())

  @@index([actorAuthUserId, createdAt])
  @@index([entityType, entityId])
}
```

Add `saleItems SaleItem[]` to `InventoryItem`. Add persistent models for approvals, singleton Mastra settings and WhatsApp processed event IDs.

- [ ] **Step 4: Create migration with RLS**

The migration must:

1. Create generated Prisma tables/enums.
2. Enable RLS on `UserProfile`, `Sale`, `SaleItem`, `SystemActionLog`.
3. Add policies using `auth.uid()` and `(auth.jwt() ->> 'user_role')`.
4. Create a `custom_access_token_hook(event jsonb)` function that reads `UserProfile.role`, inserts `user_role` into claims, and grants execute to `supabase_auth_admin`.
5. Revoke hook execution from `anon`, `authenticated` and `public`.

- [ ] **Step 5: Replace Accelerate-only client**

```ts
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const getPrisma = async () => {
  if (globalForPrisma.prisma) return globalForPrisma.prisma

  const connectionString = process.env.DATABASE_URL?.trim()
  if (!connectionString) throw new Error('DATABASE_URL is required')

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString })
  })

  if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
  return prisma
}
```

- [ ] **Step 6: Generate and validate**

Run:

```powershell
npm run prisma:validate
npm run prisma:generate
npm test -- src/lib/db/prisma.test.ts
npm run typecheck
```

Expected: all commands exit `0`.

---

### Task 3: Username Mapping and Supabase Clients

**Files:**
- Create: `src/lib/security/username.ts`
- Create: `src/lib/security/username.test.ts`
- Create: `src/lib/supabase/client.ts`
- Create: `src/lib/supabase/server.ts`
- Create: `src/lib/supabase/proxy.ts`

**Interfaces:**
- Produces: `usernameToInternalEmail(username: unknown): string`
- Produces: `createBrowserSupabaseClient()`
- Produces: `createServerSupabaseClient()`
- Produces: `updateSession(request: NextRequest): Promise<NextResponse>`

- [ ] **Step 1: Write failing username tests**

```ts
import { describe, expect, it } from 'vitest'

import { usernameToInternalEmail } from '@/src/lib/security/username'

describe('usernameToInternalEmail', () => {
  it.each([
    ['admin', 'admin@2x3crmtest.local'],
    [' ADMIN ', 'admin@2x3crmtest.local'],
    ['cajero', 'cajero@2x3crmtest.local']
  ])('maps %s', (input, expected) => {
    expect(usernameToInternalEmail(input)).toBe(expected)
  })

  it.each(['root', 'admin@example.com', '', undefined])('rejects %s', input => {
    expect(() => usernameToInternalEmail(input)).toThrow('Usuario inválido')
  })
})
```

- [ ] **Step 2: Run test and confirm failure**

Run: `npm test -- src/lib/security/username.test.ts`

Expected: FAIL because module does not exist.

- [ ] **Step 3: Implement strict mapping**

Use `z.enum(['admin', 'cajero'])` after trim/lowercase. Do not interpolate arbitrary usernames into email addresses.

- [ ] **Step 4: Implement browser/server/proxy Supabase factories**

The browser factory uses only public URL/key. The server factory integrates `cookies()` with `getAll`/`setAll`. The proxy factory copies refreshed cookies to `NextResponse`.

- [ ] **Step 5: Verify**

Run:

```powershell
npm test -- src/lib/security/username.test.ts
npm run typecheck
npm run lint
```

Expected: PASS and no warnings.

---

### Task 4: Bootstrap Initial Users Safely

**Files:**
- Create: `scripts/bootstrap-users.ts`
- Create: `scripts/bootstrap-users.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `bootstrapInitialUsers(dependencies): Promise<void>`

- [ ] **Step 1: Write failing bootstrap tests**

Cover:

- missing password rejects before calling Supabase
- existing auth users are updated idempotently
- `admin` receives role `admin`
- `cajero` receives role `cashier`
- passwords never appear in log calls

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- scripts/bootstrap-users.test.ts`

Expected: FAIL because script does not exist.

- [ ] **Step 3: Implement bootstrap**

Use `createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })`. For each internal email:

1. Find/create user via `supabase.auth.admin`.
2. Set `email_confirm: true`.
3. Upsert `UserProfile` by `authUserId`.
4. Print only username, role and success/failure.

Do not include a password literal or return password values.

- [ ] **Step 4: Verify without real secrets**

Run:

```powershell
npm test -- scripts/bootstrap-users.test.ts
npm run typecheck
```

Expected: PASS. Do not execute `npm run bootstrap:users` until the user configures local secrets.

---

### Task 5: Session-Based RBAC and Proxy Protection

**Files:**
- Modify: `src/lib/security/rbac.ts`
- Create: `src/lib/security/rbac.test.ts`
- Modify: `src/lib/security/api-auth.ts`
- Create: `src/lib/security/api-auth.test.ts`
- Modify: `proxy.ts`

**Interfaces:**
- Produces: `CrmRole = 'admin' | 'cashier'`
- Produces: `AuthenticatedActor`
- Produces: `requireAuthenticatedActor(options?): Promise<ApiAccessResult>`

```ts
type AuthenticatedActor = {
  userId: string
  profileId: string
  username: string
  role: 'admin' | 'cashier'
}
```

- [ ] **Step 1: Write failing RBAC tests**

Assert:

- admin has every declared permission
- cashier has `pos:create`, `pos:view-own`, `inventory:view`
- cashier lacks `admin:view`, `finance:view`, `mastra:update`, `audit:view-all`

- [ ] **Step 2: Write failing API auth tests**

Mock Supabase and Prisma. Cover no session → 401, inactive profile → 403, wrong role → 403, active allowed actor → success. Include a request with forged `x-role: admin` and prove it remains cashier.

- [ ] **Step 3: Run and confirm failures**

Run:

```powershell
npm test -- src/lib/security/rbac.test.ts src/lib/security/api-auth.test.ts
```

Expected: FAIL against header-based implementation.

- [ ] **Step 4: Replace header authorization**

`requireAuthenticatedActor` must:

1. Read verified user from server Supabase client.
2. Query `UserProfile` by `authUserId`.
3. Reject missing/inactive profiles.
4. Apply allowed roles/permission.
5. Return request ID/client IP plus actor.

Delete timing-safe internal browser token logic.

- [ ] **Step 5: Update Next.js 16 `proxy.ts`**

Keep the `proxy` convention. Refresh Supabase cookies and redirect:

- unauthenticated `/admin`, `/pos`, `/inventario` → `/login`
- authenticated `/login` → `/admin` for admin or `/pos` for cashier

Do not rely on proxy as the only authorization layer. Preserve security headers and add Supabase origin to `connect-src`.

- [ ] **Step 6: Verify**

Run:

```powershell
npm test -- src/lib/security/rbac.test.ts src/lib/security/api-auth.test.ts
npm run typecheck
npm run lint
```

Expected: all pass.

---

### Task 6: Login, Logout and Protected UI Shell

**Files:**
- Create: `app/login/actions.ts`
- Create: `app/login/page.tsx`
- Create: `app/auth/logout/route.ts`
- Create: `app/(authenticated)/layout.tsx`
- Modify: `app/page.tsx`
- Move: `app/admin/page.tsx` to `app/(authenticated)/admin/admin-dashboard.tsx`
- Create: `app/(authenticated)/admin/page.tsx`

**Interfaces:**
- Produces: `loginAction(previousState, formData): Promise<LoginState>`
- Produces: `POST /auth/logout`

- [ ] **Step 1: Write login action tests**

Cover valid usernames, generic invalid-credential error, redirects by persisted role, and no password logging.

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- app/login/actions.test.ts`

Expected: FAIL because action does not exist.

- [ ] **Step 3: Implement login action**

Parse:

```ts
const loginSchema = z.object({
  username: z.enum(['admin', 'cajero']),
  password: z.string().min(8).max(128)
})
```

Call `signInWithPassword`, load active profile, redirect admin to `/admin` and cashier to `/pos`. Return the same public error for unknown username and bad password.

- [ ] **Step 4: Build accessible login UI**

Use typed fields, explicit submit type, disabled pending state and `aria-live`. Never prefill or display the bootstrap password.

- [ ] **Step 5: Protect server layouts/pages**

The authenticated layout requires a session. `/admin/page.tsx` requires role `admin`. Move the existing dashboard client code into `admin-dashboard.tsx`, remove:

- role selector
- role simulation matrix
- `NEXT_PUBLIC_APP_INTERNAL_API_TOKEN`
- `buildAuthHeaders`

All fetch calls use same-origin session cookies.

- [ ] **Step 6: Add logout and role-aware home links**

Logout calls Supabase `signOut()` and redirects `/login`.

- [ ] **Step 7: Verify**

Run:

```powershell
npm test -- app/login/actions.test.ts
npm run typecheck
npm run lint
```

Expected: all pass.

---

### Task 7: Mandatory CRM Persistence

**Files:**
- Modify: `src/lib/crm/services/inventory-service.ts`
- Modify: `src/lib/crm/services/order-service.ts`
- Modify: `src/lib/crm/services/finance-service.ts`
- Modify: `src/lib/crm/services/write-actions-service.ts`
- Modify: `src/lib/crm/services/approval-service.ts`
- Modify: `src/lib/crm/agent-action-audit.ts`
- Modify: `src/lib/crm/audit-log.ts`
- Modify: `src/lib/crm/mastra-settings.ts`
- Modify: `src/lib/observability/metrics-store.ts`
- Modify: `app/api/agent/chat/route.ts`
- Modify: `app/api/whatsapp/webhook/route.ts`
- Delete: `src/lib/crm/data-store.ts`

**Interfaces:**
- All existing service functions become asynchronous if they read/write PostgreSQL
- `getCrmMetricsSnapshot(): Promise<CrmMetricsSnapshot>`
- `getMastraSettings(): Promise<MastraSettings & { updatedAt: string }>`

- [ ] **Step 1: Write persistence contract tests**

Create focused tests proving:

- inventory/order/finance never import or read `crmDataStore`
- approval create/list/resolve use Prisma
- conversation audit creates `Conversation` and two `ConversationMessage` rows
- Mastra settings upsert singleton ID `default`
- metrics aggregate Prisma counts
- persistence failures propagate instead of silently using memory

- [ ] **Step 2: Run and confirm failures**

Run: `npm test -- src/lib/crm src/lib/observability`

Expected: FAIL because stores are in memory.

- [ ] **Step 3: Convert read/write services**

Remove every `env.dataMode` branch. Query Prisma unconditionally. Convert approval calls in write actions to `await`.

- [ ] **Step 4: Convert audits**

Remove `inMemoryActionStore`, `conversationAuditStore` and `safeRecordAgentAction` swallowing behavior for critical writes. Persist action payloads redacted. Keep a best-effort helper only for non-critical provider diagnostics, named explicitly `tryRecordNonCriticalAgentAction`.

- [ ] **Step 5: Persist Mastra settings and metrics**

Load/update singleton row transactionally. Compute metrics with `Promise.all` Prisma counts/sums.

- [ ] **Step 6: Delete data store**

Run:

```powershell
rg "crmDataStore|DATA_MODE|inMemoryActionStore|conversationAuditStore" app src
```

Expected: no matches.

- [ ] **Step 7: Verify**

Run:

```powershell
npm test -- src/lib/crm src/lib/observability
npm run typecheck
npm run lint
```

Expected: all pass.

---

### Task 8: Secure Existing APIs

**Files:**
- Modify: `app/api/crm/dashboard/route.ts`
- Modify: `app/api/crm/approvals/route.ts`
- Modify: `app/api/crm/audit/route.ts`
- Modify: `app/api/crm/mastra/settings/route.ts`
- Modify: `app/api/observability/metrics/route.ts`
- Modify: `app/api/whatsapp/send/route.ts`
- Create: `app/api/crm/routes-auth.test.ts`

**Interfaces:**
- All human APIs consume `await requireAuthenticatedActor(...)`

- [ ] **Step 1: Write route authorization tests**

Assert:

- admin can dashboard, approvals, audit, Mastra write, metrics and WhatsApp send
- cashier receives 403 for those administrative routes
- missing session receives 401
- forged role headers have no effect

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- app/api/crm/routes-auth.test.ts`

Expected: FAIL because routes call synchronous header auth.

- [ ] **Step 3: Update routes**

Permissions:

- dashboard/metrics/audit/approvals/Mastra read+write/WhatsApp send: admin only
- health: public and redacted
- agent chat: retain channel policy; writes persist
- Meta webhook: verify token/signature only; never require human cookie

Await all newly asynchronous service functions.

- [ ] **Step 4: Harden Meta signature**

Production must reject webhook POST with `503` when `META_APP_SECRET` is absent; never return `true` by configuration omission.

- [ ] **Step 5: Verify**

Run:

```powershell
npm test -- app/api/crm/routes-auth.test.ts
npm run typecheck
npm run lint
```

Expected: all pass.

---

### Task 9: Transactional POS and Cashier Audit

**Files:**
- Create: `src/lib/pos/sale-schema.ts`
- Create: `src/lib/pos/sale-service.ts`
- Create: `src/lib/pos/sale-service.test.ts`
- Create: `app/api/pos/inventory/route.ts`
- Create: `app/api/pos/sales/route.ts`
- Create: `app/api/pos/sales/route.test.ts`

**Interfaces:**
- Produces: `createSale(input: CreateSaleInput, actor: AuthenticatedActor): Promise<SaleResult>`
- Produces: `listSales(actor: AuthenticatedActor): Promise<SaleSummary[]>`

```ts
const createSaleSchema = z.object({
  items: z.array(z.object({
    inventoryItemId: z.string().cuid(),
    quantity: z.number().int().positive().max(999)
  })).min(1).max(100),
  paymentMethod: z.enum(['cash', 'card']),
  amountReceived: z.number().nonnegative().optional()
}).strict()
```

- [ ] **Step 1: Write failing sale service tests**

Cover:

- prices/totals always come from database
- cashier ID in unknown client fields is rejected
- insufficient stock rolls back sale, stock and audit
- successful sale creates items, decrements stock, creates movements and one `SystemActionLog`
- cash payment rejects amount below total
- admin can create sale

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- src/lib/pos/sale-service.test.ts`

Expected: FAIL because service does not exist.

- [ ] **Step 3: Implement transaction**

Inside one `prisma.$transaction`:

1. Normalize duplicate item IDs by summing quantity.
2. Read current inventory records.
3. Atomically decrement with `updateMany({ where: { id, stock: { gte: quantity } } })`.
4. Abort unless every update count equals `1`.
5. Calculate Decimal subtotal/tax/total server-side.
6. Create sale and items.
7. Create inventory movements.
8. Create action log with authenticated actor.

- [ ] **Step 4: Write and implement route tests**

POST requires `pos:create`. GET returns all sales for admin and only `cashierAuthUserId = actor.userId` for cashier.

- [ ] **Step 5: Verify**

Run:

```powershell
npm test -- src/lib/pos app/api/pos
npm run typecheck
npm run lint
```

Expected: all pass.

---

### Task 10: POS and Inventory UI

**Files:**
- Create: `app/(authenticated)/pos/page.tsx`
- Create: `app/(authenticated)/pos/pos-client.tsx`
- Create: `app/(authenticated)/inventario/page.tsx`
- Create: `app/(authenticated)/inventario/inventory-client.tsx`

**Interfaces:**
- Consumes: `GET /api/pos/inventory`
- Consumes: `GET/POST /api/pos/sales`

- [ ] **Step 1: Build server guards**

Both pages require `admin` or `cashier`. Inventory is read-only for cashier.

- [ ] **Step 2: Build POS client**

Provide:

- product search
- numeric quantity input
- cart add/remove buttons
- payment method
- cash amount
- calculated preview marked as provisional
- submit state preventing double charge
- accessible error/success `aria-live`
- completed sale number and authenticated cashier username

Every button must include an explicit `type` and `handle...` event handler.

- [ ] **Step 3: Build inventory client**

Read-only responsive list with SKU, product, stock, price and aisle. Do not expose inventory mutation to cashier.

- [ ] **Step 4: Verify static quality**

Run:

```powershell
npm run typecheck
npm run lint
npm run build
```

Expected: all exit `0`.

---

### Task 11: Documentation and Secret Handoff

**Files:**
- Modify: `README.md`
- Modify: `docs/manual-tecnico/manual-tecnico-erp-supermercado.md`
- Modify: `docs/manual-usuario/manual-usuario-erp-supermercado.md`
- Modify: `docs/operaciones/release-runbook-vercel.md`

- [ ] **Step 1: Document required Supabase data**

Public:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Private:

- `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL`
- `BOOTSTRAP_ADMIN_PASSWORD`
- `BOOTSTRAP_CASHIER_PASSWORD`

State explicitly that secrets are configured locally/Vercel and are not pasted into chat or committed.

- [ ] **Step 2: Document Supabase dashboard steps**

Include:

1. Set Site URL and redirect URLs.
2. Enable Custom Access Token Hook created by migration.
3. Confirm RLS policies.
4. Use Transaction pooler URL for Vercel.
5. Add all server secrets to Development/Preview/Production as applicable.
6. Run migration deploy and bootstrap once.

- [ ] **Step 3: Document user flows**

Admin login, cashier login, logout, POS sale, inventory read-only, denied admin access and audit lookup.

- [ ] **Step 4: Scan for exposed secrets**

Run:

```powershell
rg "SUPABASE_SERVICE_ROLE_KEY=.*[^=]|BOOTSTRAP_(ADMIN|CASHIER)_PASSWORD=.*[^=]|NEXT_PUBLIC_APP_INTERNAL_API_TOKEN|dev-internal-token" .
```

Expected: no password/key/token literals in versioned source; historical design text may name the user-selected password and must be redacted if intended for publication.

---

### Task 12: Full Verification and Browser Runtime Check

**Files:**
- Modify only files required by failures found during verification

- [ ] **Step 1: Run complete static/test suite**

```powershell
npm test
npm run prisma:validate
npm run prisma:generate
npm run lint
npm run typecheck
npm run build
npm run security:audit
```

Expected: all commands exit `0`; audit has no high/critical production vulnerability.

- [ ] **Step 2: Build and start Docker**

```powershell
docker compose build
docker compose up -d
docker compose ps
```

Expected: container `2x3crmtest` is healthy and publishes `${HOST_PORT:-3000}:3000`.

- [ ] **Step 3: Run database-dependent setup after secrets exist**

```powershell
npm run prisma:deploy
npm run bootstrap:users
```

Expected: migration succeeds and both usernames are upserted without printing passwords.

- [ ] **Step 4: Browser test admin**

Verify:

- login `admin`
- `/admin` loads persisted metrics
- Mastra settings save and survive refresh
- `/api/crm/audit` succeeds
- logout invalidates UI access
- browser console has no errors

- [ ] **Step 5: Browser test cashier**

Verify:

- login `cajero`
- redirect to `/pos`
- inventory is visible/read-only
- successful sale stores cashier username
- direct `/admin` access redirects or returns 403
- forged `x-role` cannot elevate
- browser console has no errors

- [ ] **Step 6: Verify persistence and rollback**

Restart container and confirm settings/sales/audit remain. Attempt overselling and confirm no sale, stock movement or action log was partially committed.

- [ ] **Step 7: Final diff review**

Check:

- no unrequested unrelated changes
- no secret values
- no mock branches in critical flows
- no client-controlled roles
- documentation matches implementation
