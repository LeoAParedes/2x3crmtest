# Portal unificado y shell del ecosistema

## Objetivo

Convertir el inicio de `2x3crmtest` en una experiencia coherente de ERP: un
portal público con identidad visual propia y una aplicación autenticada sin
selección intermedia de módulo. La persona ingresa y llega directamente a su
área de trabajo; el asistente permanece disponible como una burbuja flotante
minimizable.

## Alcance

- Rediseñar `/` como portal de presentación del ecosistema.
- Mantener `/login` como punto de autenticación, actualizado al lenguaje visual
  del portal.
- Redirigir automáticamente al administrador a `/admin` y al cajero a `/pos`.
- Proveer una navegación persistente adaptada al rol.
- Incorporar un asistente flotante y minimizable en todas las rutas protegidas.
- Conservar `/crm` como consola técnica de detalle mientras la experiencia
  operativa usa el chat flotante.

No incluye nuevos módulos de inventario, POS, finanzas ni cambios al
orquestador Mastra.

## Arquitectura de interfaz

### Portal público

`/` será una página pública, responsive y de carga ligera compuesta por:

1. Una cabecera con marca, contexto de “supermercado conectado” y acceso.
2. Un hero editorial con una sola acción principal: iniciar sesión.
3. Una vista de las capacidades conectadas: caja, inventario, finanzas y
   asistente.
4. Un bloque que explica la continuidad entre operación, administración y
   conversaciones.

La identidad combinará azul noche para estructura, verde para estados
operativos y acentos cálidos para dar carácter sin reducir legibilidad.

### Shell autenticado

Se extraerá un shell reutilizable para las rutas protegidas:

- Identidad de producto y navegación primaria.
- Menú de módulos condicionado por el rol efectivo del perfil.
- Identidad del usuario y cierre de sesión.
- Área de contenido de cada módulo.
- `FloatingAssistant`, montado una sola vez en el shell.

El administrador verá Dashboard, POS e Inventario. El cajero verá POS e
Inventario de consulta. No se confiará en ocultar enlaces como mecanismo de
autorización: las guardas de ruta y API actuales siguen siendo la fuente de
verdad.

### Asistente flotante

`FloatingAssistant` será un componente cliente que:

- inicia minimizado y se abre desde un botón fijo accesible;
- ofrece cierre/minimización, foco gestionado y etiqueta ARIA;
- envía mensajes a `POST /api/agent/chat` usando el contrato existente;
- muestra estados de envío, respuesta y error;
- no expone metadatos técnicos de depuración en la interfaz operativa;
- mantiene la conversación durante la visita actual, sin crear persistencia
  adicional en esta entrega.

Los registros y métricas existentes se consultan desde el dashboard y la
consola `/crm`; abrir o cerrar la burbuja no modifica su semántica.

## Flujo

1. Una visita sin sesión abre `/`.
2. La acción principal navega a `/login`.
3. El servidor valida las credenciales de Supabase y el perfil persistido.
4. El administrador se redirige a `/admin`; el cajero se redirige a `/pos`.
5. El shell autenticado resuelve nuevamente la identidad y el rol antes de
   renderizar la navegación y el contenido.
6. La burbuja puede consultar al agente sin sacar al usuario de su tarea.
7. El cierre de sesión elimina la sesión y vuelve a la página de login.

## Manejo de errores

- Un usuario sin sesión se redirige a `/login`.
- Un perfil inactivo o con rol inválido conserva el mensaje genérico de
  credenciales incorrectas.
- Si el agente no responde, la burbuja conserva el mensaje escrito y muestra
  un error recuperable sin afectar el módulo visible.
- La navegación muestra solo destinos autorizados, mientras las rutas y APIs
  siguen validando el rol en servidor.

## Validación

- Pruebas unitarias de destino de login por rol y navegación construida por rol.
- Prueba de interacción del asistente para minimizar, abrir y manejar una
  respuesta fallida.
- Verificación responsive del portal, login, dashboard y POS.
- Verificación manual con sesiones de administrador y cajero para confirmar
  redirección directa, navegación autorizada y disponibilidad de la burbuja.
