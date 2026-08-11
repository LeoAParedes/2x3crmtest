-- Promotions products/bundles + sale discounts + credit payment fields + shift slot
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "discountTotal" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "creditCustomerName" TEXT;
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "creditCustomerPhone" TEXT;
CREATE INDEX IF NOT EXISTS "Sale_paymentMethod_createdAt_idx" ON "Sale"("paymentMethod", "createdAt");

ALTER TABLE "SaleItem" ADD COLUMN IF NOT EXISTS "lineDiscount" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "SaleItem" ADD COLUMN IF NOT EXISTS "promotionId" TEXT;
CREATE INDEX IF NOT EXISTS "SaleItem_promotionId_idx" ON "SaleItem"("promotionId");

ALTER TABLE "Promotion" ADD COLUMN IF NOT EXISTS "startsAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "Promotion_active_startsAt_expiresAt_idx" ON "Promotion"("active", "startsAt", "expiresAt");

CREATE TABLE IF NOT EXISTS "PromotionProduct" (
    "id" TEXT NOT NULL,
    "promotionId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PromotionProduct_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PromotionProduct_promotionId_inventoryItemId_key" ON "PromotionProduct"("promotionId", "inventoryItemId");
CREATE INDEX IF NOT EXISTS "PromotionProduct_inventoryItemId_idx" ON "PromotionProduct"("inventoryItemId");

CREATE TABLE IF NOT EXISTS "PromotionBundleItem" (
    "id" TEXT NOT NULL,
    "promotionId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "requiredQty" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PromotionBundleItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PromotionBundleItem_promotionId_inventoryItemId_key" ON "PromotionBundleItem"("promotionId", "inventoryItemId");
CREATE INDEX IF NOT EXISTS "PromotionBundleItem_inventoryItemId_idx" ON "PromotionBundleItem"("inventoryItemId");

DO $$ BEGIN
  ALTER TABLE "PromotionProduct" ADD CONSTRAINT "PromotionProduct_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "PromotionProduct" ADD CONSTRAINT "PromotionProduct_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "PromotionBundleItem" ADD CONSTRAINT "PromotionBundleItem_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "PromotionBundleItem" ADD CONSTRAINT "PromotionBundleItem_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "CashSession" ADD COLUMN IF NOT EXISTS "shiftSlot" TEXT;
ALTER TABLE "CashSession" ADD COLUMN IF NOT EXISTS "creditSalesTotal" DECIMAL(10,2) NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS "CashSession_shiftSlot_openedAt_idx" ON "CashSession"("shiftSlot", "openedAt");
