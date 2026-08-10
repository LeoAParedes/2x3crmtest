export type InventoryItem = {
  sku: string
  name: string
  category: string
  price: number
  stock: number
  aisle: string
}

export type OrderRecord = {
  orderId: string
  customerPhone: string
  status: 'created' | 'paid' | 'prepared' | 'delivered' | 'cancelled'
  total: number
  updatedAt: string
}

export type AccountBalance = {
  customerId: string
  openBalance: number
  creditLimit: number
  availableCredit: number
}

export type ReturnCase = {
  caseId: string
  customerId: string
  reason: string
  status: 'opened' | 'approved' | 'rejected'
  createdAt: string
}

export type HandoffTicket = {
  ticketId: string
  customerId: string
  reason: string
  priority: 'low' | 'medium' | 'high'
  createdAt: string
}

export type PaymentPromise = {
  promiseId: string
  customerId: string
  amount: number
  dueDate: string
  status: 'pending' | 'fulfilled' | 'broken'
}

export type ApprovalRequest = {
  approvalId: string
  actionType: 'return_case' | 'payment_promise'
  targetId: string
  reason: string
  status: 'pending' | 'approved' | 'rejected'
  createdAt: string
  resolvedAt?: string
}
