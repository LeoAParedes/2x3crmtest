-- AlterTable
ALTER TABLE "UserProfile" ADD COLUMN "cashierGate" TEXT NOT NULL DEFAULT 'ready';

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'operating';

-- CreateTable
CREATE TABLE "CashSession" (
    "id" TEXT NOT NULL,
    "cashierProfileId" TEXT NOT NULL,
    "cashierAuthUserId" UUID NOT NULL,
    "cashierUsername" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "openingFloat" DECIMAL(10,2) NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "cashSalesTotal" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "cardSalesTotal" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "salesCount" INTEGER NOT NULL DEFAULT 0,
    "expectedCash" DECIMAL(10,2),
    "countedCash" DECIMAL(10,2),
    "variance" DECIMAL(10,2),
    "notes" TEXT,

    CONSTRAINT "CashSession_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN "cashSessionId" TEXT;

-- CreateIndex
CREATE INDEX "CashSession_cashierAuthUserId_status_idx" ON "CashSession"("cashierAuthUserId", "status");

-- CreateIndex
CREATE INDEX "CashSession_status_openedAt_idx" ON "CashSession"("status", "openedAt");

-- CreateIndex
CREATE INDEX "Sale_cashSessionId_idx" ON "Sale"("cashSessionId");

-- CreateIndex
CREATE INDEX "Expense_kind_spentAt_idx" ON "Expense"("kind", "spentAt");

-- AddForeignKey
ALTER TABLE "CashSession" ADD CONSTRAINT "CashSession_cashierProfileId_fkey" FOREIGN KEY ("cashierProfileId") REFERENCES "UserProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "CashSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
