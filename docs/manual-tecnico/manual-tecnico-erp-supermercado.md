# Manual técnico — ERP Supermercado 2x3crmtest

| Campo | Valor |
|-------|--------|
| **Título** | Manual técnico — ERP 2x3crmtest |
| **Producto** | `2x3crmtest` / 2x3 Operaciones |
| **Versión del software** | `1.0.0` |
| **Versión del documento** | `1.0.0-MT` |
| **Fecha** | 2026-08-11 |
| **ID** | `DOC-MT-001` |
| **Audiencia** | Desarrolladores, DevOps y personal de soporte técnico |
| **Índice KB** | [`docs/README.md`](../README.md) |
| **Control documental** | [`docs/calidad/control-configuracion-documental.md`](../calidad/control-configuracion-documental.md) |

> Este manual es de **enfoque técnico** (arquitectura e integración).  
> Para operación de tienda use el [manual de usuario](../manual-usuario/manual-usuario-erp-supermercado.md).

## 1) Arquitectura tecnica

La solucion es una implementacion nueva basada en Next.js (ecosistema Vercel), contenedorizada con Docker para desarrollo y despliegues controlados.

Capas:

- Presentacion: Next.js App Router (SSR + RSC)
- Aplicacion: Route Handlers y servicios de dominio tipados
- Datos: PostgreSQL + Redis
- AI/Automatizacion: Mastra (agente comun web/WhatsApp)
- Integraciones: proveedor WhatsApp, pagos, notificaciones

## 2) Stack oficial

- Node.js (runtime app)
- TypeScript
- Next.js
- React
- TailwindCSS (UI system)
- Prisma ORM
- PostgreSQL
- Redis
- Mastra

## 3) Contenedores y compose

Archivo: `docker-compose.yml`

Definicion principal:

- `image: 2x3crmtest:latest`
- `container_name: 2x3crmtest`

Puertos:

- Interno contenedor: `3000` (`PORT=3000`)
- Externo host: `${HOST_PORT:-3000}`
- Mapeo: `${HOST_PORT:-3000}:3000`

Interpretacion:

- Cambiar `HOST_PORT` no requiere cambiar el servidor interno
- El endpoint de salud esperado es `/api/health`

Configuracion Vercel:

- Archivo: `vercel.json`
- Region por defecto: `iad1`
- Runtime Node.js y `maxDuration` definidos para:
  - `app/api/whatsapp/webhook/route.ts`
  - `app/api/whatsapp/send/route.ts`
  - `app/api/crm/**/route.ts`

## 4) Variables de entorno base

Referencia: `.env.example`

- `HOST_PORT`
- `DATABASE_URL`
- `REDIS_URL`
- `NEXT_PUBLIC_BASE_URL`
- `APP_INTERNAL_API_TOKEN`
- `NEXT_PUBLIC_APP_INTERNAL_API_TOKEN` (solo para panel admin interno/local)
- `DATA_MODE`
- `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`
- `META_APP_SECRET`
- `META_WEBHOOK_VERIFY_TOKEN`
- `META_ACCESS_TOKEN`
- `META_PHONE_NUMBER_ID`
- `META_BUSINESS_ACCOUNT_ID`
- `META_API_VERSION`

## 5) Integracion Mastra y WhatsApp

### 5.1 Flujo web

- Cliente web envia mensaje a `/api/agent/chat`
- Endpoint ejecuta workflow de Mastra
- Mastra consulta herramientas ERP (stock, pedidos, cuentas)
- Respuesta renderizada en chat de pagina

### 5.2 Flujo WhatsApp

- Proveedor WhatsApp llama webhook `/api/whatsapp/webhook`
- Se normaliza payload al formato conversacional comun
- Se invoca el mismo workflow Mastra
- Se responde por API del proveedor

### 5.3 Beneficio de unificacion

- Una sola logica conversacional
- Menor desviacion entre canales
- Trazabilidad unica de conversaciones

### 5.4 Administracion de Mastra dentro del CRM

- Panel operativo en `/admin` para:
  - activar/desactivar runtime Mastra
  - cambiar `modelId`
  - editar instrucciones del agente
  - controlar permisos de acciones de escritura/financieras
  - ajustar limite de caracteres y locale por defecto
- API interna de gestion:
  - `GET /api/crm/mastra/settings`
  - `POST /api/crm/mastra/settings`
  - `GET /api/crm/audit`

## 6) Seguridad tecnica minima

- Autenticacion centralizada y sesiones seguras
- RBAC por modulo y accion
- Validacion estricta de input/output
- Rate limiting por endpoint sensible
- Headers de seguridad (CSP, HSTS, X-Frame-Options)
- Auditoria de eventos de negocio y acceso

Implementacion actual backend:

- Endpoints sensibles CRM y WhatsApp send (`/api/crm/*`, `POST /api/whatsapp/send`) usan autenticacion centralizada por headers:
  - `x-internal-token` (debe coincidir con `APP_INTERNAL_API_TOKEN`)
  - `x-role` (RBAC con roles `cashier`, `warehouse`, `finance`, `supervisor`, `admin`)
- Rate limits aplicados por endpoint sensible con llave por IP:
  - `crm:dashboard` 120 req/min
  - `crm:approvals:get` 90 req/min
  - `crm:approvals:post` 40 req/min
  - `crm:mastra-settings:get` 120 req/min
  - `crm:mastra-settings:post` 30 req/min
  - `crm:audit:get` 60 req/min
  - `whatsapp:send` 45 req/min
- Errores JSON consistentes:
  - `success: false`
  - `message`
  - `error.code` + `error.message`
  - `requestId` + `timestamp`
- Redaccion de PII en observabilidad:
  - `appLog` aplica mascara a telefonos/emails
  - auditoria de acciones guarda metadata redaccionada
- Trazabilidad:
  - Registro de acciones de agente (in-memory cap 1000)
  - Modo `DATA_MODE=db`: persiste en `AgentAction` (Prisma)
  - Endpoint `GET /api/crm/audit` con filtros (`limit`, `actionType`, `status`, `actorRole`, `from`, `to`) y RBAC

## 7) Calidad y proceso

Cumplimiento objetivo:

- ISO/IEC 25000 (calidad de producto)
- ISO/IEC 15504 (madurez de proceso)

El desglose operativo de fases esta en:

- `docs/arquitectura/devsecops-5-fases.md`

## 8) Procedimiento local sugerido

1. Copiar variables:
   - `.env.example` -> `.env`
2. Construir imagen:
   - `docker compose build`
3. Levantar servicio:
   - `docker compose up -d`
4. Verificar salud:
   - `http://localhost:<HOST_PORT>/api/health`
5. Validar endpoint sensible con headers tecnicos:
   - `x-internal-token: <APP_INTERNAL_API_TOKEN>`
   - `x-role: admin`

## 9) Referencia de migracion desde legado

El analisis abstracto del sistema previo esta en:

- `docs/arquitectura/analisis-heredado-uscores.md`

## 10) Frontend CRM/Backoffice operativo

### 10.1 Panel por rol en `/admin`

- El dashboard permite seleccionar rol activo (`cashier`, `warehouse`, `finance`, `supervisor`, `admin`) desde UI
- Cada rol muestra permisos habilitados y restricciones funcionales visibles en pantalla
- La carga de datos de backoffice usa cabecera `x-role` hacia:
  - `GET /api/crm/dashboard`
  - `GET /api/crm/mastra/settings`
- Las operaciones de escritura de runtime Mastra (`POST /api/crm/mastra/settings`) quedan habilitadas solo para `admin` y `supervisor` desde UI

### 10.2 Observabilidad visible

- El backoffice consume `GET /api/observability/metrics`
- Se renderizan widgets operativos para trafico conversacional, handoffs, riesgo de stock y aprobaciones
- La UI marca si las metricas del dashboard CRM y observabilidad estan sincronizadas

### 10.3 Consola omnicanal en `/crm`

- Cada respuesta del agente muestra metadata operativa:
  - `intent`
  - `runMode` (`mastra` o `fallback`)
  - estado de `handoff` y ticket asociado
  - estado HTTP/error cuando aplica
- La consola incluye acciones rapidas para pruebas funcionales:
  - inventario
  - pedidos
  - finanzas
  - devoluciones
  - handoff humano
- Se mantiene `sessionId` web y trazabilidad de errores de red/API para validacion operativa

### 10.4 Responsive UX

- `/admin` y `/crm` usan layout responsive por breakpoints (movil/tablet/desktop)
- Los bloques operativos cambian de columna y prioridad segun ancho disponible
- Los controles criticos (selector de rol, refresco, envio de chat) mantienen accesibilidad con `aria-label` y estados deshabilitados
