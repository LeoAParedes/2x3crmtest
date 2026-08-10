import type { AccountBalance } from '@/src/lib/crm/domain-types'
import { getPrisma } from '@/src/lib/db/prisma'

export const getAccountBalance = async (customerId: string): Promise<AccountBalance | null> => {
  const normalized = customerId.trim()
  if (!normalized) {
    return null
  }

  const prisma = await getPrisma()
  const account = await prisma.financeAccount.findFirst({
    where: {
      customer: {
        OR: [{ id: normalized }, { phone: normalized }]
      }
    }
  })

  if (!account) {
    return null
  }

  return {
    customerId: normalized,
    openBalance: Number(account.openBalance),
    creditLimit: Number(account.creditLimit),
    availableCredit: Number(account.creditLimit) - Number(account.openBalance)
  }
}
