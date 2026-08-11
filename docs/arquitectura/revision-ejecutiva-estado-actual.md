# Revisión ejecutiva del estado actual — ERP 2x3crmtest

**Fecha:** 11 de agosto de 2026  
**Referencia de esquema:** `docs/arquitectura/2x3crmtest-master-spec.md`  
**Alcance:** inventario funcional de pantallas, entradas de datos, acciones y flujos entre módulos frente a la visión maestra del ERP.

---

## 1. Dictamen ejecutivo

`2x3crmtest` ya opera como un ERP de supermercado en producción parcial sobre Next.js + Supabase + Prisma, con un portal unificado (`WorkspaceShell`), dos roles reales (`admin` / `cashier`) y un ciclo operativo cerrado para **turno de caja → venta POS → descuento de inventario → bitácora → corte**.

Respecto al esquema maestro, el núcleo comercial (POS, inventarios operativos, finanzas de egreso/compra y agente omnicanal) está **implementado y usable**. Quedan brechas deliberadas o parciales en: caducidad persistente, aplicación de promociones en el cobro, CRM comercial completo, transferencias entre ubicaciones, conciliaciones bancarias avanzadas, Redis/BullMQ y observabilidad OpenTelemetry/Sentry.

| Dimensión del esquema maestro | Estado actual |
|-------------------------------|---------------|
| POS (ticket, caja, arqueo, medios de pago) | **Operativo** — efectivo y tarjeta; sin devoluciones UI dedicadas |
| Inventarios (recepción, ajustes, mermas, alertas) | **Operativo** — recepción vía Compras; caducidad solo local |
| Finanzas (CxC/CxP, flujo, reportes) | **Operativo parcial** — egresos, compras, CxP proveedor; sin conciliación bancaria formal |
| Agente AI omnicanal (Web + WhatsApp) | **Operativo** — consola `/crm` + webhooks; fuera del menú lateral |
| Seguridad y auditoría | **Operativo** — Supabase Auth + RBAC + Bitácora |
| Redis / BullMQ / OpenTelemetry | **Pendiente** respecto al stack objetivo |

---

## 2. Arquitectura implementada vs. objetivo

### 2.1 Lo que el esquema pedía

Frontend + BFF Next.js, PostgreSQL, Redis, Mastra, WhatsApp, Auth.js, observabilidad.

### 2.2 Lo que corre hoy

| Capa | Implementación vigente |
|------|------------------------|
| App | Next.js App Router (TypeScript + Tailwind) |
| Datos | PostgreSQL vía Prisma; hosting de auth/datos en **Supabase** |
| Auth | **Supabase Auth** (no NextAuth/Auth.js del esquema original) + perfiles Prisma con rol |
| RBAC | Dos roles: `admin` (`*`) y `cashier` (`pos:create`, `pos:view-own`, `inventory:view`) |
| AI | DavinciAi / Mastra settings + harness DB-only; chat web y WhatsApp (Twilio / Meta / Evolution) |
| Deploy | Docker Compose local + Vercel |
| Shell | Portal unificado con navegación por rol y bloqueo post-corte para cajero |

La desviación Auth.js → Supabase Auth es una decisión de implementación ya documentada en las specs de agosto 2026; el resto del stack objetivo (Redis, colas, OTel) aún no aparece como dependencia operativa.

---

## 3. Mapa de navegación y audiencia

### 3.1 Menú lateral (`WorkspaceShell`)

| Grupo | Ruta | Quién lo ve | Para qué sirve |
|-------|------|-------------|----------------|
| POS | `/pos` | Admin y cajero | Cobro de ticket |
| Dashboard | `/admin` | Solo admin | KPIs operativos y atajos de configuración |
| Bitácora | `/bitacora` | Admin y cajero | Auditoría y reimpresión de tickets |
| Inventarios | `/inventario` | Admin y cajero | Catálogo, altas, importación, ajustes |
| → Merma y Caducidad | `/inventario/merma-caducidad` | Admin y cajero | Salidas por merma + notas de caducidad |
| → Ajuste rápido | `/inventario?shortcut=ajuste` | Admin y cajero | Atajo a la vista de ajustes |
| Finanzas | `/finanzas` | Solo admin | Hub de ventas, flujo y submódulos |
| → Periodos | `/finanzas/periodos` | Solo admin | P&L, gráficas, registro de gastos |
| → Fondos activo | `/finanzas/fondos` | Solo admin | Lectura de caja abierta e historial de cortes |
| → Pasivo | `/finanzas/pasivo` | Solo admin | CRUD de gastos/compromisos |
| → Compras y Proveedores | `/finanzas/compras` | Solo admin | Entradas de compra y CxP |
| → Descuentos y promociones | `/finanzas/promociones` | Solo admin | Catálogo de promociones |
| Configuración | `/configuracion` | Solo admin | IVA, chatbot, cajeros, enlace a turno |
| → Cajeros | `/configuracion?tab=cajeros` | Solo admin | Alta de cuentas cajero |
| → Turno / Corte | `/configuracion?tab=turno` → `/caja` | Admin; cajero llega a `/caja` directo | Apertura y corte de turno |

### 3.2 Rutas existentes fuera del menú

| Ruta | Rol esperado | Observación |
|------|--------------|-------------|
| `/` | Público | Landing de marca |
| `/login` | Público | Autenticación |
| `/caja` | Admin / cajero | Turno y corte (entrada real del ciclo de caja) |
| `/crm` | Operativo / prueba | Consola del agente; **no** aparece en el menú |
| `/operaciones` | Admin / cajero | Hub del día; **no** aparece en el menú |
| `/inventario/importacion` | Admin | Importación CSV dedicada (también embebida en Inventario) |
| `/admin/cajeros` | Admin | Redirect a Configuración → Cajeros |

### 3.3 Controles globales del shell

- Expandir / contraer sidebar y menú móvil  
- **Carrito universal** → `/pos?openCart=1` (lee borrador `pos_draft`)  
- **Salir** → `POST /auth/logout`  
- Tras corte de cajero: navegación bloqueada; solo `/caja` + cerrar sesión  

---

## 4. Suite de módulos — pantallas, entradas y botones

### 4.1 Acceso

#### Portal `/`

- **Entrada:** ninguna.  
- **Acciones:** *Entrar al sistema* → `/login`.  
- **Estado:** implementado.

#### Login `/login`

| Campo | Uso |
|-------|-----|
| Usuario | Identificador (máx. 20); se normaliza a correo interno `@2x3crmtest.local` |
| Contraseña | 8–128 caracteres |

| Botón | Efecto |
|-------|--------|
| Iniciar sesión | Autentica en Supabase; redirige admin → `/admin`, cajero → `/pos` |
| Volver al portal | Regresa a `/` |

---

### 4.2 POS — `/pos`

**Propósito:** buscar productos, armar carrito, cobrar en efectivo o tarjeta y emitir ticket. Exige sesión de caja abierta.

#### Sin turno abierto (`PosOpenShift`)

| Campo | Uso |
|-------|-----|
| Fondo de apertura (MXN) | Float inicial (default 500) |

| Botón | Efecto |
|-------|--------|
| Abrir turno y vender | `POST /api/caja/session/open` y entra al cobro |

#### Con turno abierto

| Campo / control | Uso |
|-----------------|-----|
| Buscar SKU o producto | Filtra catálogo |
| Ordenar / dirección | Nombre, SKU, stock o precio |
| Modo unidad (pz / kg) | Pieza o peso; productos con peso forzado a kg |
| Cantidad | Entero (pz) o decimal (kg) |
| Método de pago | Efectivo o tarjeta |
| Monto recibido | Solo efectivo; calcula cambio |

| Botón | Efecto |
|-------|--------|
| Carrito | Abre / cierra panel de cobro |
| Agregar | Suma línea al carrito |
| − / + | Ajusta cantidad |
| Eliminar | Quita línea |
| Anterior / Siguiente | Paginación del catálogo |
| Cobrar y emitir ticket | `POST /api/pos/sales` — descuenta stock, actualiza caja, escribe bitácora |
| Ver ticket / Mostrar impresión | Reabre e imprime el comprobante |

**Pasa a:** Inventario (stock), Caja (totales del turno), Bitácora (`sale.create`), Finanzas (ventas del summary).

---

### 4.3 Caja — `/caja`

**Propósito:** abrir turno, consultar ventas del turno, ejecutar corte ciego y (admin) ver historial.

| Campo | Uso |
|-------|-----|
| Fondo inicial | Apertura de turno |
| Efectivo contado | Corte; obligatorio para confirmar |
| Notas | Opcional, hasta 500 caracteres |

| Botón | Efecto |
|-------|--------|
| Abrir turno | Crea `CashSession` |
| Ir al POS | Navega a `/pos` |
| Confirmar corte | Cierra sesión; cajero pasa a `must_logout` |
| Cerrar sesión | Solo post-corte; limpia gate y sale |

**Pasa a:** POS (habilita ventas), Fondos (lectura), Bitácora (`caja.session.open/close`).

---

### 4.4 Bitácora — `/bitacora`

**Propósito:** auditoría operativa y ventas recientes con reimpresión.

#### Pestaña Actividad

| Filtro | Uso |
|--------|-----|
| Tipo de operación | Acción concreta del catálogo |
| Categoría | sales / inventory / pos / crm / system |
| Estado | success / failed / pending |
| Usuario | Búsqueda parcial del actor |

| Botón | Efecto |
|-------|--------|
| Actualizar bitácora | Recarga eventos |
| Ordenar columnas | Asc / desc |
| Ver ticket / Imprimir | Solo en `sale.create` con `saleId` |

#### Pestaña Ventas recientes

Solo lectura (nro. venta, caja, pago, total, fecha) + *Actualizar*.

**Origen de datos:** logs de POS, Caja, Inventario y CRM.

---

### 4.5 Inventarios

#### Catálogo y ajustes — `/inventario`

**Vista Inventario**

| Campo | Uso |
|-------|-----|
| Campo de búsqueda | Producto, SKU, categoría, precios, unidad, stock |
| Texto de búsqueda | Criterio |
| Ver códigos archivados | Incluye productos archivados |
| Alta (admin): SKU, Nombre, Categoría, Stock, Precio, Umbral, Pasillo | Nuevo producto |
| Importación CSV (archivo o textarea) | Carga masiva |

| Botón | Efecto |
|-------|--------|
| Agregar producto nuevo | Alta vía API de ajustes |
| Importación / Validar / Importar | Pipeline CSV |
| Alertas stock bajo | Destaca umbrales |
| Ordenar / paginar | Navegación del catálogo |

**Vista Ajustes** (`?shortcut=ajuste`)

| Campo | Uso |
|-------|-----|
| Operación | Corregir precio, programar precio, entrada, salida, umbral, eliminar |
| Precio / vigencia | Cambios de precio inmediatos o programados |
| Cantidad / umbral / costo | Movimientos y valuación |
| Método | FIFO o promedio |
| Motivo | Trazabilidad del ajuste |
| Lote (checkboxes + mismos campos) | Ajuste masivo |

| Botón | Efecto |
|-------|--------|
| Aplicar / Previsualizar / Confirmar | Ejecuta o confirma el ajuste |

**Pasa a:** POS (precios y stock), Merma (misma API de salidas), Compras (entradas formales), Bitácora.

#### Merma y caducidad — `/inventario/merma-caducidad`

| Campo | Uso | Persistencia |
|-------|-----|--------------|
| Producto + cantidad + motivo | Registrar merma | API (`stock_exit`, FIFO) |
| Producto + fecha + nota | Caducidad | **Solo `localStorage`** |

**Estado:** merma implementada; caducidad **parcial**.

---

### 4.6 Finanzas (solo admin)

#### Hub — `/finanzas`

Filtros Día / Semana / Mes; métricas de ventas y flujo; enlaces a submódulos. Refresh periódico.

#### Periodos — `/finanzas/periodos`

| Campo | Uso |
|-------|-----|
| Desde / Hasta | Rango P&L |
| Preferencias de paneles | Ventana 7/15/31d y visibilidad |
| Tipo / Categoría / Descripción / Monto | Alta de gasto inline |

| Botón | Efecto |
|-------|--------|
| Aplicar rango / Últimos 7 días | Recalcula summary |
| Registrar / Guardar gasto | `POST /api/finanzas/expenses` |

#### Fondos activo — `/finanzas/fondos`

Solo lectura: caja abierta + historial de cortes (`/api/caja/session`, `/api/caja/cortes`). Sin botones de escritura.

#### Pasivo — `/finanzas/pasivo`

| Campo | Uso |
|-------|-----|
| Periodo | Hoy / Semana / Mes |
| Tipo | Fijo / corriente |
| Categoría | Renta, luz, agua, gas, proveedores, nómina, etc. |
| Descripción / Monto | Compromiso |

| Botón | Efecto |
|-------|--------|
| Registrar gasto | Alta |
| Eliminar | Baja con confirmación |

#### Compras y proveedores — `/finanzas/compras`

| Campo | Uso |
|-------|-----|
| Producto (búsqueda) | Ítem a reponer |
| Cantidad / costo unitario | Entrada |
| Forma de pago | Contado (egreso) o crédito (CxP) |
| Proveedor existente o nuevo | Relación comercial |
| Vendido/entregado por | Referencia operativa |

| Botón | Efecto |
|-------|--------|
| Registrar / Guardar entrada | Stock + movimiento financiero |
| Restock rápido | Atajo desde alertas |

**Pasa a:** Inventario (entrada), Finanzas (egreso o saldo proveedor), POS (stock disponible).

#### Promociones — `/finanzas/promociones`

| Campo | Uso |
|-------|-----|
| Nombre, tipo, valor, compra mínima, descripción, expiración, activa | Definición de promo |

Tipos: porcentaje, monto fijo, 2x1, bundle.

| Botón | Efecto |
|-------|--------|
| Nueva / Guardar / Activar-Desactivar / Eliminar | CRUD completo |

**Brecha:** el catálogo **no está cableado al POS**; no altera el cobro.

---

### 4.7 Dashboard y configuración

#### Dashboard — `/admin`

KPIs: productos, stock bajo, pedidos, saldos, devoluciones, handoffs, promesas, aprobaciones, conversaciones.  
Botones: *Refrescar*, *Configurar chatbot*, *IVA y recibo*.  
**Parcial:** la API entrega conversaciones/acciones pendientes que esta pantalla aún no detalla.

#### Configuración — `/configuracion`

| Tab | Entradas | Acciones | Estado |
|-----|----------|----------|--------|
| General | Mostrar IVA en recibo; tasa IVA % | Guardar | Implementado |
| Chatbot | Agente activo, modelo, instrucciones, flags de escritura/finanzas, herramientas ERP, URL webhook | Guardar / Copiar webhook / ir a `/crm` | Implementado |
| Cajeros | Usuario + contraseña | Crear cajero; listado | Parcial (sin editar/desactivar en UI) |
| Turno | — | Enlace a `/caja` | Stub de UI |

---

### 4.8 CRM y Operaciones

#### Consola CRM — `/crm`

| Campo | Uso |
|-------|-----|
| Mensaje | Texto al agente |

| Botón | Efecto |
|-------|--------|
| Quick actions (Inventario, Pedidos, Finanzas, Devoluciones, Handoff) | Precarga escenarios |
| Enviar | `POST /api/agent/chat` |

Muestra metadata: intent, run mode (mastra/fallback), handoff, errores.  
**No es un CRM comercial** (contactos, pipeline, oportunidades); es la consola de validación del cerebro omnicanal.

WhatsApp entra por webhooks (`/api/whatsapp/...`) hacia el mismo agente.

#### Operaciones — `/operaciones`

Hub de lectura: atajos a POS, Bitácora, Ajustes y Finanzas + ventas recientes y KPIs (admin). Fuera del menú lateral.

---

## 5. Cómo pasan los datos de un módulo a otro

```text
Login
  ├─ admin  ──► Dashboard / Configuración / Finanzas / Inventario / POS
  └─ cajero ──► POS (si hay turno) ◄──► Caja (abrir / cortar)

Caja.open ──habilita──► POS.cobrar
POS.cobrar ──► descuenta Inventario
           ──► acumula totales en CashSession (Caja)
           ──► escribe Bitácora (sale.create)
           ──► alimenta Finanzas/summary (ventas)

Caja.close ──► Fondos (historial) + Bitácora + lock cajero

Compras.entrada ──► Inventario (+) + Egreso o CxP proveedor
Merma ──► Inventario (− FIFO)
Ajustes ──► Inventario (precio/stock/umbral)

Config IVA ──► formato de ticket POS
Config Chatbot ──► CRM web + WhatsApp (mismas tools ERP)

Promociones ──✗──► POS   (pendiente de integración)
Caducidad   ──✗──► BD    (solo navegador)
```

### Dependencias críticas del día a día

1. **Sin turno de caja no hay venta.** El POS obliga a abrir float antes de cobrar.  
2. **Toda venta toca tres dominios a la vez:** stock, caja y bitácora.  
3. **Finanzas de liquidez de mostrador** se leen en Fondos, pero se escriben en Caja.  
4. **Compras es el puente formal** entre proveedores e inventario; los ajustes son el puente interno.  
5. **El agente AI lee** inventario/ventas/finanzas según tools habilitadas; no sustituye las pantallas operativas.

---

## 6. Cumplimiento frente al esquema maestro (alcance funcional §2)

| Capacidad del esquema | Hallazgo en código / UI |
|-----------------------|-------------------------|
| Ticket POS | Implementado (impresión texto) |
| Devoluciones | Sin pantalla dedicada; el agente tiene escenario de prueba |
| Caja y arqueo | Implementado (corte ciego + historial admin) |
| Medios de pago | Efectivo y tarjeta |
| Recepción de inventario | Vía Compras + ajustes de entrada |
| Transferencias entre ubicaciones | No implementado como módulo |
| Lotes | Parcial (costeo FIFO/promedio; sin gestión de lote/serie completa) |
| Mermas | Implementado |
| Reposición / alertas | Stock bajo + restock en Compras |
| Cuentas por cobrar / pagar | CxP proveedor en compras a crédito; CxC no como módulo formal |
| Flujo de caja | Summary + periodos + fondos |
| Conciliaciones | No hay conciliación bancaria |
| Reportes | Summary/periodos en UI; sin export PDF/CSV/XLSX generalizado |
| Chat web + WhatsApp unificado | Implementado a nivel agente |
| Trazabilidad por usuario/terminal/módulo | Bitácora por actor/acción; terminal no es entidad de primer nivel |

---

## 7. Matriz de madurez por pantalla

| Ruta | Estado | Nota ejecutiva |
|------|--------|----------------|
| `/`, `/login` | Implementado | Entrada segura |
| `/pos` | Implementado | Núcleo de ingresos |
| `/caja` | Implementado | Control de turno |
| `/bitacora` | Implementado | Auditoría operativa |
| `/inventario` | Implementado | Catálogo + ajustes |
| `/inventario/merma-caducidad` | Parcial | Caducidad no llega a servidor |
| `/inventario/importacion` | Implementado | Fuera del menú; duplica modal |
| `/finanzas` y submódulos (salvo promociones) | Implementado | Lectura + egresos + compras |
| `/finanzas/promociones` | Parcial | CRUD sin efecto en cobro |
| `/admin` | Parcial | KPIs sí; detalle CRM incompleto |
| `/configuracion` (general/chatbot) | Implementado | Política POS y agente |
| `/configuracion?tab=cajeros` | Parcial | Alta sin ciclo de vida completo |
| `/configuracion?tab=turno` | Stub | Solo redirige a Caja |
| `/crm` | Implementado* | Consola; fuera del menú |
| `/operaciones` | Implementado* | Hub; fuera del menú |

\* Funcional, pero desconectado de la navegación principal.

---

## 8. Brechas prioritarias (recomendación de secuencia)

1. **Cablear promociones al POS** — hoy el catálogo financiero no modifica el ticket.  
2. **Persistir caducidad en base de datos** — hoy vive en el navegador.  
3. **Integrar CRM y Operaciones al menú** (o retirar rutas huérfanas del producto).  
4. **Completar ciclo de vida de cajeros** (editar / desactivar) y enriquecer Dashboard con conversaciones/aprobaciones ya expuestas por API.  
5. **Cerrar huecos del esquema maestro de mayor valor operativo:** devoluciones POS, transferencias, conciliación, exportes de reporte.  
6. **Stack pendiente del master spec:** Redis/BullMQ, observabilidad OTel/Sentry, si se mantiene como requisito de la “nueva era”.

---

## 9. Conclusión

El sistema ya cubre el **ciclo operativo diario del supermercado** descrito en la especificación maestra: autenticación por rol, apertura de caja, venta, inventario vivo, egresos/compras, corte y auditoría, con un agente omnicanal conectado a las mismas reglas de negocio.

Lo que falta para declararlo “ERP integral completo” según el documento fundacional no es la carcasa: son **profundizaciones de dominio** (devoluciones, transferencias, lotes, conciliación, promociones en cobro) y **infraestructura de plataforma** (colas, observabilidad). El producto está en condición de demostración ejecutiva y operación controlada; las brechas anteriores definen el roadmap de cierre frente al esquema inicial.

---

*Documento generado a partir de revisión de rutas `app/**`, navegación `workspace-shell.tsx`, APIs `app/api/**` y contraste con `2x3crmtest-master-spec.md`.*
