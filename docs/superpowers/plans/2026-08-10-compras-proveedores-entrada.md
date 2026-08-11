# Compras entrada + proveedores AP

## Architecture
- Prisma: `Supplier`, `ProductSupplier`, `Purchase`
- `POST /api/finanzas/compras/entrada` atomic: stock entry + purchase + (expense if paid | openBalance if credit)
- `GET/POST /api/finanzas/proveedores`
- UI: Registrar entrada with empty-until-search picker

## Tasks
1. Schema + migration
2. purchase-service + APIs
3. ComprasClient rewrite
4. Tests + push
