# Guía de estilo de documentación — 2x3crmtest

| Campo | Valor |
|-------|--------|
| **ID** | `DOC-GE-001` |
| **Versión** | `1.0.0` |
| **Fecha** | 2026-08-11 |
| **Normas** | ISO/IEC/IEEE 26514 · ISO/IEC 25000 · WCAG 2.2 (orientación) |

---

## 1. Principio rector

Escribimos para que una persona logre un **objetivo** (tarea), no para describir botones de una pantalla.

| Evitar (enfoque de sistema) | Preferir (enfoque de tarea) |
|-----------------------------|-----------------------------|
| “El botón Agregar está a la derecha del SKU” | “Cómo agregar un producto al ticket” |
| “El endpoint POST /api/pos/sales…” | “Al cobrar, el sistema guarda la venta y baja el stock” |
| Jerga sin explicar (`RBAC`, `handoff`) | Término + definición en glosario |

---

## 2. Lenguaje sencillo (ISO/IEC 25000 — usabilidad)

- Oraciones cortas. Una instrucción = un paso numerado.  
- Verbos en imperativo: “Abra”, “Pulse”, “Capture”.  
- Español de México; evite anglicismos innecesarios. Si el término aparece en la UI (`POS`, `SKU`), explíquelo una vez.  
- No asuma que el lector conoce APIs, Docker, Prisma o Git.  
- Reserve detalle técnico al manual técnico.

### Nivel de audiencia

| Documento | Nivel |
|-----------|-------|
| Manual de usuario | Operador de tienda / administrador de negocio |
| Manual técnico | Desarrollador / DevOps |
| Revisión ejecutiva | Dirección / producto |

---

## 3. Estructura obligatoria de un procedimiento

1. **Título orientado a tarea:** “Cómo …”  
2. **Objetivo** en una frase.  
3. **Quién puede hacerlo** (rol).  
4. **Pasos numerados.**  
5. **Resultado esperado.**  
6. **Si falla** → enlace a troubleshooting.

---

## 4. Apoyo visual sistemático

Todo procedimiento de más de 5 pasos debería incluir al menos uno de:

- Diagrama de flujo (Mermaid) con **texto alternativo** debajo.  
- Tabla de decisión (si / entonces).  
- Captura anotada (cuando exista) con alt text descriptivo.

Plantilla de texto alternativo:

> *Texto alternativo: [qué se ve] — [qué debe hacer el usuario].*

Prohibido: imágenes cuyo alt sea solo “screenshot” o “imagen1”.

---

## 5. Accesibilidad (WCAG)

- Encabezados en orden (`#` → `##` → `###`), sin saltar niveles.  
- Enlaces con texto significativo (“Manual técnico”, no “clic aquí”).  
- Tablas con fila de encabezados.  
- Contraste alto al exportar a PDF o HTML.  
- No usar solo el color para indicar error; acompañar con texto (“Error”, “Listo”).

---

## 6. Identidad de cada documento

Encabezado mínimo:

- Título claro  
- Versión del software  
- Versión del documento  
- Fecha  
- Fabricante / responsable  
- ID `DOC-…` (ver control de configuración)

---

## 7. Commits y PRs

Ejemplos:

```text
docs(DOC-MU-001): describe cómo hacer corte de caja ciego
docs(DOC-RC-001): registra liberación manual 1.0.0-MU
```

El cuerpo del commit debe decir **qué tarea de usuario cambió** y **por qué**, no solo “update docs”.
