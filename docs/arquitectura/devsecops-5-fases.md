# DevSecOps - 5 Fases para 2x3crmtest

## Resumen ejecutivo

El programa DevSecOps se estructura en 5 fases iterativas para asegurar velocidad de entrega con seguridad y calidad verificable desde el inicio.

## Fase 1 - Planificar y modelar riesgo

### Objetivo

Definir alcance, riesgos, arquitectura de referencia y controles obligatorios antes de codificar.

### Actividades clave

- Definir historias por modulo ERP (POS, inventario, finanzas, AI omnicanal)
- Modelado de amenazas (OWASP ASVS + STRIDE)
- Matriz de datos sensibles (PII, pagos, auditoria)
- Criterios SQuaRE por calidad funcional/no funcional

### Entregables

- Backlog priorizado por valor/riesgo
- Matriz de riesgos y controles
- ADRs de arquitectura

## Fase 2 - Construir de forma segura (Develop)

### Objetivo

Implementar funcionalidades con seguridad por defecto y estandares de codificacion.

### Actividades clave

- Desarrollo TypeScript estricto con validacion de contratos (input/output)
- RBAC por modulo y permisos granulares
- Secret management por entorno
- Revisiones de codigo con checklist de seguridad

### Controles minimos

- Prohibido credenciales hardcoded
- Sanitizacion/validacion de payloads
- Politicas de logs sin exponer datos sensibles

## Fase 3 - Verificar y asegurar pipeline (Build + Test)

### Objetivo

Automatizar calidad y seguridad en cada push.

### Actividades clave

- CI con lint, typecheck, pruebas unitarias e integracion
- SAST y analisis de dependencias
- Escaneo de imagen Docker (Trivy u homologo)
- DAST en staging para endpoints expuestos

### Criterios de salida

- Build reproducible
- Cobertura minima por modulo critico
- Cero vulnerabilidades criticas abiertas en release gate

## Fase 4 - Liberar y desplegar con control (Release + Deploy)

### Objetivo

Desplegar de forma segura, trazable y reversible.

### Actividades clave

- Estrategia blue/green o canary por entorno
- Migraciones de base de datos versionadas y auditadas
- Feature flags para cambios de alto impacto
- Firma/registro de artefactos

### Criterios de salida

- Rollback probado
- Smoke tests de negocio aprobados
- Evidencia de cumplimiento documental

## Fase 5 - Operar, monitorear y mejorar (Operate + Improve)

### Objetivo

Sostener confiabilidad operacional y mejora continua por evidencia.

### Actividades clave

- Observabilidad integral (logs, metrics, traces)
- Monitoreo de SLO/SLI por modulo
- Respuesta a incidentes con postmortem sin culpa
- Mejora continua de proceso (SPICE)

### Criterios de salida

- MTTR en objetivo
- Tendencia decreciente de incidentes repetitivos
- Actualizacion de controles y backlog de hardening

## Alineacion con ISO/IEC 25000 y 15504

### ISO/IEC 25000 (SQuaRE)

- Cada fase evidencia atributos de calidad del producto
- Calidad se mide con KPIs verificables por modulo

### ISO/IEC 15504 (SPICE)

- Cada fase se evalua en capacidad de proceso
- Se aplica ciclo de mejora continua por resultados auditables

## KPIs recomendados por fase

- Fase 1: cobertura de riesgos identificados >= 95%
- Fase 2: defect density por PR, findings de seguridad por sprint
- Fase 3: tasa de builds verdes, vulnerabilidades abiertas por severidad
- Fase 4: change failure rate, tiempo de rollback
- Fase 5: disponibilidad, p95 latencia, MTTR, incidentes por mes
