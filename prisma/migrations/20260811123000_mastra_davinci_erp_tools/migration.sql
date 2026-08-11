-- AlterTable
ALTER TABLE "MastraSettings"
ADD COLUMN IF NOT EXISTS "allowedErpTools" JSONB NOT NULL DEFAULT '["sales_total_today","sales_total_period","stock_by_product_search","top_product_period","cash_flow_period","low_stock_count","expenses_total_period","average_ticket_period"]';
