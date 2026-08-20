BEGIN;

CREATE TABLE "immos"."quantitative_stock_positions" (
  "id" text NOT NULL,
  "asset_entry_id" text NOT NULL,
  "location_id" text NOT NULL,
  "available_quantity" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamptz(3) NOT NULL,
  "created_by" text,
  "updated_by" text,
  CONSTRAINT "quantitative_stock_positions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "quantitative_stock_positions_available_quantity_check" CHECK ("available_quantity" >= 0),
  CONSTRAINT "quantitative_stock_positions_asset_entry_id_location_id_key" UNIQUE ("asset_entry_id", "location_id"),
  CONSTRAINT "quantitative_stock_positions_asset_entry_id_fkey"
    FOREIGN KEY ("asset_entry_id") REFERENCES "immos"."asset_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "quantitative_stock_positions_location_id_fkey"
    FOREIGN KEY ("location_id") REFERENCES "immos"."locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "quantitative_stock_positions_asset_entry_id_idx"
  ON "immos"."quantitative_stock_positions"("asset_entry_id");
CREATE INDEX "quantitative_stock_positions_location_id_idx"
  ON "immos"."quantitative_stock_positions"("location_id");

CREATE TABLE "immos"."quantitative_movement_lines" (
  "id" text NOT NULL,
  "movement_id" text NOT NULL,
  "asset_entry_id" text NOT NULL,
  "from_location_id" text,
  "to_location_id" text,
  "quantity" integer NOT NULL,
  "line_notes" text,
  "created_at" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "quantitative_movement_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "quantitative_movement_lines_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "quantitative_movement_lines_movement_id_fkey"
    FOREIGN KEY ("movement_id") REFERENCES "immos"."asset_movements"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "quantitative_movement_lines_asset_entry_id_fkey"
    FOREIGN KEY ("asset_entry_id") REFERENCES "immos"."asset_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "quantitative_movement_lines_from_location_id_fkey"
    FOREIGN KEY ("from_location_id") REFERENCES "immos"."locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "quantitative_movement_lines_to_location_id_fkey"
    FOREIGN KEY ("to_location_id") REFERENCES "immos"."locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "quantitative_movement_lines_movement_id_idx"
  ON "immos"."quantitative_movement_lines"("movement_id");
CREATE INDEX "quantitative_movement_lines_asset_entry_id_idx"
  ON "immos"."quantitative_movement_lines"("asset_entry_id");
CREATE INDEX "quantitative_movement_lines_from_location_id_idx"
  ON "immos"."quantitative_movement_lines"("from_location_id");
CREATE INDEX "quantitative_movement_lines_to_location_id_idx"
  ON "immos"."quantitative_movement_lines"("to_location_id");

COMMIT;
