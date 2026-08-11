# 2x3crmtest - Especificacion Maestra ERP Supermercado

## 1) Vision de nueva era

`2x3crmtest` es una implementacion nueva (greenfield) para reemplazar por completo al sistema heredado en `C:\xampp2\htdocsuscores`.

El legado se considera referencia funcional e historica, no base tecnica de continuidad.

Objetivo: construir un ERP integral para supermercado con coherencia visual, arquitectura cloud-native y automatizacion inteligente omnicanal.

## 2) Alcance funcional del ERP

- Punto de venta (POS): ticket, devoluciones, caja, arqueo, medios de pago
- Inventarios: recepcion, transferencias, lotes, mermas, reposicion, alertas
- Finanzas: cuentas por cobrar/pagar, flujo de caja, conciliaciones, reportes
- Agente AI omnicanal: chat web y WhatsApp sobre un mismo cerebro conversacional (Mastra)
- Seguridad y auditoria: trazabilidad por usuario, terminal, evento y modulo

## 3) Arquitectura objetivo (Vercel-compatible + Docker local)

### 3.1 Componentes principales

- Frontend + BFF: Next.js (App Router) sobre Node.js
- API del dominio ERP: Route Handlers de Next.js + servicios internos tipados
- Capa de datos: PostgreSQL (modelo transaccional) + Redis (cache/rate limit/colas)
- Orquestacion AI: Mastra para flujos del agente, herramientas y memoria conversacional
- Integracion WhatsApp: webhook provider (Twilio WhatsApp o Meta Cloud API) hacia endpoints de Next.js
- Observabilidad: OpenTelemetry + logs estructurados + alertas

### 3.2 Renderizado dinamico y multi-viewport

- SSR/Server Components para vistas criticas (POS, finanzas, tableros)
- Streaming y suspense para tiempos de respuesta consistentes
- ISR/partial caching en pantallas no transaccionales
- Sistema responsive por breakpoints operativos:
  - `320-479`: handheld compacto
  - `480-767`: movil estandar
  - `768-1023`: tablet
  - `1024-1439`: desktop
  - `>=1440`: wide desktop / wallboard
- Tokens de diseno para tipografia, espaciado, color y densidad por rol

### 3.3 Coherencia estetica (fuentes heredadas para continuidad)

Fuentes detectadas en el sistema referencia:

- Primarias homepage/template: `Inter`, `Poppins`
- Fuentes complementarias detectadas en vistas internas: `Archivo`, `Crimson Text`, `Lexend Deca`, `Outfit`

Decision de nueva era:

- Base UI: `Inter` (texto operativo), `Poppins` (titulares)
- Opcionales de marca/departamento de diseno: `Outfit` o `Lexend Deca` para componentes promocionales
- Mantener un maximo de 2 familias activas por pantalla productiva para legibilidad y rendimiento

## 4) Stack tecnologico objetivo (optimizado a hoja de especificacion)

- Framework: Next.js (ecosistema Vercel)
- Lenguaje: TypeScript end-to-end
- UI: React + design tokens + TailwindCSS
- Datos: PostgreSQL + Prisma ORM
- Cache/colas: Redis + BullMQ
- AI Agent runtime: Mastra
- Mensajeria: WhatsApp Business (Twilio o Meta Cloud API)
- AuthN/AuthZ: NextAuth/Auth.js + RBAC por modulo
- Archivos/reportes: almacenamiento S3-compatible + generacion PDF/CSV/XLSX
- Seguridad app: Zod/Valibot, rate limiting, CSRF, headers CSP
- Observabilidad: OpenTelemetry, Sentry, dashboards operativos

## 5) Docker Compose y puertos (seccion tecnica)

### 5.1 Convencion de contenedor

- Imagen principal: `2x3crmtest:latest`
- Nombre del contenedor principal: `2x3crmtest`
- Definido en `docker-compose.yml`

### 5.2 Politica de puertos

- El runtime Node de Next.js escucha en `PORT=3000` dentro del contenedor
- El mapeo Compose expone `HOST_PORT:3000` (por defecto `3000:3000`)
- Esto permite:
  - Compatibilidad local en Docker
  - Paridad de ejecucion con runtime server de Vercel/Node
  - Sobrescritura de puerto host sin alterar la app interna (`HOST_PORT`)

### 5.3 Ejemplo de comportamiento

- `HOST_PORT=3000` -> acceso local `http://localhost:3000`
- `HOST_PORT=8080` -> acceso local `http://localhost:8080` con app interna intacta en `3000`

## 6) Agente AI con Mastra (Web + WhatsApp)

### 6.1 Patron de unificacion

Ambos canales consumen el mismo agente y herramientas:

- Canal Web Chat -> endpoint `/api/agent/chat`
- Canal WhatsApp -> endpoint `/api/whatsapp/webhook`
- Ambos invocan pipelines Mastra con:
  - contexto de cliente
  - estado de conversacion
  - reglas de negocio (inventario, pedidos, cobranzas, FAQs)

### 6.2 Casos de uso iniciales

- Consulta de productos, stock y sucursal
- Estado de pedido y pago
- Escalamiento a humano con handoff y trazabilidad
- Cobro asistido y recordatorios de pago

## 7) Cumplimiento normativo y calidad

## 7.1 ISO/IEC 25000 (SQuaRE)

Calidad de producto medida en:

- Adecuacion funcional (completitud de procesos ERP)
- Fiabilidad (error budget, degradacion controlada)
- Usabilidad (eficiencia por rol: cajero, almacen, contable, gerente)
- Eficiencia de rendimiento (latencia p95 por modulo)
- Seguridad (confidencialidad, integridad, trazabilidad)
- Mantenibilidad (modularidad, analisis, testabilidad)
- Portabilidad (entornos locales, staging, produccion)

### 7.2 ISO/IEC 15504 (SPICE)

Madurez de proceso aplicada en:

- Definicion de procesos de desarrollo y pruebas
- Evaluacion continua de capacidad por fase
- Medicion objetiva de cumplimiento
- Mejora iterativa basada en evidencia

## 8) Fases de desarrollo

Las 5 fases DevSecOps se detallan formalmente en:

- `docs/arquitectura/devsecops-5-fases.md`

## 9) Manuales y documentacion operativa

Base de conocimiento (indice buscable):

- `docs/README.md`

Manuales alineados a ISO/IEC/IEEE 26514 (tareas), ISO/IEC 25000 (usabilidad) e ISO/IEC 29110 (control de configuracion):

- Manual de usuario: `docs/manual-usuario/manual-usuario-erp-supermercado.md`
- Manual tecnico: `docs/manual-tecnico/manual-tecnico-erp-supermercado.md`
- Control documental: `docs/calidad/control-configuracion-documental.md`
- Guia de estilo: `docs/calidad/guia-estilo-documentacion.md`
- Registro de cambios docs: `docs/calidad/registro-cambios-documentacion.md`
- Revision ejecutiva estado actual: `docs/arquitectura/revision-ejecutiva-estado-actual.md`
- Plan de video de avances: `docs/video/estructura-video-avances-5-10min.md`

Regla: todo cambio de software que afecte una tarea de usuario actualiza el manual de usuario en el mismo ciclo de liberacion.

## 10) Estructura objetivo de directorio

```text
2x3crmtest/
  app/
  docs/
    README.md
    arquitectura/
    calidad/
    manual-usuario/
    manual-tecnico/
    integraciones/
    operaciones/
    video/
  docker-compose.yml
  Dockerfile
  .env.example
  README.md
```

## 11) Repositorio canonico

- [https://github.com/LeoAParedes/2x3crmtest](https://github.com/LeoAParedes/2x3crmtest)
