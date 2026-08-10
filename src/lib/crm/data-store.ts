import type {
  AccountBalance,
  ApprovalRequest,
  HandoffTicket,
  InventoryItem,
  OrderRecord,
  PaymentPromise,
  ReturnCase
} from '@/src/lib/crm/domain-types'

const nowIso = () => new Date().toISOString()

const inventorySeed: InventoryItem[] = [
  { sku: 'SKU-MILK-1L', name: 'Leche Entera 1L', category: 'Lacteos', price: 1.79, stock: 96, aisle: 'A2' },
  { sku: 'SKU-RICE-1KG', name: 'Arroz Premium 1kg', category: 'Despensa', price: 2.49, stock: 42, aisle: 'B4' },
  { sku: 'SKU-EGG-12', name: 'Huevo Blanco 12p', category: 'Lacteos', price: 3.19, stock: 18, aisle: 'A3' },
  { sku: 'SKU-COFFEE-500', name: 'Cafe Molido 500g', category: 'Bebidas', price: 6.59, stock: 27, aisle: 'C1' }
]

const orderSeed: OrderRecord[] = [
  { orderId: 'ORD-20260807-001', customerPhone: '5215550101010', status: 'paid', total: 34.2, updatedAt: nowIso() },
  {
    orderId: 'ORD-20260807-002',
    customerPhone: '5215550102020',
    status: 'prepared',
    total: 12.4,
    updatedAt: nowIso()
  },
  {
    orderId: 'ORD-20260807-003',
    customerPhone: '5215550103030',
    status: 'delivered',
    total: 87.55,
    updatedAt: nowIso()
  }
]

const accountSeed: AccountBalance[] = [
  { customerId: '5215550101010', openBalance: 120.25, creditLimit: 400, availableCredit: 279.75 },
  { customerId: '5215550102020', openBalance: 0, creditLimit: 200, availableCredit: 200 },
  { customerId: '5215550103030', openBalance: 54.9, creditLimit: 350, availableCredit: 295.1 }
]

const returnCases: ReturnCase[] = []
const handoffTickets: HandoffTicket[] = []
const paymentPromises: PaymentPromise[] = []
const approvals: ApprovalRequest[] = []

export const crmDataStore = {
  inventory: inventorySeed,
  orders: orderSeed,
  accounts: accountSeed,
  returnCases,
  handoffTickets,
  paymentPromises,
  approvals
}
