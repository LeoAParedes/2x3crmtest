# Registro de cambios de documentación

| Campo | Valor |
|-------|--------|
| **ID** | `DOC-RC-001` |
| **Producto** | 2x3crmtest / 2x3 Operaciones |
| **Norma** | ISO/IEC 29110 — trazabilidad de liberación documental |

Cada fila es evidencia auditable de cambio. Completar **Validó** y **Aprobó** antes de considerar el documento liberado a clientes.

---

## Historial

| Fecha | Soft. | Doc. | ID DOC | Cambio (qué / por qué) | Redactó | Validó | Aprobó |
|-------|-------|------|--------|------------------------|---------|--------|--------|
| 2026-08-11 | 1.0.0 | 1.3.0-MU | DOC-MU-001 | Cobertura completa del sistema vs commits recientes: campana, inventario kg/pz y cajero solo lectura, merma FEFO con campos, compras/restock, promos 3x2/bundle, Hoy widgets, crédito no en /caja, config Turno/Chatbot, bitácora tabs | Equipo docs / asistente | Leonardo Antonio Paredes | Leonardo Antonio Paredes |
| 2026-08-11 | 1.0.0 | 1.2.0-MU | DOC-MU-001 | Documenta implementación completa POS cajero (commit 5fde201): modo cobro, sesión exclusiva, sync borrador, auth admin al quitar línea, crédito, turnos, promos en ticket | Equipo docs / asistente | Leonardo Antonio Paredes | Leonardo Antonio Paredes |
| 2026-08-11 | 1.0.0 | 1.1.0-MU | DOC-MU-001 | Regeneración completa: liga pública https://2x3crmtest.vercel.app, lotes/caducidad, promos POS, turnos 06–14/14–22, crédito, dashboard Hoy | Equipo docs / asistente | _Pendiente_ | _Pendiente_ |
| 2026-08-11 | 1.0.0 | 1.0.0-MU | DOC-MU-001 | Reescritura completa del manual de usuario: de enfoque de pantalla a enfoque de tareas (ISO/IEC/IEEE 26514), con audiencia, prerrequisitos, onboarding, troubleshooting, glosario e índice | Equipo docs / asistente | _Pendiente_ | _Pendiente_ |
| 2026-08-11 | 1.0.0 | 1.0.0 | DOC-GE-001 | Alta de guía de estilo documental (lenguaje sencillo, WCAG, estructura de procedimientos) | Equipo docs / asistente | _Pendiente_ | _Pendiente_ |
| 2026-08-11 | 1.0.0 | 1.0.0 | CI-DOCS / DOC-KB-001 | Alta de control de configuración documental e índice de base de conocimiento | Equipo docs / asistente | _Pendiente_ | _Pendiente_ |
| 2026-08-11 | 1.0.0 | 1.0.0-MT | DOC-MT-001 | Identidad/trazabilidad en encabezado del manual técnico + enlace a KB y control 29110 | Equipo docs / asistente | _Pendiente_ | _Pendiente_ |
| 2026-08-11 | 1.0.0 | 1.1.0-MU | DOC-MU-001 | Regeneración total del manual: liga pública https://2x3crmtest.vercel.app, tareas reales UI/API, limitaciones verificadas, mensajes de error reales | Equipo docs / asistente | _Pendiente_ | _Pendiente_ |

---

## Plantilla para nuevas filas

```md
| AAAA-MM-DD | X.Y.Z | X.Y.Z-XX | DOC-… | Descripción del cambio y motivo | Nombre | Nombre | Nombre |
```

---

## Criterio de cierre de liberación documental

Una versión documental se considera **aprobada para clientes** cuando:

1. Existe fila en esta tabla con Validó y Aprobó completos.  
2. La versión de software citada coincide con `package.json` liberado.  
3. El índice `docs/README.md` apunta al documento vigente.  
4. No hay procedimientos que describan funciones eliminadas o pantallas inexistentes.
