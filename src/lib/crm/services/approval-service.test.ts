import { describe, expect, it } from 'vitest'

import { buildApprovalResolutionMetadata } from '@/src/lib/crm/services/approval-service'

describe('buildApprovalResolutionMetadata', () => {
  it('records the resolved approval identifier and decision', () => {
    expect(buildApprovalResolutionMetadata('apr-123', 'approved')).toEqual({
      approvalId: 'apr-123',
      decision: 'approved'
    })
  })
})
