type Bucket = {
  count: number
  resetAt: number
}

const bucketStore = new Map<string, Bucket>()

export const consumeRateLimit = (key: string, limit: number, windowMs: number) => {
  const now = Date.now()
  const bucket = bucketStore.get(key)

  if (!bucket || now > bucket.resetAt) {
    bucketStore.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs }
  }

  if (bucket.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: bucket.resetAt }
  }

  bucket.count += 1
  return { allowed: true, remaining: Math.max(limit - bucket.count, 0), resetAt: bucket.resetAt }
}
