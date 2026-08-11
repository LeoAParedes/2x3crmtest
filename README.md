# 2x3crmtest

ERP de supermercado **2x3 Operaciones** (versión `1.0.0`).

## Documentación

- [Base de conocimiento](docs/README.md) — índice por tarea y por rol
- [Manual de usuario](docs/manual-usuario/manual-usuario-erp-supermercado.md) — cómo lograr objetivos en el sistema (ISO/IEC/IEEE 26514)
- [Manual técnico](docs/manual-tecnico/manual-tecnico-erp-supermercado.md) — arquitectura, APIs y despliegue
- [Control de configuración documental](docs/calidad/control-configuracion-documental.md) — versiones y aprobación (ISO/IEC 29110)

## Requisitos

- Docker Desktop en ejecución
- Un proyecto de Supabase con Auth habilitado
- Node.js 20+ y npm (solo para migrar la base de datos y crear los usuarios iniciales)

## Configuración

1. Copia el archivo de ejemplo:

   ```powershell
   Copy-Item .env.example .env
   ```

2. Completa en `.env` los valores de Supabase:

   ```dotenv
   NEXT_PUBLIC_SUPABASE_URL=https://TU_PROYECTO.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=tu_publishable_key
   SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key
   DATABASE_URL=tu_connection_string_de_supabase
   BOOTSTRAP_ADMIN_PASSWORD=tu_password_admin
   BOOTSTRAP_CASHIER_PASSWORD=tu_password_cajero
   ```

3. En Supabase, configura `http://localhost:3000` como **Site URL** y como URL de redirección permitida.

## Preparar la base de datos

Instala las dependencias, aplica las migraciones y crea los usuarios iniciales:

```powershell
npm install
npm run prisma:deploy
npm run bootstrap:users
```

Ejecuta `npm run bootstrap:users` una sola vez por entorno, o de nuevo únicamente si necesitas sincronizar esas cuentas.

## Ejecutar con Docker

Construye e inicia la aplicación:

```powershell
docker compose up --build -d
```

Abre [http://localhost:3000](http://localhost:3000).

Para consultar el estado del contenedor:

```powershell
docker compose ps
```

Para detenerlo:

```powershell
docker compose down
```
