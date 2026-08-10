# Release Runbook - Vercel + Meta WhatsApp (2x3crmtest)

## 1. Pre Go-Live Checklist

- `npm ci`
- `npm run lint`
- `npm run typecheck`
- `npm run prisma:validate`
- `npm run build`
- `docker compose config`
- Variables de entorno cargadas en Vercel (prod y preview)
- Webhook Meta apuntando a URL productiva

## 2. Deploy Procedure

1. Validar branch de release.
2. Push a rama protegida con CI en verde.
3. Confirmar build en Vercel.
4. Promover release a produccion.
5. Ejecutar smoke tests:
   - `/api/health`
   - `/api/observability/metrics`
   - `/api/crm/dashboard` con `x-internal-token` + `x-role`
   - `/api/crm/audit?limit=5` con `x-internal-token` + `x-role=admin|supervisor|finance`
   - chat web en `/crm`
   - mensaje real de WhatsApp y respuesta

## 3. Rollback Procedure

1. Seleccionar deployment previo saludable en Vercel.
2. Promover deployment previo.
3. Confirmar salud endpoints.
4. Reenviar test WhatsApp de control.
5. Marcar incidente y abrir postmortem.

## 4. Incident Response

- Severidad alta:
  - webhook caido
  - respuestas incorrectas masivas
  - fuga de datos
- Acciones iniciales:
  - detener mensajes salientes automatizados
  - activar modo handoff humano
  - notificar responsables de producto y seguridad

## 5. Headers internos requeridos

Para endpoints sensibles backend:

- `x-internal-token: <APP_INTERNAL_API_TOKEN>`
- `x-role: <cashier|warehouse|finance|supervisor|admin>`

Sin esos headers el backend responde `401/403` con payload JSON estandarizado (`error.code`, `requestId`, `timestamp`).

## 6. Postmortem Minimum Fields

- Timeline del incidente
- Causa raiz
- Impacto por canal y modulo
- Mitigacion aplicada
- Acciones preventivas con owner y fecha
