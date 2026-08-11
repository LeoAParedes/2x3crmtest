import { describe, expect, it, vi } from 'vitest'

import { diagnoseWaterIvaExemptions, repairWaterIvaExemptions } from '@/src/lib/inventory/repair-water-iva'

const mockItems = [
  {
    id: '1',
    sku: 'BEB-001',
    productName: 'Agua purificada 1.5 L',
    category: 'Bebidas',
    aisle: null,
    ivaRate: null
  },
  {
    id: '2',
    sku: 'BEB-002',
    productName: 'Agua mineral 600 ml',
    category: 'Bebidas',
    aisle: null,
    ivaRate: 0.16
  },
  {
    id: '3',
    sku: 'FRV-004',
    productName: 'Aguacate Hass',
    category: 'Frutas y Verduras',
    aisle: 'Granel (kg)',
    ivaRate: null
  },
  {
    id: '4',
    sku: 'BEB-003',
    productName: 'Agua purificada garrafón 20 L',
    category: 'Bebidas',
    aisle: null,
    ivaRate: 0
  }
]

describe('repairWaterIvaExemptions', () => {
  it('plans only water products that are not already 0', async () => {
    const prisma = {
      inventoryItem: {
        findMany: vi.fn().mockResolvedValue(mockItems),
        update: vi.fn()
      },
      systemActionLog: { create: vi.fn() }
    }

    const plans = await diagnoseWaterIvaExemptions(prisma as never)
    expect(plans.map(plan => plan.sku)).toEqual(['BEB-001', 'BEB-002'])
    expect(plans.every(plan => plan.nextIvaRate === 0)).toBe(true)
  })

  it('dry-run does not write', async () => {
    const update = vi.fn()
    const create = vi.fn()
    const prisma = {
      inventoryItem: {
        findMany: vi.fn().mockResolvedValue(mockItems),
        update
      },
      systemActionLog: { create }
    }

    const result = await repairWaterIvaExemptions(prisma as never, { dryRun: true })
    expect(result.applied).toBe(0)
    expect(update).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })

  it('applies ivaRate 0 when dryRun is false', async () => {
    const update = vi.fn().mockResolvedValue({})
    const create = vi.fn().mockResolvedValue({})
    const prisma = {
      inventoryItem: {
        findMany: vi.fn().mockResolvedValue(mockItems),
        update
      },
      systemActionLog: { create }
    }

    const result = await repairWaterIvaExemptions(prisma as never, { dryRun: false })
    expect(result.applied).toBe(2)
    expect(update).toHaveBeenCalledTimes(2)
    expect(create).toHaveBeenCalledOnce()
  })
})
