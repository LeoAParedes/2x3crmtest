# Evolution API — WhatsApp (DavinciAi)

Canal **recomendado** para WhatsApp en 2x3crmtest. No requiere Twilio ni Meta.

## Webhook URL

Producción:

```
https://2x3crmtest.vercel.app/api/whatsapp/evolution/webhook
```

Local (túnel / ngrok):

```
https://<tu-host>/api/whatsapp/evolution/webhook
```

## Variables de entorno

| Variable | Requerida | Descripción |
|---|---|---|
| `EVOLUTION_API_URL` | sí | Base URL del servidor Evolution (sin `/` final) |
| `EVOLUTION_API_KEY` | sí | API key (`apikey` header en sendText) |
| `EVOLUTION_INSTANCE` | sí | Nombre de la instancia WhatsApp |
| `EVOLUTION_WEBHOOK_SECRET` | no | Si está definido, valida secreto entrante |
| `OPENAI_API_KEY` | sí (DavinciAi) | LLM del agente ERP |

## Configurar webhook en la instancia

1. Crea/conecta la instancia en Evolution (`EVOLUTION_INSTANCE`).
2. Set webhook:
   - **url:** `https://2x3crmtest.vercel.app/api/whatsapp/evolution/webhook`
   - **enabled:** `true`
   - **events:** `MESSAGES_UPSERT` (mínimo)
   - **webhook_by_events:** `false`
3. Opcional: header `x-evolution-secret` = valor de `EVOLUTION_WEBHOOK_SECRET`.
4. En Vercel, define las env vars y redespliega.

Ejemplo vía API Evolution:

```bash
curl -X POST "$EVOLUTION_API_URL/webhook/set/$EVOLUTION_INSTANCE" \
  -H "apikey: $EVOLUTION_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://2x3crmtest.vercel.app/api/whatsapp/evolution/webhook",
    "webhook_by_events": false,
    "webhook_base64": false,
    "events": ["MESSAGES_UPSERT"]
  }'
```

## Flujo

1. Evolution envía `messages.upsert` / `MESSAGES_UPSERT` al webhook.
2. Se parsea teléfono + texto (`conversation` o `extendedTextMessage`).
3. Se ignora `fromMe`, grupos (`@g.us`) y mensajes sin texto.
4. `runCrmAgent` → DavinciAi con tools ERP whitelisted.
5. Respuesta vía `POST /message/sendText/{instance}`.

## Verificar

1. Env vars presentes en Vercel.
2. Instancia Evolution conectada (QR / estado open).
3. Webhook apuntando al URL de arriba.
4. Mensaje: `¿cuánto vendimos hoy?` → respuesta con cifra real del ERP.
