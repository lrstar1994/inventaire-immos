CREATE TABLE "asset_movements" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "movement_number" TEXT NOT NULL,
  "movement_type" TEXT NOT NULL,
  "movement_status" TEXT NOT NULL DEFAULT 'DRAFT',
  "movement_date" DATETIME NOT NULL,
  "reason" TEXT NOT NULL,
  "notes" TEXT,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" TEXT,
  "updated_by" TEXT,
  "validated_by" TEXT,
  "validated_at" DATETIME,
  "cancelled_at" DATETIME,
  "cancelled_by" TEXT,
  "cancellation_reason" TEXT
);

CREATE TABLE "asset_movement_lines" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "movement_id" TEXT NOT NULL,
  "asset_unit_id" TEXT NOT NULL,
  "from_location_id" TEXT NOT NULL,
  "to_location_id" TEXT NOT NULL,
  "line_notes" TEXT,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "asset_movement_lines_movement_id_fkey" FOREIGN KEY ("movement_id") REFERENCES "asset_movements" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "asset_movement_lines_asset_unit_id_fkey" FOREIGN KEY ("asset_unit_id") REFERENCES "asset_units" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "asset_movement_lines_from_location_id_fkey" FOREIGN KEY ("from_location_id") REFERENCES "locations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "asset_movement_lines_to_location_id_fkey" FOREIGN KEY ("to_location_id") REFERENCES "locations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "asset_movements_movement_number_key" ON "asset_movements"("movement_number");
CREATE INDEX "asset_movements_movement_number_idx" ON "asset_movements"("movement_number");
CREATE INDEX "asset_movements_movement_type_idx" ON "asset_movements"("movement_type");
CREATE INDEX "asset_movements_movement_status_idx" ON "asset_movements"("movement_status");
CREATE INDEX "asset_movements_movement_date_idx" ON "asset_movements"("movement_date");

CREATE UNIQUE INDEX "asset_movement_lines_movement_id_asset_unit_id_key" ON "asset_movement_lines"("movement_id", "asset_unit_id");
CREATE INDEX "asset_movement_lines_movement_id_idx" ON "asset_movement_lines"("movement_id");
CREATE INDEX "asset_movement_lines_asset_unit_id_idx" ON "asset_movement_lines"("asset_unit_id");
CREATE INDEX "asset_movement_lines_from_location_id_idx" ON "asset_movement_lines"("from_location_id");
CREATE INDEX "asset_movement_lines_to_location_id_idx" ON "asset_movement_lines"("to_location_id");
