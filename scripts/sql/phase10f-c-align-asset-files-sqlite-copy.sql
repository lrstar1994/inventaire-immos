ALTER TABLE "asset_files" ADD COLUMN "storage_provider" TEXT;
ALTER TABLE "asset_files" ADD COLUMN "storage_bucket" TEXT;
ALTER TABLE "asset_files" ADD COLUMN "storage_key" TEXT;
ALTER TABLE "asset_files" ADD COLUMN "updated_at" DATETIME NOT NULL;
