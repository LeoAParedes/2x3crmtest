# Diseno de Automatizacion Mastra (Web Chat + WhatsApp)

## Objetivo

Unificar la automatizacion conversacional en un solo motor de agente para:

- Chat embebido en la pagina
- Canal WhatsApp

## Arquitectura funcional

### Entradas

- `POST /api/agent/chat` (web)
- `POST /api/whatsapp/webhook` (WhatsApp provider)

### Normalizacion de mensajes

Cada entrada se transforma a un modelo comun:

- `channel` (`web` | `whatsapp`)
- `customerId`
- `sessionId`
- `message`
- `locale`
- `metadata`

### Orquestacion Mastra

Workflow principal:

1. Cargar contexto del cliente (si existe)
2. Clasificar intencion
3. Ejecutar herramientas ERP:
   - inventario
   - estado de pedido
   - pagos/cobranza
4. Aplicar politicas de respuesta (tono, limites, compliance)
5. Escalar a humano cuando corresponda
6. Persistir traza y respuesta

### Salidas

- Web: respuesta JSON/SSE al widget
- WhatsApp: respuesta hacia API del proveedor

## Herramientas del agente (tooling sugerido)

- `getInventory(productCode | query)`
- `getOrderStatus(orderId | phone)`
- `getAccountBalance(customerId)`
- `createHumanHandoff(ticketData)`

## Controles de seguridad

- Firma/verificacion de webhook (WhatsApp provider)
- Rate limiting por sesion y por origen
- Sanitizacion de entrada y salida
- Redaccion de datos sensibles en logs
- Autenticacion tecnica centralizada para APIs sensibles:
  - `x-internal-token`
  - `x-role` con RBAC

## Observabilidad de conversaciones

- Correlation ID por mensaje
- Latencia por paso de workflow
- Tasa de handoff a humano
- Tasa de resolucion en primer contacto
- Auditoria estructurada de acciones del agente:
  - `GET /api/crm/audit` con filtros
  - almacenamiento en memoria (mock) o `AgentAction` (db mode)
