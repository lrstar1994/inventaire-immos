SET search_path = "immos";

CREATE TYPE "StorageProvider" AS ENUM ('LOCAL', 'SUPABASE');

ALTER TABLE "asset_files"
  ADD COLUMN "storage_provider" "StorageProvider",
  ADD COLUMN "storage_bucket" TEXT,
  ADD COLUMN "storage_key" TEXT,
  ADD COLUMN "updated_at" TIMESTAMPTZ(3);

UPDATE "asset_files"
SET "updated_at" = "created_at"
WHERE "updated_at" IS NULL;

ALTER TABLE "asset_files"
  ALTER COLUMN "updated_at" SET NOT NULL;

CREATE INDEX "asset_files_storage_provider_idx" ON "asset_files"("storage_provider");
CREATE INDEX "asset_files_storage_key_idx" ON "asset_files"("storage_key");
CREATE INDEX "asset_files_storage_provider_storage_bucket_storage_key_idx"
  ON "asset_files"("storage_provider", "storage_bucket", "storage_key");
