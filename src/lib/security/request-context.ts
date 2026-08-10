const requestIdPrefix = 'req'

export const getRequestId = (request: Request) => {
  const fromHeader = request.headers.get('x-request-id')?.trim()
  if (fromHeader) {
    return fromHeader.slice(0, 120)
  }

  const randomPart = Math.random().toString(16).slice(2, 10)
  return `${requestIdPrefix}-${Date.now()}-${randomPart}`
}

export const getClientIp = (request: Request) => {
  const forwardedFor = request.headers.get('x-forwarded-for')
  if (forwardedFor) {
    const [firstHop] = forwardedFor.split(',')
    if (firstHop?.trim()) {
      return firstHop.trim()
    }
  }

  const realIp = request.headers.get('x-real-ip')?.trim()
  if (realIp) {
    return realIp
  }

  return 'unknown'
}

export const buildRateLimitKey = (request: Request, scope: string) => {
  const ip = getClientIp(request)
  return `${scope}:${ip}`
}
