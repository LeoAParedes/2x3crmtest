# Supabase Auth, Roles y Auditoría de Ventas — Diseño

Fecha: 2026-08-10

## Objetivo

Implementar autenticación y autorización para el ERP del supermercado mediante Supabase Auth, con persistencia obligatoria en PostgreSQL, dos roles iniciales (`admin` y `cashier`) y trazabilidad de qué cajero realizó cada venta.

## Alcance

Esta fase incluye:

- Login interno por nombre de usuario y contraseña
- Sesiones SSR seguras administradas por Supabase Auth
- Protección server-side de páginas y APIs
- RBAC para administrador y cajero
- Perfiles de usuario persistidos
- Usuarios iniciales `admin` y `cajero`
- Asociación obligatoria de cada venta con el cajero autenticado
- Registro de acciones críticas
- Validación tipada de inputs y outputs
- Verificación de errores de ejecución y consola del navegador

Esta fase no implementa todavía el POS completo ni los demás módulos funcionales. Deja los contratos, permisos y persistencia necesarios para que dichos módulos se construyan sin omitir seguridad.

## Decisiones de arquitectura

### Supabase Auth como autoridad de identidad

Supabase Auth será responsable de:

- Hash seguro de contraseñas
- Emisión y renovación de JWT
- Sesiones de usuario
- Revocación y bloqueo de identidad

El frontend nunca recibirá claves privilegiadas.

### Username sobre identidad email interna

La pantalla acepta `username`, pero Supabase Auth autentica con email y contraseña:

- `admin` → `admin@2x3crmtest.local`
- `cajero` → `cajero@2x3crmtest.local`

La conversión username-email se ejecuta en el servidor. No se acepta email arbitrario desde el formulario.

### Contraseña predeterminada

Ambos usuarios utilizan la contraseña compartida acordada por el propietario, suministrada únicamente mediante variables de entorno.

Restricciones:

- No escribir la contraseña en código, migraciones, documentación versionada ni logs
- Leerla desde variables locales de bootstrap
- Enviar la contraseña únicamente al Admin API de Supabase por conexión TLS
- Supabase almacena su hash; la aplicación no mantiene una copia

La contraseña compartida y permanente reduce la seguridad frente a credenciales únicas. Esta excepción queda documentada.

### Fuente de verdad de roles

La tabla `user_profiles` será la fuente administrable de:

- `auth_user_id`
- `username`
- `role`
- `is_active`
- marcas de tiempo

Los roles válidos son:

- `admin`
- `cashier`

Un Custom Access Token Hook añadirá `user_role` al JWT para políticas RLS. Las operaciones críticas además consultarán el perfil persistido para aplicar bloqueos y cambios de rol inmediatamente.

### Persistencia obligatoria

Los flujos protegidos no podrán usar datos mock ni stores en memoria.

Si la base de datos o Supabase no están configurados:

- el login falla de forma explícita
- las APIs críticas responden con error operacional tipado
- no se ejecutan ventas, cambios de rol ni acciones financieras

## Componentes

### Clientes Supabase

- Cliente navegador: publishable key únicamente
- Cliente servidor SSR: publishable key + cookies seguras
- Cliente administrativo: service role key, solo en servidor y únicamente para bootstrap/administración autorizada

### Proxy de sesión

El proxy de Next.js:

- renueva cookies de sesión con `@supabase/ssr`
- verifica claims
- redirige usuarios no autenticados a `/login`
- no reemplaza la autorización dentro de cada Server Action/API

### Servicio de autorización

Una utilidad server-only devuelve:

```ts
type AuthenticatedActor = {
  userId: string
  username: string
  role: 'admin' | 'cashier'
}
```

Las APIs declaran permisos requeridos y rechazan por defecto.

## Matriz de permisos

### Administrador

- Acceso total
- Administración de usuarios y roles
- POS
- Consulta y actualización de inventario
- Finanzas
- Configuración de Mastra y WhatsApp
- Auditoría completa

### Cajero

- Acceso al POS
- Creación de ventas
- Consulta de inventario
- Consulta de sus propias ventas
- Sin acceso a finanzas
- Sin administración de usuarios
- Sin cambios de inventario
- Sin configuración de Mastra/WhatsApp
- Sin auditoría global

## Modelo de datos

### UserProfile

- `id`
- `authUserId` UUID único
- `username` único
- `role`
- `isActive`
- `createdAt`
- `updatedAt`

### Sale

- `id`
- `saleNumber` único
- `cashierAuthUserId`
- `cashierUsername`
- `subtotal`
- `tax`
- `total`
- `status`
- `createdAt`

### SaleItem

- `id`
- `saleId`
- `inventoryItemId`
- `sku`
- `productName`
- `quantity`
- `unitPrice`
- `lineTotal`

### SystemActionLog

- `id`
- `actorAuthUserId`
- `actorUsername`
- `actorRole`
- `action`
- `entityType`
- `entityId`
- `status`
- `metadata` redactada
- `createdAt`

## Contrato de venta

```ts
type CreateSaleInput = {
  items: Array<{
    inventoryItemId: string
    quantity: number
  }>
  paymentMethod: 'cash' | 'card'
  amountReceived?: number
}
```

El servidor ignora cualquier `cashierId` enviado por el navegador. Siempre toma el cajero de la sesión verificada.

## Procesamiento transaccional

Dentro de una transacción PostgreSQL:

1. Validar input con Zod
2. Validar sesión y rol
3. Consultar productos y stock con bloqueo transaccional apropiado
4. Calcular precios y totales en servidor
5. Crear venta asociada al actor autenticado
6. Crear partidas
7. Descontar inventario
8. Crear movimientos de inventario
9. Crear `SystemActionLog`
10. Confirmar transacción

Un error revierte toda la operación.

## Botones y formularios

Cada acción interactiva debe:

- usar `<button type="button">` o `<button type="submit">` explícitamente
- tener nombre de handler `handle...`
- consumir un input tipado
- validar con Zod en servidor
- mostrar estados `idle`, `loading`, `success`, `error`
- impedir doble envío
- exponer mensajes accesibles mediante `aria-live`
- no confiar en campos ocultos para identidad o rol

## Seguridad de Supabase

### Datos públicos permitidos en navegador

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

La publishable key no es un secreto; su seguridad depende de RLS correctamente configurado.

### Datos privados obligatorios solo en servidor

- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DB_URL` o conexión PostgreSQL equivalente para Prisma
- `BOOTSTRAP_ADMIN_PASSWORD`
- `BOOTSTRAP_CASHIER_PASSWORD`

### Datos que nunca deben registrarse

- Contraseñas
- Service role key
- Tokens de acceso o refresh
- Cookies de sesión
- Connection strings completas

## RLS

Se habilita RLS en tablas expuestas.

Principios:

- `admin` puede operar todos los recursos
- `cashier` puede consultar inventario
- `cashier` puede consultar ventas cuyo `cashier_auth_user_id = auth.uid()`
- La creación de ventas se realiza mediante servidor/transacción controlada
- Solo administradores pueden gestionar perfiles y roles
- Nunca autorizar con `raw_user_meta_data`, porque el usuario puede modificarlo

## Manejo de errores

- `401`: sesión ausente o inválida
- `403`: rol sin permiso o usuario inactivo
- `409`: username duplicado, stock insuficiente o conflicto transaccional
- `422`: input inválido
- `503`: Supabase/PostgreSQL no configurado o no disponible

Los errores públicos no incluyen stack traces, secretos ni PII.

## Pruebas

Se aplicará TDD para:

- normalización segura de username
- rechazo de usuarios no permitidos
- permisos por rol
- rechazo de cajero en rutas administrativas
- venta asociada al actor autenticado
- rechazo de `cashierId` proporcionado por cliente
- validación de cantidades y pagos
- generación de audit log
- rollback ante stock insuficiente

## Validación de runtime

- `npm run test`
- `npm run prisma:validate`
- `npm run prisma:generate`
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- prueba de navegador:
  - login admin
  - login cajero
  - redirecciones por rol
  - logout
  - intento de acceso no autorizado
  - consola sin errores
  - red sin respuestas inesperadas 4xx/5xx

## Criterios de aceptación

- `admin` accede a todo
- `cajero` solo accede a POS e inventario de consulta
- Las sesiones se validan server-side
- Los roles no provienen de headers controlables por el navegador
- Cada venta guarda el usuario cajero autenticado
- Cada venta genera un log de acción
- No existe fallback en memoria para operaciones críticas
- Ninguna clave privada aparece en el bundle del navegador
- Build, tipos, lint, pruebas y validación Prisma pasan
