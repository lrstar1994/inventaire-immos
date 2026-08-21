PRAGMA foreign_keys=OFF;

CREATE TABLE "new_asset_files" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "asset_unit_id" TEXT,
  "asset_entry_id" TEXT,
  "file_kind" TEXT,
  "file_type" TEXT NOT NULL,
  "file_label" TEXT,
  "file_name" TEXT NOT NULL,
  "file_path" TEXT NOT NULL,
  "storage_provider" TEXT,
  "storage_bucket" TEXT,
  "storage_key" TEXT,
  "mime_type" TEXT NOT NULL,
  "file_size" INTEGER NOT NULL,
  "is_primary" BOOLEAN NOT NULL DEFAULT false,
  "notes" TEXT,
  "created_by" TEXT,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL,
  "deleted_at" DATETIME,
  CONSTRAINT "asset_files_owner_check" CHECK (
    ("asset_unit_id" IS NOT NULL AND "asset_entry_id" IS NULL)
    OR
    ("asset_unit_id" IS NULL AND "asset_entry_id" IS NOT NULL)
  ),
  CONSTRAINT "asset_files_kind_check" CHECK (
    "file_kind" IS NULL OR "file_kind" IN ('MATERIAL_PHOTO', 'SUPPORTING_DOCUMENT')
  ),
  CONSTRAINT "asset_files_primary_photo_check" CHECK (
    "is_primary" = false
    OR (("file_kind" IS NULL OR "file_kind" = 'MATERIAL_PHOTO') AND "mime_type" LIKE 'image/%')
  ),
  CONSTRAINT "asset_files_asset_unit_id_fkey"
    FOREIGN KEY ("asset_unit_id") REFERENCES "asset_units" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "asset_files_asset_entry_id_fkey"
    FOREIGN KEY ("asset_entry_id") REFERENCES "asset_entries" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "new_asset_files" (
  "id", "asset_unit_id", "asset_entry_id", "file_kind", "file_type", "file_label",
  "file_name", "file_path", "storage_provider", "storage_bucket", "storage_key",
  "mime_type", "file_size", "is_primary", "notes", "created_by",
  "created_at", "updated_at", "deleted_at"
)
SELECT
  "id", "asset_unit_id", NULL, NULL, "file_type", "file_label",
  "file_name", "file_path", "storage_provider", "storage_bucket", "storage_key",
  "mime_type", "file_size", "is_primary", "notes", "created_by",
  "created_at", "updated_at", "deleted_at"
FROM "asset_files";

DROP TABLE "asset_files";
ALTER TABLE "new_asset_files" RENAME TO "asset_files";

CREATE INDEX "asset_files_asset_unit_id_idx" ON "asset_files"("asset_unit_id");
CREATE INDEX "asset_files_asset_entry_id_idx" ON "asset_files"("asset_entry_id");
CREATE INDEX "asset_files_file_type_idx" ON "asset_files"("file_type");
CREATE INDEX "asset_files_is_primary_idx" ON "asset_files"("is_primary");
CREATE INDEX "asset_files_deleted_at_idx" ON "asset_files"("deleted_at");
CREATE INDEX "asset_files_storage_provider_idx" ON "asset_files"("storage_provider");
CREATE INDEX "asset_files_storage_key_idx" ON "asset_files"("storage_key");
CREATE INDEX "asset_files_storage_provider_storage_bucket_storage_key_idx"
  ON "asset_files"("storage_provider", "storage_bucket", "storage_key");
CREATE UNIQUE INDEX "asset_files_active_entry_primary_key"
  ON "asset_files"("asset_entry_id")
  WHERE "asset_entry_id" IS NOT NULL AND "is_primary" = true AND "deleted_at" IS NULL;

PRAGMA foreign_keys=ON;
