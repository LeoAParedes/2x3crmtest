-- AlterTable
ALTER TABLE "InventoryItem" ADD COLUMN "ivaRate" DECIMAL(5,4);

-- AlterTable
ALTER TABLE "SaleItem" ADD COLUMN "lineTax" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "PosSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "showIvaOnReceipt" BOOLEAN NOT NULL DEFAULT false,
    "defaultIvaRate" DECIMAL(5,4) NOT NULL DEFAULT 0.16,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PosSettings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "PosSettings" ("id", "showIvaOnReceipt", "defaultIvaRate", "updatedAt")
VALUES ('default', false, 0.16, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
