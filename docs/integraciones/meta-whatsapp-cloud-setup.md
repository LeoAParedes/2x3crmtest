# Meta WhatsApp Cloud API Setup (2x3crmtest)

## Objetivo

Conectar el CRM a WhatsApp con costo minimo usando Meta Cloud API directa.

## Prerrequisitos

- Meta Business Manager activo
- WhatsApp Business Account (WABA)
- Numero verificado para pruebas/produccion
- App en Meta for Developers con producto WhatsApp habilitado

## Variables de entorno requeridas

Configurar en `.env` local y en Vercel Project Environment Variables:

- `META_APP_SECRET`
- `META_WEBHOOK_VERIFY_TOKEN`
- `META_ACCESS_TOKEN`
- `META_PHONE_NUMBER_ID`
- `META_BUSINESS_ACCOUNT_ID`
- `META_API_VERSION` (default `v21.0`)
- `APP_INTERNAL_API_TOKEN` (protege endpoint interno de envio)

## Endpoint de verificacion y eventos

- Verificacion webhook:
  - `GET /api/whatsapp/webhook`
- Eventos entrantes:
  - `POST /api/whatsapp/webhook`

## Paso a paso

1. Crear app en Meta for Developers.
2. Habilitar WhatsApp y obtener `Phone Number ID`.
3. Generar token de acceso de larga duracion.
4. Configurar webhook callback URL:
   - `https://<tu-dominio>/api/whatsapp/webhook`
5. Definir verify token en Meta y en `META_WEBHOOK_VERIFY_TOKEN`.
6. Suscribirse a eventos de mensajes.
7. Probar envio con endpoint interno `POST /api/whatsapp/send`.

## Seguridad minima

- Validar firma `x-hub-signature-256` con `META_APP_SECRET`
- Rate limiting por numero/cliente
- Idempotencia por `sourceMessageId`
- Redaccion de PII en logs de aplicacion

## Validacion operativa

- Mensaje WhatsApp -> webhook inbound -> orquestador -> reply outbound
- Conversacion visible en `/admin`
- Metricas visibles en `/api/observability/metrics`
