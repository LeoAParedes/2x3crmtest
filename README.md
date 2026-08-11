# 2x3 Operaciones (`2x3crmtest`)

ERP de supermercado para operación diaria de caja, inventario, finanzas y consultas por WhatsApp/web vía el agente **DavinciAi**.

**Producción:** [https://2x3crmtest.vercel.app](https://2x3crmtest.vercel.app)  
**Repositorio:** [github.com/LeoAParedes/2x3crmtest](https://github.com/LeoAParedes/2x3crmtest)

---

## Credenciales de acceso

Usuarios bootstrap (Supabase Auth + perfil Prisma). Emails locales del entorno:

| Usuario | Rol | Email | Contraseña |
|---------|-----|-------|------------|
| `admin` | Administrador | `admin@2x3crmtest.local` | `DavinciAi` |
| `cajero` | Cajero | `cajero@2x3crmtest.local` | `DavinciAi` |

Se crean o sincronizan con `npm run bootstrap:users` (usa `BOOTSTRAP_ADMIN_PASSWORD` y `BOOTSTRAP_CASHIER_PASSWORD` en `.env`).

---

## Cómo correr el proyecto

### Requisitos

- Node.js 20+
- Docker Desktop (opcional, para correr la app en contenedor)
- Proyecto Supabase con Auth y PostgreSQL

### 1. Variables de entorno

```powershell
Copy-Item .env.example .env
```

Completa al menos:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=
DIRECT_URL=
BOOTSTRAP_ADMIN_PASSWORD=DavinciAi
BOOTSTRAP_CASHIER_PASSWORD=DavinciAi
OPENAI_API_KEY=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
```

En Supabase Auth: Site URL y redirect `http://localhost:3000` (y la URL de Vercel en producción).

### 2. Base de datos y usuarios

```powershell
npm install
npm run prisma:deploy
npm run bootstrap:users
```

### 3. Desarrollo local

```powershell
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).

### 4. Docker

```powershell
docker compose up --build -d
```

### 5. Tests / calidad

```powershell
npm test
npm run lint
npm run typecheck
```

---

## Esquema de base de datos (Prisma / PostgreSQL)

Persistencia en **Supabase PostgreSQL** vía **Prisma**. Modelos principales:

| Dominio | Modelos |
|---------|---------|
| Auth / RBAC | `UserProfile` (`admin` \| `cashier`), gate de turno (`cashierGate`) |
| POS / caja | `CashSession`, `Sale`, `SaleItem`, `PosSettings` |
| Inventario | `InventoryItem`, `InventoryLot`, `InventoryMovement` |
| Compras | `Supplier`, `ProductSupplier`, `Purchase` |
| Finanzas | `Expense`, `FinanceAccount`, `Receivable`, `Payment`, `PaymentPromise` |
| Promociones | `Promotion`, `PromotionProduct`, `PromotionBundleItem` |
| CRM / agente | `Customer`, `CustomerChannel`, `Conversation`, `ConversationMessage`, `AgentAction`, `HandoffTicket` |
| Órdenes legacy/canal | `Order`, `OrderItem`, `ReturnCase` |
| Auditoría / AI | `SystemActionLog`, `ApprovalRequest`, `MastraSettings`, `ProcessedEvent` |

Fuente de verdad: `prisma/schema.prisma`. Migraciones en `prisma/migrations/`.

Flujo operativo típico: **abrir turno (`CashSession`) → cobro POS (`Sale` + descuento de stock) → bitácora → corte de caja**.

---

## Decisiones técnicas

### Plantilla de partida

El sistema partió de un **repositorio CRM privado previo** del mismo autor. De ahí se reutilizó la arquitectura de integración Twilio/WhatsApp, el ordenamiento de clases/componentes y la base de estilos (Tailwind + shell de portal), adaptados a un ERP de supermercado.

### Stack

| Capa | Elección |
|------|----------|
| App | Next.js (App Router) + TypeScript + Tailwind |
| Auth | Supabase Auth + perfiles Prisma (RBAC `admin` / `cashier`) |
| Datos | PostgreSQL (Supabase) + Prisma |
| AI | Mastra + OpenAI (`gpt-4.1-mini` por defecto en `MastraSettings`) |
| Mensajería | Twilio WhatsApp (producción) + Meta Business Suite |
| Deploy | Vercel + Docker Compose local |

### Twilio + Meta

Se eligió **Twilio** como canal de mensajería en producción por ser el camino más sencillo de implementar junto con **Meta Business Suite**. Se adquirió el **plan de USD 20**.

### Cursor Desktop (desarrollo)

Suscripción a **Cursor Desktop** con uso aproximado:

- **~83%** API integrada del plan
- **~15%** Grok Composer 2.5 (uso incluido del plan a menor costo relativo)

### OpenAI + Mastra + harness

Se adquirieron **USD 5 de API OpenAI** para el modelo que opera con **Mastra**, conectado a la base en Supabase, de modo que el operador (DavinciAi) tenga información real del sistema.

Se configuró un **harness especializado** para que el modelo:

1. Evalúe el esquema de base de datos / herramientas ERP permitidas
2. Formule respuestas con **datos reales de uso** (ventas, stock, gastos, etc.), no inventados

Configuración operativa en `MastraSettings` y herramientas en el código AI del proyecto (`src/lib/ai/`, rutas WhatsApp bajo `app/api/whatsapp/`).

---

## Módulos de la aplicación

- **POS** — cobro, IVA, promociones en ticket, efectivo/tarjeta/crédito
- **Caja** — apertura, corte, gates de cajero
- **Inventario** — catálogo, ajustes, merma/caducidad, importación CSV
- **Finanzas** — periodos, egresos, fondos, pasivo, compras/proveedores, promociones
- **Bitácora** — auditoría y reimpresión
- **CRM / DavinciAi** — chat web y WhatsApp con lectura de métricas ERP
- **Configuración** — IVA, chatbot, cajeros, turno

---

## Resumen ejecutivo (negocio)

Visión de producto y siguiente etapa — **sin** runbook técnico: [`resumen-ejecutivo.pdf`](./resumen-ejecutivo.pdf)
