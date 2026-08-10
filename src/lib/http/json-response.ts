import { NextResponse } from 'next/server'

export const jsonOk = (data: unknown, init?: ResponseInit) => NextResponse.json(data, { status: 200, ...init })

type JsonErrorOptions = {
  details?: unknown
  code?: string
  requestId?: string
}

const defaultErrorCodeByStatus: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'UNPROCESSABLE_ENTITY',
  429: 'RATE_LIMIT_EXCEEDED',
  500: 'INTERNAL_SERVER_ERROR',
  502: 'BAD_GATEWAY',
  503: 'SERVICE_UNAVAILABLE'
}

const isJsonErrorOptions = (value: unknown): value is JsonErrorOptions => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  return 'code' in value || 'requestId' in value || 'details' in value
}

const resolveErrorCode = (status: number, code?: string) => {
  if (code) {
    return code
  }

  return defaultErrorCodeByStatus[status] || 'REQUEST_ERROR'
}

export const jsonError = (message: string, status = 400, detailsOrOptions?: unknown | JsonErrorOptions) => {
  const options = isJsonErrorOptions(detailsOrOptions) ? detailsOrOptions : { details: detailsOrOptions }
  const errorCode = resolveErrorCode(status, options.code)

  return NextResponse.json(
    {
      success: false,
      message,
      details: options.details,
      error: {
        code: errorCode,
        message,
        details: options.details
      },
      requestId: options.requestId,
      timestamp: new Date().toISOString()
    },
    { status }
  )
}
