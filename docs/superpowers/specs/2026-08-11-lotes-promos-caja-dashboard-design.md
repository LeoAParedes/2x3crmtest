# Diseño: Lotes/caducidad, promociones, caja por turnos y dashboard

| Campo | Valor |
|-------|--------|
| **Fecha** | 2026-08-11 |
| **Producto** | 2x3crmtest / 2x3 Operaciones |
| **Estado** | Aprobado en diálogo de diseño; pendiente revisión del archivo |
| **Zona horaria de negocio** | `America/Los_Angeles` |

## Objetivo

Completar el ciclo operativo de supermercado con:

1. Caducidad **persistente en Supabase** por **lote de compra**.
2. Promociones reales (2x1, 3x2, descuentos y **bundle multi-SKU**) aplicadas **automáticamente** en POS y reflejadas en finanzas.
3. Turnos de caja fijos con **un cierre por turno**.
4. Dashboard hub “Hoy” sin duplicar módulos, incluyendo desglose de medios de pago y **crédito** (nombre + teléfono).

## Decisiones acordadas

| Tema | Decisión |
|------|----------|
| Caducidad | Por lote de compra; un SKU puede tener varios lotes/fechas |
| Registro de caducidad | Solo al ingresar el lote; persistente en Postgres/Supabase |
| Merma | FEFO: se saca cantidad del **lote caducado** y baja stock del SKU |
| Alertas campana | 1 día antes + vencidos |
| Promos POS | Se aplican solas |
| Solape de promos | Gana la de **mayor ahorro** |
| Bundle | SKUs distintos + cantidad por componente + descuento fijo en pesos |
| Caja | 1 cierre/turno; turnos 06:00–14:00 y 14:00–22:00 |
| Crédito POS | Método de pago con nombre y teléfono obligatorios |
| Dashboard | Hub de alertas/atajos/KPIs; no segunda pantalla de finanzas |

---

## 1. Lotes, caducidad, merma y campana

### 1.1 Modelo

Nuevo modelo `InventoryLot`:

- `id`
- `purchaseId` (única entrada que originó el lote)
- `inventoryItemId`
- `quantityReceived`
- `quantityRemaining`
- `expiresOn` (fecha de calendario de negocio)
- `receivedAt`
- `status`: `active` | `exhausted` | `wasted`

Reglas:

- Cada `Purchase` (entrada proveedor) **exige** `expiresOn` y crea exactamente **un** lote.
- Sin lote no existe caducidad registrable.
- `InventoryItem.stock` sigue siendo el total agregado; los lotes explican la composición.

Se elimina el uso de caducidad en `localStorage` como fuente oficial.

### 1.2 Entrada por proveedor

En **Finanzas → Compras y Proveedores**, al guardar entrada:

1. Producto, cantidad, costo, proveedor, pago (contado/crédito proveedor) — como hoy.
2. Campo obligatorio **fecha de caducidad del lote**.
3. Persistencia: `Purchase` + movimiento de entrada + `InventoryLot` + incremento de stock.

### 1.3 Campana global

En `WorkspaceShell` (todos los módulos con sesión):

- Alertas unificadas:
  - `low_stock`
  - `expiring` (`expiresOn` = mañana local)
  - `expired` (`expiresOn` ≤ hoy local y `quantityRemaining > 0`)
- Cada ítem de caducidad enlaza a **Merma y Caducidad** filtrado por lote/SKU.
- Datos solo desde Prisma/Supabase.

### 1.4 Merma FEFO

1. Usuario selecciona el **lote** (típicamente el alertado).
2. Cantidad ≤ `quantityRemaining` de ese lote.
3. Efectos: baja `quantityRemaining`, baja `stock` del SKU, movimiento de salida/merma, bitácora.
4. Si queda en 0 → `exhausted` o `wasted`.

No se permite merma “libre” que ignore lotes cuando el stock proviene de lotes activos.

---

## 2. Promociones

### 2.1 Catálogo

Extender `Promotion`:

- Tipos: `porcentaje` | `monto_fijo` | `2x1` | `3x2` | `bundle`
- Ventana: `startsAt` (opcional; default inmediato) + `expiresAt`
- Productos: `PromotionProduct` (`promotionId`, `inventoryItemId`) para promos de un SKU / lista
- Bundle: `PromotionBundleItem` (`promotionId`, `inventoryItemId`, `requiredQty`)
- Bundle: `value` = **descuento fijo en MXN** por paquete completo

UI en **Descuentos y promociones**:

- Modal de selección de productos (búsqueda nombre/SKU).
- Para 2x1/3x2/porcentaje/monto: multi-SKU sin cantidad por línea (regla aplica por línea/SKU).
- Para bundle: cada fila del modal exige **SKU + cantidad**.

### 2.2 Reglas de cálculo

| Tipo | Regla |
|------|--------|
| 2x1 | Por cada 2 uds del SKU, se cobra 1 |
| 3x2 | Por cada 3 uds del SKU, se cobran 2 |
| porcentaje / monto_fijo | Sobre líneas de SKUs incluidos (respetando `minPurchase` si aplica) |
| bundle | Si el carrito cubre todas las cantidades requeridas, aplicar `value` una vez por cada paquete armable |

Solape: evaluar candidatas vigentes → elegir la combinación/promo de **mayor ahorro** para el cliente (sin apilar dos descuentos sobre la misma unidad de forma abusiva: una unidad no se descuenta dos veces).

### 2.3 POS

- Aplicación **automática** al actualizar carrito / al cobrar.
- Ticket: subtotal, descuento, IVA (si aplica), total.
- Persistencia en venta:
  - `Sale.discountTotal`
  - `SaleItem.lineDiscount`, `SaleItem.promotionId` (nullable)
- Sin botón de “activar promo”.

### 2.4 Finanzas

- Totales de ventas usan `Sale.total` (neto tras descuento).
- Resumen de periodo incluye **descuentos otorgados** = `sum(discountTotal)`.

---

## 3. Turnos de caja

| Turno | Ventana local |
|-------|----------------|
| Mañana | 06:00–14:00 |
| Tarde | 14:00–22:00 |

- Un `CashSession` por turno; **un solo corte** cierra ese turno.
- Apertura etiqueta `shiftSlot`: `morning` | `afternoon`.
- Fuera de ventana (22:00–06:00): no abrir venta; mensaje de fuera de horario.
- No reabrir el mismo slot del mismo día calendario si ya fue cortado.
- Admin consulta historial en Fondos; cajero opera en Turno/Corte.

---

## 4. Pago a crédito en POS

Métodos de pago: `cash` | `card` | `credit`.

Al elegir **crédito**:

- Obligatorio: **nombre** y **teléfono**.
- Persistir en la venta (campos en `Sale` o vínculo a `Customer` por teléfono si existe / se crea mínimo).
- Fase 1: venta a crédito documentada (quién / teléfono), no módulo completo de CxC bancaria.

---

## 5. Dashboard dinámico (`/admin`)

Hub **“Hoy”** — resume y enlaza; no duplica Finanzas/Periodos.

| Bloque | Contenido | Enlace |
|--------|-----------|--------|
| Alertas | Stock bajo + caducidad 1 día / vencidos | Inventario / Merma |
| Caja del turno | Estado + ventas del turno | `/caja` |
| Ventas hoy | Total + tickets | Finanzas |
| Medios de pago | Conteo y monto: efectivo / tarjeta / crédito | Bitácora o Finanzas |
| Descuentos hoy | `discountTotal` del día | Promociones / Periodos |
| Atajos | Cobrar, compra, gasto | Rutas existentes |

- `/operaciones` → redirigir a `/admin` (evitar duplicación).
- Cifras solo desde DB.

---

## 6. Fuera de alcance (fases posteriores)

- Turno nocturno 22:00–06:00.
- Cupones alfanuméricos de cliente.
- Conciliación bancaria / CxC avanzada con estados de cobranza.
- Transferencias entre sucursales.
- Dashboard CRM comercial completo.

---

## 7. Criterios de aceptación (alto nivel)

1. Entrada de compra sin `expiresOn` es rechazada; con fecha crea lote en Supabase.
2. Campana muestra lotes a 1 día y vencidos en cualquier módulo del shell.
3. Merma reduce solo el lote elegido y el stock del SKU.
4. 2x1, 3x2 y bundle (con cantidades) bajan el total del ticket sin acción del cajero.
5. Ante dos promos, el total refleja el mayor ahorro.
6. Finanzas reportan descuentos otorgados coherentes con ventas.
7. Solo un corte por slot mañana/tarde del día.
8. Cobro a crédito exige nombre y teléfono; dashboard muestra conteos por medio de pago.
9. Dashboard no introduce pantallas que repitan Periodos/Finanzas.

---

## 8. Orden de implementación sugerido

1. `InventoryLot` + compras + campana + merma FEFO  
2. Promos (schema + modal + motor + POS + finanzas)  
3. Turnos de caja por ventana  
4. Pago crédito + métricas de medios de pago  
5. Dashboard hub + redirect `/operaciones`  
6. Actualizar manual de usuario (`DOC-MU-001`) en el mismo ciclo de liberación  
