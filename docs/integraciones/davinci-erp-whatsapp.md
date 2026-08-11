# DavinciAi — harness ERP seguro (WhatsApp)

## Arquitectura

```
WhatsApp (Twilio o Meta)
        │
        ▼
/api/whatsapp/twilio/webhook   OR   /api/whatsapp/webhook
        │
        ▼
runCrmAgent → runDavinciErpAgent (OpenAI tool calling)
        │
        ▼
Whitelist ERP tools (Zod + Prisma) → hechos numéricos reales
        │
        ▼
Respuesta en español (solo cifras de tools)
```

El modelo **nunca** recibe SQL ni acceso arbitrario a la DB. Solo puede invocar herramientas de la whitelist configurada en admin.

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

Persistencia: `MastraSettings.allowedErpTools` (JSON) vía `GET/POST /api/crm/mastra/settings` (solo admin).

## Webhooks

### Twilio (patrón demo-reply / TwiML)

En Twilio Console → WhatsApp → “When a message comes in”:

`POST https://<tu-host>/api/whatsapp/twilio/webhook`

Responde TwiML:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response><Message>...</Message></Response>
```

Variables de entorno (servidor, nunca en cliente):

- `OPENAI_API_KEY` (requerida para DavinciAi)
- `TWILIO_AUTH_TOKEN` (opcional; si existe valida `X-Twilio-Signature`)
- `TWILIO_ACCOUNT_SID` (opcional, documentación/operación)

Referencia demo Twilio: `https://timberwolf-mastiff-9776.twil.io/demo-reply`

### Meta Cloud API (existente)

`GET/POST /api/whatsapp/webhook` — firma Meta + outbound Graph API.

## Verificación rápida

1. Configura `OPENAI_API_KEY` y despliega/migra (`prisma migrate deploy`).
2. En `/admin`, deja activo el agente y las métricas deseadas.
3. Apunta Twilio al webhook Twilio de arriba (o usa Meta).
4. Envía por WhatsApp: `¿cuánto vendimos hoy?`
5. Debes recibir un total en MXN proveniente de ventas `completed` del día (America/Mexico_City), no un número inventado.
