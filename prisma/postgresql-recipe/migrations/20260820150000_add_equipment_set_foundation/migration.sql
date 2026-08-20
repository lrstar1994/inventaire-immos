BEGIN;

CREATE TYPE "immos_recipe_phase8"."EquipmentSetStatus" AS ENUM ('DRAFT', 'INSTALLED', 'DISABLED');

CREATE TABLE "immos_recipe_phase8"."equipment_sets" (
  "id" text NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "location_id" text NOT NULL,
  "status" "immos_recipe_phase8"."EquipmentSetStatus" NOT NULL DEFAULT 'DRAFT',
  "created_at" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamptz(3) NOT NULL,
  "created_by" text,
  "updated_by" text,
  "deleted_at" timestamptz(3),
  CONSTRAINT "equipment_sets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "equipment_sets_code_key" UNIQUE ("code"),
  CONSTRAINT "equipment_sets_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "immos_recipe_phase8"."locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "equipment_sets_location_id_idx" ON "immos_recipe_phase8"."equipment_sets"("location_id");
CREATE INDEX "equipment_sets_status_idx" ON "immos_recipe_phase8"."equipment_sets"("status");
CREATE INDEX "equipment_sets_deleted_at_idx" ON "immos_recipe_phase8"."equipment_sets"("deleted_at");

CREATE TABLE "immos_recipe_phase8"."equipment_set_components" (
  "id" text NOT NULL,
  "equipment_set_id" text NOT NULL,
  "asset_unit_id" text,
  "asset_entry_id" text,
  "source_location_id" text,
  "quantity" integer,
  "notes" text,
  "created_at" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamptz(3) NOT NULL,
  "created_by" text,
  "updated_by" text,
  "deleted_at" timestamptz(3),
  CONSTRAINT "equipment_set_components_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "equipment_set_components_exclusive_type_check" CHECK (
    ("asset_unit_id" IS NOT NULL AND "asset_entry_id" IS NULL AND "source_location_id" IS NULL AND "quantity" = 1)
    OR
    ("asset_unit_id" IS NULL AND "asset_entry_id" IS NOT NULL AND "source_location_id" IS NOT NULL AND "quantity" > 0)
  ),
  CONSTRAINT "equipment_set_components_equipment_set_id_fkey" FOREIGN KEY ("equipment_set_id") REFERENCES "immos_recipe_phase8"."equipment_sets"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "equipment_set_components_asset_unit_id_fkey" FOREIGN KEY ("asset_unit_id") REFERENCES "immos_recipe_phase8"."asset_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "equipment_set_components_asset_entry_id_fkey" FOREIGN KEY ("asset_entry_id") REFERENCES "immos_recipe_phase8"."asset_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "equipment_set_components_source_location_id_fkey" FOREIGN KEY ("source_location_id") REFERENCES "immos_recipe_phase8"."locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "equipment_set_components_equipment_set_id_idx" ON "immos_recipe_phase8"."equipment_set_components"("equipment_set_id");
CREATE INDEX "equipment_set_components_asset_unit_id_idx" ON "immos_recipe_phase8"."equipment_set_components"("asset_unit_id");
CREATE INDEX "equipment_set_components_asset_entry_id_idx" ON "immos_recipe_phase8"."equipment_set_components"("asset_entry_id");
CREATE INDEX "equipment_set_components_source_location_id_idx" ON "immos_recipe_phase8"."equipment_set_components"("source_location_id");
CREATE INDEX "equipment_set_components_deleted_at_idx" ON "immos_recipe_phase8"."equipment_set_components"("deleted_at");
CREATE UNIQUE INDEX "equipment_set_components_active_asset_unit_key"
  ON "immos_recipe_phase8"."equipment_set_components"("asset_unit_id")
  WHERE "asset_unit_id" IS NOT NULL AND "deleted_at" IS NULL;

COMMIT;
