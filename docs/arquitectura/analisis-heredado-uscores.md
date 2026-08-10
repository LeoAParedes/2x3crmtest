# Analisis Abstracto del Legado (uscores)

## Proposito del analisis

Documentar el sistema existente como "fantasma funcional" para construir su sucesor sin arrastrar deuda tecnica estructural.

## Interconectividad modular observada (abstraccion)

El legado opera como un monolito PHP con modulos acoplados por include/require, session state y acceso compartido a base de datos.

Patron funcional observado:

- Capa publica (landing/formularios) captura leads y consentimiento
- Capa ERP interna gestiona leads, clientes, pricing, inspecciones y dashboard
- Capa API (endpoints PHP) centraliza operaciones de negocio y webhooks
- Capa de automatizacion integra SMS/WhatsApp-like workflows y mensajeria transaccional
- Capa AI extiende chat web y TTS mediante proveedores externos

La colaboracion entre modulos depende de:

- tablas relacionales compartidas
- validaciones puntuales por endpoint
- autorizacion por rol en middleware propio
- scripts JS acoplados a vistas PHP

## Stack tecnico detectado en el legado

### Lenguajes y runtime

- PHP (backend principal)
- JavaScript (frontend vanilla y utilidades)
- CSS (estilos custom)
- SQL (migraciones/manual scripts)

### Base de datos y acceso

- MySQL/MariaDB (PDO, consultas SQL directas)

### Librerias/plugins PHP detectados (composer)

- `phpoffice/phpspreadsheet` (manejo de Excel/reportes)
- `tecnickcom/tcpdf` (generacion de PDF)
- `phpoffice/phpword` (documentos Word)
- `psr/log`
- `psr/http-message`

### Extensiones/capacidades nativas usadas

- `ZipArchive` para preview/importacion XLSX
- `cURL` para integraciones HTTP

### Integraciones externas observadas

- Anthropic API (chat AI)
- AWS Polly (TTS)
- Twilio webhook flow
- EZTexting API
- n8n en Docker Compose para automatizaciones

### Frontend/vendor detectado

- Bootstrap y Bootstrap Icons
- AOS, GLightbox, Swiper
- Google Fonts (`Inter`, `Poppins`, y otras en vistas internas)

## Implicaciones de arquitectura para el sucesor

- Existe cobertura funcional amplia, pero con limites de mantenibilidad por acoplamiento
- La migracion recomendada es greenfield modular sobre dominio ERP
- Se debe conservar semantica funcional y mejorar:
  - separacion de capas
  - observabilidad
  - pruebas automatizadas
  - seguridad continua (DevSecOps)
  - consistencia UX multiviewport
