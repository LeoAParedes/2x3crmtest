# Manual de Usuario - ERP Supermercado 2x3crmtest

## 1) Introduccion

Este manual describe el uso operativo del ERP en su nueva arquitectura.

Modulos cubiertos:

- POS
- Inventarios
- Finanzas
- Agente AI (Web Chat y WhatsApp)

## 2) Roles sugeridos

- Cajero
- Supervisor de tienda
- Almacenista
- Contabilidad
- Administrador

Cada rol visualiza solo modulos y acciones autorizadas.

## 3) Flujo base por modulo

### 3.1 POS

- Abrir turno de caja
- Registrar productos y cantidades
- Aplicar descuentos autorizados
- Cerrar ticket y emitir comprobante
- Ejecutar cierre/arqueo de caja

### 3.2 Inventarios

- Registrar entrada por proveedor
- Ejecutar transferencias entre ubicaciones
- Confirmar conteos ciclicos
- Reportar mermas/ajustes
- Generar alertas de reposicion

### 3.3 Finanzas

- Consultar cuentas por cobrar/pagar
- Conciliar movimientos de caja y banco
- Revisar flujo de efectivo
- Exportar reportes operativos

### 3.4 Agente AI (Web + WhatsApp)

- Resolver preguntas de stock/precios/estado de pedido
- Guiar al cliente en seguimiento de compra
- Escalar a agente humano cuando aplique

## 4) Buenas practicas operativas

- Mantener sesion por usuario individual (no compartida)
- Verificar cierres diarios de caja e inventario
- Documentar incidencias con evidencia en el sistema
- Usar escalamiento humano para casos excepcionales

## 5) Politicas de seguridad del usuario

- No compartir contrasenas
- Cerrar sesion al terminar turno
- Reportar actividad sospechosa al administrador
- No copiar informacion sensible fuera de canales autorizados

## 6) Soporte

Incidencias funcionales:

- registrar fecha/hora
- modulo afectado
- pasos para reproducir
- evidencia (captura o ID de transaccion)

## 7) Uso del backoffice por rol (`/admin`)

1. Ingresar a `Dashboard Operativo` desde la pagina principal
2. Seleccionar el rol activo en el selector (cajero, almacen, finanzas, supervisor o administrador)
3. Validar panel de permisos:
   - bloque verde: acciones habilitadas para el rol
   - bloque rojo: restricciones visibles en UI para el rol
4. Revisar widgets operativos y observabilidad:
   - conversaciones
   - handoffs
   - stock bajo
   - aprobaciones
5. Si el rol es `admin` o `supervisor`, ajustar configuracion Mastra y guardar cambios

## 8) Uso de consola omnicanal (`/crm`)

1. Abrir `Consola Chat CRM`
2. Probar escenarios rapidos con los botones:
   - inventario
   - pedidos
   - finanzas
   - devoluciones
   - handoff humano
3. Revisar metadata mostrada en cada respuesta:
   - intent detectado
   - run mode (`mastra` o `fallback`)
   - estado de handoff y ticket (si existe)
   - codigo/error HTTP cuando haya fallo
4. Registrar incidencias incluyendo:
   - Session ID mostrado en consola
   - mensaje enviado
   - metadata de error retornada
