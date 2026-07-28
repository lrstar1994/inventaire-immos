CREATE TABLE "asset_files" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "asset_unit_id" TEXT NOT NULL,
  "file_type" TEXT NOT NULL,
  "file_label" TEXT,
  "file_name" TEXT NOT NULL,
  "file_path" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "file_size" INTEGER NOT NULL,
  "is_primary" BOOLEAN NOT NULL DEFAULT false,
  "notes" TEXT,
  "created_by" TEXT,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" DATETIME,
  CONSTRAINT "asset_files_asset_unit_id_fkey" FOREIGN KEY ("asset_unit_id") REFERENCES "asset_units" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "asset_files_asset_unit_id_idx" ON "asset_files"("asset_unit_id");
CREATE INDEX "asset_files_file_type_idx" ON "asset_files"("file_type");
CREATE INDEX "asset_files_is_primary_idx" ON "asset_files"("is_primary");
CREATE INDEX "asset_files_deleted_at_idx" ON "asset_files"("deleted_at");
