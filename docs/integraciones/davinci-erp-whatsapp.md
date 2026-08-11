# DavinciAi — harness ERP seguro (WhatsApp)

## Arquitectura

```
WhatsApp (Evolution API — recomendado; Meta; Twilio secundario)
        │
        ▼
/api/whatsapp/evolution/webhook
    OR  /api/whatsapp/webhook
    OR  /api/whatsapp/twilio/webhook
        │
        ▼
runCrmAgent → runDavinciErpAgent (OpenAI tool calling)
        │
        ▼
Whitelist ERP tools (Zod + Prisma) → hechos numéricos reales
        │
        ▼
Respuesta en español (solo cifras de tools)
        │
        ▼
Outbound: Evolution sendText / Meta Graph / TwiML
```

El modelo **nunca** recibe SQL ni acceso arbitrario a la DB. Solo puede invocar herramientas de la whitelist configurada en admin.

**Twilio no es requerido.** El canal preferido es Evolution API.

## Herramientas whitelist

| ID | Descripción |
|---|---|
| `sales_total_today` | Ventas de hoy |
| `sales_total_period` | Ventas por `day` / `week` / `month` |
| `stock_by_product_search` | Stock por nombre/SKU |
| `top_product_period` | Productos más vendidos |
| `cash_flow_period` | Ingresos / egresos / neto |
| `low_stock_count` | Conteo de stock bajo |
| `expenses_total_period` | Egresos del periodo |
| `average_ticket_period` | Ticket promedio |

## Config UI

Panel administrativo → **Control de Mastra / DavinciAi** (`/admin`):

- Agente activo
- Modelo / instrucciones (existentes)
- Checkboxes de métricas ERP permitidas
- Nota de canales: Evolution (recomendado), Meta, Twilio (secundario)

Persistencia: `MastraSettings.allowedErpTools` (JSON) vía `GET/POST /api/crm/mastra/settings` (solo admin).

## Webhooks

### Evolution API (recomendado / primario)

Webhook URL (producción):

`POST https://2x3crmtest.vercel.app/api/whatsapp/evolution/webhook`

En Evolution Manager / API → Instance → Webhook:

| Campo | Valor |
|---|---|
| URL | `https://2x3crmtest.vercel.app/api/whatsapp/evolution/webhook` |
| Enabled | `true` |
| Events | al menos `MESSAGES_UPSERT` |
| webhook_by_events | `false` (un solo endpoint) |
| Headers (opcional) | `x-evolution-secret: <EVOLUTION_WEBHOOK_SECRET>` |

Variables de entorno (servidor / Vercel):

- `OPENAI_API_KEY` (requerida para DavinciAi)
- `EVOLUTION_API_URL` — base URL del servidor Evolution (sin slash final), p.ej. `https://evolution.example.com`
- `EVOLUTION_API_KEY` — API key global o de instancia
- `EVOLUTION_INSTANCE` — nombre de la instancia WhatsApp
- `EVOLUTION_WEBHOOK_SECRET` (opcional) — si está set, el webhook exige coincidencia en header `x-evolution-secret` / `x-webhook-secret` / `apikey`, o `apikey` del body

Outbound reply:

`POST {EVOLUTION_API_URL}/message/sendText/{EVOLUTION_INSTANCE}`

```json
{ "number": "5215512345678", "text": "..." }
```

Header: `apikey: {EVOLUTION_API_KEY}`

Referencia: [Evolution API](https://github.com/evolution-foundation/evolution-api)

### Meta Cloud API (existente)

`GET/POST /api/whatsapp/webhook` — firma Meta + outbound Graph API.

### Twilio (secundario / opcional)

En Twilio Console → WhatsApp → “When a message comes in”:

`POST https://<tu-host>/api/whatsapp/twilio/webhook`

Responde TwiML. **No es necesario** si usas Evolution.

- `TWILIO_AUTH_TOKEN` (opcional; si existe valida `X-Twilio-Signature`)
- `TWILIO_ACCOUNT_SID` (opcional)

## Verificación rápida

1. Configura `OPENAI_API_KEY`, `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE` y despliega.
2. En Evolution, apunta el webhook de la instancia a `/api/whatsapp/evolution/webhook` con evento `MESSAGES_UPSERT`.
3. En `/admin`, deja activo el agente y las métricas deseadas.
4. Envía por WhatsApp: `¿cuánto vendimos hoy?`
5. Debes recibir un total en MXN proveniente de ventas `completed` del día (America/Los_Angeles, 00:00 local), no un número inventado.
