import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const getPrisma = async () => {
  if (globalForPrisma.prisma) {
    // #region agent log
    void fetch('http://host.docker.internal:7470/ingest/f7f242f1-ff2d-40d4-bf0c-d535d5a2bbdb',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'449600'},body:JSON.stringify({sessionId:'449600',runId:'initial',hypothesisId:'A',location:'src/lib/db/prisma.ts:8',message:'Reused Prisma client',data:{nodeEnv:process.env.NODE_ENV},timestamp:Date.now()})}).catch(()=>{})
    // #endregion
    return globalForPrisma.prisma
  }

  const connectionString = process.env.DATABASE_URL?.trim()
  if (!connectionString) {
    throw new Error('DATABASE_URL is required')
  }

  // #region agent log
  void fetch('http://host.docker.internal:7470/ingest/f7f242f1-ff2d-40d4-bf0c-d535d5a2bbdb',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'449600'},body:JSON.stringify({sessionId:'449600',runId:'initial',hypothesisId:'A',location:'src/lib/db/prisma.ts:20',message:'Created Prisma client',data:{nodeEnv:process.env.NODE_ENV,connectionHost:new URL(connectionString).hostname,connectionPort:new URL(connectionString).port},timestamp:Date.now()})}).catch(()=>{})
  // #endregion
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString })
  })

  if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = prisma
  }

  return prisma
}
