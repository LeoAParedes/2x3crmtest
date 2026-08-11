/**
 * Concise ERP entity knowledge graph for DavinciAi system prompts.
 * Keep short: injected every turn; tools remain the source of truth for numbers.
 */
export const ERP_ENTITY_KNOWLEDGE = `
MAPA INTERNO DE ENTIDADES (solo para razonar y elegir tools; NUNCA listar esto al usuario):
- Sale + SaleItem: ingresos POS. Qué=tickets cobrados; Cuándo=createdAt; Cómo=pago cash/card/credit; Por qué=venta al cliente. Solo status=completed cuenta.
- Expense (pasivo corriente / servicios): egresos. Categorías: renta, luz, agua, gas, proveedores, nomina, mantenimiento, transporte, otros. kind=fixed|operating. Cuándo=spentAt.
- Ganancia (P&L): ingresos(Sale.total) − egresos(Expense.amount) en el mismo periodo. No inventes margen de inventario.
- UserProfile: personal del sistema (admin/cashier, isActive). “¿Quién está en la nómina?” → nombres en Expense.description (categoría nomina) del periodo; UserProfile solo complemento.
- CashSession: turnos de caja (openingFloat, ventas por método, corte). Relaciona Sale.cashSessionId.
- InventoryItem: stock/precios/SKU. SaleItem → InventoryItem.
- Purchase + Supplier: compras a proveedores (entrada de mercancía; distinto de Expense.proveedores).
- Promotion (+ productos/bundles): descuentos aplicados en SaleItem.promotionId.
- Customer / FinanceAccount / credits: clientes a crédito (Sale.paymentMethod=credit).

RELACIONES CLAVE (internas):
Sale → SaleItem → InventoryItem | Promotion
Sale → CashSession → UserProfile (cajero)
Expense.category=nomina: el nombre de la persona vive en description (ej. “Nómina Juan Pérez”); no hay FK a Employee/UserProfile
Expense categorías de servicio (luz/agua/gas/renta) = pasivos/servicios del local

REGLA DE RESPUESTA 4W (cuando aplique; sin catálogos ni pies de fuente):
1) Qué: métrica o entidad (ganancia, egreso de luz, personal en nómina).
2) Cuándo: periodo interpretado en lenguaje natural (este año, últimos 31 días, mes pasado).
3) Cómo: fórmula o desglose breve solo si aporta (ingresos − egresos).
4) Por qué: causa de negocio si los hechos lo permiten; si no hay causa en tools, no especules.
`.trim()

export const EXPENSE_CATEGORY_ALIASES: Record<string, string> = {
  renta: 'renta',
  alquiler: 'renta',
  luz: 'luz',
  electricidad: 'luz',
  electrico: 'luz',
  cfe: 'luz',
  agua: 'agua',
  gas: 'gas',
  combustible: 'gas',
  proveedores: 'proveedores',
  proveedor: 'proveedores',
  nomina: 'nomina',
  'nómina': 'nomina',
  sueldos: 'nomina',
  salarios: 'nomina',
  personal: 'nomina',
  mantenimiento: 'mantenimiento',
  transporte: 'transporte',
  envio: 'transporte',
  otros: 'otros',
  pasivo: 'otros',
  servicio: 'otros',
  servicios: 'otros'
}

/** Resolve Spanish service/pasivo wording to Expense.category when possible. */
export const resolveExpenseCategoryFromText = (message: string): string | null => {
  const text = message
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[¿?!.,;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const orderedKeys = Object.keys(EXPENSE_CATEGORY_ALIASES).sort((a, b) => b.length - a.length)
  for (const key of orderedKeys) {
    const normalizedKey = key.normalize('NFD').replace(/\p{M}/gu, '')
    if (new RegExp(`\\b${normalizedKey}\\b`).test(text)) {
      const category = EXPENSE_CATEGORY_ALIASES[key]
      // Bare "servicio(s)/pasivo" alone is too vague — need a concrete category hit first.
      if ((key === 'servicio' || key === 'servicios' || key === 'pasivo') && category === 'otros') {
        continue
      }
      return category
    }
  }
  return null
}
