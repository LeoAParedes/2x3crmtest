-- Persistent inventory lots with expiry (Supabase/Postgres)
CREATE TABLE "InventoryLot" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "quantityReceived" INTEGER NOT NULL,
    "quantityRemaining" INTEGER NOT NULL,
    "expiresOn" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryLot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InventoryLot_purchaseId_key" ON "InventoryLot"("purchaseId");
CREATE INDEX "InventoryLot_inventoryItemId_expiresOn_idx" ON "InventoryLot"("inventoryItemId", "expiresOn");
CREATE INDEX "InventoryLot_status_expiresOn_idx" ON "InventoryLot"("status", "expiresOn");
CREATE INDEX "InventoryLot_expiresOn_idx" ON "InventoryLot"("expiresOn");

ALTER TABLE "InventoryLot" ADD CONSTRAINT "InventoryLot_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryLot" ADD CONSTRAINT "InventoryLot_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Purchase" ADD COLUMN "expiresOn" TIMESTAMP(3);
