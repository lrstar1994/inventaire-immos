CREATE TABLE "quantitative_stock_positions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "asset_entry_id" TEXT NOT NULL,
  "location_id" TEXT NOT NULL,
  "available_quantity" INTEGER NOT NULL DEFAULT 0 CHECK ("available_quantity" >= 0),
  "created_at" DATETIME NOT NULL DEFAULT current_timestamp,
  "updated_at" DATETIME NOT NULL,
  "created_by" TEXT,
  "updated_by" TEXT,
  CONSTRAINT "quantitative_stock_positions_asset_entry_id_fkey"
    FOREIGN KEY ("asset_entry_id") REFERENCES "asset_entries" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "quantitative_stock_positions_location_id_fkey"
    FOREIGN KEY ("location_id") REFERENCES "locations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "quantitative_stock_positions_asset_entry_id_location_id_key"
    UNIQUE ("asset_entry_id", "location_id")
);

CREATE INDEX "quantitative_stock_positions_asset_entry_id_idx"
  ON "quantitative_stock_positions"("asset_entry_id");
CREATE INDEX "quantitative_stock_positions_location_id_idx"
  ON "quantitative_stock_positions"("location_id");

CREATE TABLE "quantitative_movement_lines" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "movement_id" TEXT NOT NULL,
  "asset_entry_id" TEXT NOT NULL,
  "from_location_id" TEXT,
  "to_location_id" TEXT,
  "quantity" INTEGER NOT NULL CHECK ("quantity" > 0),
  "line_notes" TEXT,
  "created_at" DATETIME NOT NULL DEFAULT current_timestamp,
  CONSTRAINT "quantitative_movement_lines_movement_id_fkey"
    FOREIGN KEY ("movement_id") REFERENCES "asset_movements" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "quantitative_movement_lines_asset_entry_id_fkey"
    FOREIGN KEY ("asset_entry_id") REFERENCES "asset_entries" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "quantitative_movement_lines_from_location_id_fkey"
    FOREIGN KEY ("from_location_id") REFERENCES "locations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "quantitative_movement_lines_to_location_id_fkey"
    FOREIGN KEY ("to_location_id") REFERENCES "locations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "quantitative_movement_lines_movement_id_idx"
  ON "quantitative_movement_lines"("movement_id");
CREATE INDEX "quantitative_movement_lines_asset_entry_id_idx"
  ON "quantitative_movement_lines"("asset_entry_id");
CREATE INDEX "quantitative_movement_lines_from_location_id_idx"
  ON "quantitative_movement_lines"("from_location_id");
CREATE INDEX "quantitative_movement_lines_to_location_id_idx"
  ON "quantitative_movement_lines"("to_location_id");
