import { getPrisma } from '@/src/lib/db/prisma'
import { getCashierRuntimeState } from '@/src/lib/caja/cash-session-service'
import { listExpiryAlerts } from '@/src/lib/inventory/lot-service'
import { activeInventoryItemWhere, isLowStockItem } from '@/src/lib/inventory/low-stock'
import { inferWeightSupport } from '@/src/lib/inventory/weight-units'
import { getFinanceDashboard } from '@/src/lib/finance/finance-service'
import { FINANCE_TIME_ZONE, getPeriodBounds } from '@/src/lib/finance/period'
import type { AuthenticatedActor } from '@/src/lib/security/api-auth'

export const getTodayHubDashboard = async (actor: AuthenticatedActor) => {
  const prisma = await getPrisma()
  const day = getPeriodBounds('day')
  const [finance, cashState, expiry, inventory, paymentGroups, discountAgg] = await Promise.all([
    getFinanceDashboard('day'),
    getCashierRuntimeState(actor),
    listExpiryAlerts(),
    prisma.inventoryItem.findMany({
      where: activeInventoryItemWhere,
      select: {
        id: true,
        sku: true,
        productName: true,
        category: true,
        stock: true,
        minStock: true,
        aisle: true
      },
      take: 2000
    }),
    prisma.sale.groupBy({
      by: ['paymentMethod'],
      where: {
        status: 'completed',
        createdAt: { gte: day.start, lte: day.end }
      },
      _count: { _all: true },
      _sum: { total: true }
    }),
    prisma.sale.aggregate({
      where: {
        status: 'completed',
        createdAt: { gte: day.start, lte: day.end }
      },
      _sum: { discountTotal: true, total: true },
      _count: { _all: true }
    })
  ])

  const lowStock = inventory
    .filter(item => isLowStockItem(item))
    .sort((a, b) => a.stock - b.stock)
    .slice(0, 8)
    .map(item => ({
      id: item.id,
      sku: item.sku,
      productName: item.productName,
      stock: item.stock,
      minStock: item.minStock,
      supportsWeight: inferWeightSupport(item.category, item.aisle, item.productName)
    }))

  const paymentMethods = {
    cash: { count: 0, total: 0 },
    card: { count: 0, total: 0 },
    credit: { count: 0, total: 0 }
  }
  for (const row of paymentGroups) {
    const key = row.paymentMethod === 'card' || row.paymentMethod === 'credit' ? row.paymentMethod : 'cash'
    paymentMethods[key] = {
      count: row._count._all,
      total: Number(Number(row._sum.total || 0).toFixed(2))
    }
  }

  return {
    timeZone: FINANCE_TIME_ZONE,
    generatedAt: new Date().toISOString(),
    salesToday: {
      total: Number(Number(discountAgg._sum.total || 0).toFixed(2)),
      count: discountAgg._count._all,
      discountTotal: Number(Number(discountAgg._sum.discountTotal || 0).toFixed(2))
    },
    paymentMethods,
    cash: {
      gate: cashState.gate,
      currentShiftSlot: cashState.currentShiftSlot,
      outsideShiftHours: cashState.outsideShiftHours,
      openSession: cashState.openSession
    },
    alerts: {
      lowStock,
      expiry: expiry.slice(0, 8),
      totalCount: lowStock.length + expiry.length
    },
    topProducts: finance.topProducts.slice(0, 5),
    shortcuts: [
      { href: '/pos', label: 'Cobrar en POS' },
      { href: '/caja', label: 'Turno / Corte' },
      { href: '/finanzas/compras', label: 'Entrada de compra' },
      { href: '/finanzas/pasivo', label: 'Registrar gasto' },
      { href: '/inventario/merma-caducidad', label: 'Merma / caducidad' },
      { href: '/finanzas/promociones', label: 'Promociones' }
    ]
  }
}
