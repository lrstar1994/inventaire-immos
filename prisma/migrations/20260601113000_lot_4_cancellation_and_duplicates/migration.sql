ALTER TABLE "asset_documents" ADD COLUMN "cancelled_by" TEXT;
ALTER TABLE "asset_documents" ADD COLUMN "cancellation_reason" TEXT;
ALTER TABLE "asset_documents" ADD COLUMN "cancellation_approval_id" TEXT;

ALTER TABLE "asset_units" ADD COLUMN "possible_duplicate" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "asset_units_possible_duplicate_idx" ON "asset_units"("possible_duplicate");
CREATE INDEX "asset_documents_cancelled_by_idx" ON "asset_documents"("cancelled_by");
