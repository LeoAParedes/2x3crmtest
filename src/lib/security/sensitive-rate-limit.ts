import { jsonError } from '@/src/lib/http/json-response'
import { consumeRateLimit } from '@/src/lib/security/rate-limit'
import { buildRateLimitKey, getRequestId } from '@/src/lib/security/request-context'

type SensitiveRateLimitOptions = {
  scope: string
  limit: number
  windowMs: number
}

type SensitiveRateLimitResult =
  | {
      allowed: true
      remaining: number
      resetAt: number
      requestId: string
    }
  | {
      allowed: false
      response: Response
    }

export const enforceSensitiveRateLimit = (
  request: Request,
  { scope, limit, windowMs }: SensitiveRateLimitOptions
): SensitiveRateLimitResult => {
  const requestId = getRequestId(request)
  const key = buildRateLimitKey(request, scope)
  const state = consumeRateLimit(key, limit, windowMs)

  if (!state.allowed) {
    return {
      allowed: false,
      response: jsonError('Too many requests', 429, {
        code: 'RATE_LIMIT_EXCEEDED',
        requestId,
        details: {
          scope,
          retryAfterMs: Math.max(state.resetAt - Date.now(), 0)
        }
      })
    }
  }

  return {
    allowed: true,
    remaining: state.remaining,
    resetAt: state.resetAt,
    requestId
  }
}
