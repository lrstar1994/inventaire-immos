BEGIN;

CREATE TYPE "immos_recipe_phase8"."AssetFileKind" AS ENUM ('MATERIAL_PHOTO', 'SUPPORTING_DOCUMENT');

ALTER TABLE "immos_recipe_phase8"."asset_files"
  ALTER COLUMN "asset_unit_id" DROP NOT NULL,
  ADD COLUMN "asset_entry_id" text,
  ADD COLUMN "file_kind" "immos_recipe_phase8"."AssetFileKind";

ALTER TABLE "immos_recipe_phase8"."asset_files"
  ADD CONSTRAINT "asset_files_owner_check" CHECK (
    ("asset_unit_id" IS NOT NULL AND "asset_entry_id" IS NULL)
    OR
    ("asset_unit_id" IS NULL AND "asset_entry_id" IS NOT NULL)
  ),
  ADD CONSTRAINT "asset_files_primary_photo_check" CHECK (
    "is_primary" = false
    OR (("file_kind" IS NULL OR "file_kind" = 'MATERIAL_PHOTO') AND "mime_type" LIKE 'image/%')
  ),
  ADD CONSTRAINT "asset_files_asset_entry_id_fkey"
    FOREIGN KEY ("asset_entry_id") REFERENCES "immos_recipe_phase8"."asset_entries"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "asset_files_asset_entry_id_idx"
  ON "immos_recipe_phase8"."asset_files"("asset_entry_id");
CREATE UNIQUE INDEX "asset_files_active_entry_primary_key"
  ON "immos_recipe_phase8"."asset_files"("asset_entry_id")
  WHERE "asset_entry_id" IS NOT NULL AND "is_primary" = true AND "deleted_at" IS NULL;

COMMIT;
