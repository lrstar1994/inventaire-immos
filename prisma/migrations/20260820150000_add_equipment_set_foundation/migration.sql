CREATE TABLE "equipment_sets" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "location_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "created_at" DATETIME NOT NULL DEFAULT current_timestamp,
  "updated_at" DATETIME NOT NULL,
  "created_by" TEXT,
  "updated_by" TEXT,
  "deleted_at" DATETIME,
  CONSTRAINT "equipment_sets_location_id_fkey"
    FOREIGN KEY ("location_id") REFERENCES "locations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "equipment_sets_status_check" CHECK ("status" IN ('DRAFT', 'INSTALLED', 'DISABLED')),
  CONSTRAINT "equipment_sets_code_key" UNIQUE ("code")
);

CREATE INDEX "equipment_sets_location_id_idx" ON "equipment_sets"("location_id");
CREATE INDEX "equipment_sets_status_idx" ON "equipment_sets"("status");
CREATE INDEX "equipment_sets_deleted_at_idx" ON "equipment_sets"("deleted_at");

CREATE TABLE "equipment_set_components" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "equipment_set_id" TEXT NOT NULL,
  "asset_unit_id" TEXT,
  "asset_entry_id" TEXT,
  "source_location_id" TEXT,
  "quantity" INTEGER,
  "notes" TEXT,
  "created_at" DATETIME NOT NULL DEFAULT current_timestamp,
  "updated_at" DATETIME NOT NULL,
  "created_by" TEXT,
  "updated_by" TEXT,
  "deleted_at" DATETIME,
  CONSTRAINT "equipment_set_components_equipment_set_id_fkey"
    FOREIGN KEY ("equipment_set_id") REFERENCES "equipment_sets" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "equipment_set_components_asset_unit_id_fkey"
    FOREIGN KEY ("asset_unit_id") REFERENCES "asset_units" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "equipment_set_components_asset_entry_id_fkey"
    FOREIGN KEY ("asset_entry_id") REFERENCES "asset_entries" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "equipment_set_components_source_location_id_fkey"
    FOREIGN KEY ("source_location_id") REFERENCES "locations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "equipment_set_components_exclusive_type_check" CHECK (
    ("asset_unit_id" IS NOT NULL AND "asset_entry_id" IS NULL AND "source_location_id" IS NULL AND "quantity" = 1)
    OR
    ("asset_unit_id" IS NULL AND "asset_entry_id" IS NOT NULL AND "source_location_id" IS NOT NULL AND "quantity" > 0)
  )
);

CREATE INDEX "equipment_set_components_equipment_set_id_idx" ON "equipment_set_components"("equipment_set_id");
CREATE INDEX "equipment_set_components_asset_unit_id_idx" ON "equipment_set_components"("asset_unit_id");
CREATE INDEX "equipment_set_components_asset_entry_id_idx" ON "equipment_set_components"("asset_entry_id");
CREATE INDEX "equipment_set_components_source_location_id_idx" ON "equipment_set_components"("source_location_id");
CREATE INDEX "equipment_set_components_deleted_at_idx" ON "equipment_set_components"("deleted_at");
CREATE UNIQUE INDEX "equipment_set_components_active_asset_unit_key"
  ON "equipment_set_components"("asset_unit_id")
  WHERE "asset_unit_id" IS NOT NULL AND "deleted_at" IS NULL;
