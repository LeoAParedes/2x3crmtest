# Base de conocimiento — 2x3crmtest

Portal documental del ERP **2x3 Operaciones**.  
Busque por **objetivo** (“cómo cobrar”, “cómo cortar caja”) o por tipo de documento.

| Campo | Valor |
|-------|--------|
| **ID** | `DOC-KB-001` |
| **Versión** | `1.1.0` |
| **Software alineado** | `1.0.0` |
| **Sitio público** | https://2x3crmtest.vercel.app |
| **Fecha** | 2026-08-11 |
| **Normas** | ISO/IEC/IEEE 26514 · ISO/IEC 25000 · ISO/IEC 29110 · enfoque KB digital 2026 |

---

## Inicio rápido

| Si usted es… | Empiece aquí |
|--------------|--------------|
| Operar el ERP en internet | https://2x3crmtest.vercel.app |
| Cajero o administrador de tienda | [Manual de usuario `1.2.0-MU`](manual-usuario/manual-usuario-erp-supermercado.md) (POS cajero completo) |
| Desarrollador o DevOps | [Manual técnico](manual-tecnico/manual-tecnico-erp-supermercado.md) |
| Dirección / producto | [Revisión ejecutiva del estado actual](arquitectura/revision-ejecutiva-estado-actual.md) |
| Quien mantiene la documentación | [Control de configuración](calidad/control-configuracion-documental.md) · [Guía de estilo](calidad/guia-estilo-documentacion.md) |

---

## Índice por tarea (usuario)

| Quiero… | Documento · sección |
|---------|---------------------|
| Entrar al sistema y cobrar mi primera venta | Manual de usuario · §3 Inicio rápido |
| Abrir turno y vender | Manual de usuario · §5 |
| Hacer corte de caja | Manual de usuario · §6 |
| Ajustar inventario o registrar merma | Manual de usuario · §7 |
| Registrar compra a proveedor | Manual de usuario · §8 |
| Ver finanzas o cargar un gasto | Manual de usuario · §9 |
| Crear cajero / IVA / chatbot | Manual de usuario · §10 |
| Reimprimir un ticket | Manual de usuario · §11 |
| Resolver un error | Manual de usuario · §13 |
| Entender un término | Manual de usuario · §15 Glosario |

---

## Índice por carpeta

### Calidad y proceso

- [Control de configuración documental](calidad/control-configuracion-documental.md)  
- [Guía de estilo de documentación](calidad/guia-estilo-documentacion.md)  
- [Registro de cambios de documentación](calidad/registro-cambios-documentacion.md)  

### Manuales

- [Manual de usuario](manual-usuario/manual-usuario-erp-supermercado.md)  
- [Manual técnico](manual-tecnico/manual-tecnico-erp-supermercado.md)  

### Arquitectura y estado

- [Especificación maestra](arquitectura/2x3crmtest-master-spec.md)  
- [Revisión ejecutiva estado actual](arquitectura/revision-ejecutiva-estado-actual.md)  
- [DevSecOps 5 fases](arquitectura/devsecops-5-fases.md)  
- [Mastra WhatsApp / Webchat](arquitectura/mastra-whatsapp-webchat.md)  
- [Análisis heredado uscores](arquitectura/analisis-heredado-uscores.md)  

### Operaciones e integraciones

- [Release runbook Vercel](operaciones/release-runbook-vercel.md)  
- [Evolution WhatsApp](integraciones/evolution-whatsapp-setup.md)  
- [Meta WhatsApp Cloud](integraciones/meta-whatsapp-cloud-setup.md)  
- [Davinci ERP WhatsApp](integraciones/davinci-erp-whatsapp.md)  

### Diseño y planes (ingeniería)

- Carpeta [`superpowers/`](superpowers/) — specs y planes de implementación  
- [`video/`](video/) — estructura de video de avances  

---

## Cómo buscar en esta base (hoy)

1. Abra esta página (`docs/README.md`).  
2. Use la búsqueda del editor / GitHub sobre la carpeta `docs/` con palabras de su objetivo (`corte`, `merma`, `cajero`).  
3. Prefiera resultados en **Manual de usuario** para operación diaria.

## Cómo buscar (fase siguiente — Factor 2026)

- Ayuda in-app enlazada a anclas de este manual.  
- Motor de búsqueda interno con métricas de artículos más consultados.  
- Actualización continua acoplada al pipeline CI/CD (mismo PR código + docs).

---

## Política de actualización

Todo cambio que altere una tarea de usuario debe actualizar el manual en el mismo ciclo de liberación.  
Detalle: [control de configuración documental](calidad/control-configuracion-documental.md).
