# 2x3crmtest - ERP Supermercado (Nueva Era)

Este repositorio define el sucesor de `C:\xampp2\htdocsuscores` como una implementacion nueva orientada a ERP de supermercado:

- Punto de venta (POS)
- Inventarios
- Finanzas
- Agente AI unificado para Web Chat y WhatsApp (Mastra)

## Repositorio GitHub

- [https://github.com/LeoAParedes/2x3crmtest](https://github.com/LeoAParedes/2x3crmtest)

## Objetivo de esta base

Crear una especificacion integral y una base tecnica inicial para una migracion total (greenfield), manteniendo el sistema actual solo como referencia historica/funcional.

## Documentacion principal

- `docs/arquitectura/2x3crmtest-master-spec.md`
- `docs/arquitectura/analisis-heredado-uscores.md`
- `docs/arquitectura/devsecops-5-fases.md`
- `docs/arquitectura/mastra-whatsapp-webchat.md`
- `docs/manual-usuario/manual-usuario-erp-supermercado.md`
- `docs/manual-tecnico/manual-tecnico-erp-supermercado.md`
- `docs/video/estructura-video-avances-5-10min.md`
- `docs/integraciones/meta-whatsapp-cloud-setup.md`
- `docs/operaciones/release-runbook-vercel.md`

## Rutas principales implementadas

- `GET /api/health`
- `POST /api/agent/chat`
- `GET /api/whatsapp/webhook`
- `POST /api/whatsapp/webhook`
- `POST /api/whatsapp/send` (interno)
- `GET /api/crm/dashboard`
- `GET /api/crm/approvals`
- `POST /api/crm/approvals`
- `GET /api/crm/mastra/settings`
- `POST /api/crm/mastra/settings`
- `GET /api/crm/audit`
- `GET /api/observability/metrics`
- UI chat web: `/crm`
- UI dashboard ops: `/admin`

## Contenedorizacion (Docker Compose)

El proyecto usa Docker Compose y define el contenedor principal con nombre exacto:

- `container_name: 2x3crmtest`

Ver `docker-compose.yml` y `Dockerfile`.

## Notas de estado

Esta entrega es la redefinicion arquitectonica y documental completa del sistema para iniciar implementacion en fases con enfoque DevSecOps y cumplimiento de calidad (ISO/IEC 25000, ISO/IEC 15504).

## Autenticación y autorización

La aplicación usa sesiones SSR de Supabase. Las rutas protegidas resuelven la
identidad desde cookies verificadas y el rol desde `UserProfile`; no aceptan
roles ni tokens de autorización enviados mediante headers del navegador.

- Roles disponibles: `admin` y `cashier`
- `admin` accede a administración y POS
- `cashier` accede al POS y a lecturas de inventario
- Configura las variables de `.env.example` sin versionar secretos
- Después de configurar Supabase y PostgreSQL, ejecuta `npm run bootstrap:users`
  una sola vez para crear o sincronizar `admin` y `cajero`
