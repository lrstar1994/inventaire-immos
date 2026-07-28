-- Lot 3: physical asset units and homogeneous progressive entries.

CREATE TABLE "asset_entries" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entry_number" TEXT NOT NULL,
    "asset_item_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "supplier_id" TEXT,
    "quantity" INTEGER NOT NULL,
    "entry_type" TEXT NOT NULL,
    "entry_date" DATETIME NOT NULL,
    "initial_condition" TEXT NOT NULL,
    "initial_status" TEXT NOT NULL,
    "entry_status" TEXT NOT NULL DEFAULT 'VALIDATED',
    "information_status" TEXT NOT NULL DEFAULT 'PARTIAL',
    "purchase_date" DATETIME,
    "purchase_date_known" BOOLEAN NOT NULL DEFAULT false,
    "supplier_known" BOOLEAN NOT NULL DEFAULT false,
    "unit_price" INTEGER,
    "total_price" INTEGER,
    "price_known" BOOLEAN NOT NULL DEFAULT false,
    "invoice_available" BOOLEAN NOT NULL DEFAULT false,
    "invoice_reference" TEXT,
    "notes" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,
    CONSTRAINT "asset_entries_asset_item_id_fkey" FOREIGN KEY ("asset_item_id") REFERENCES "asset_items" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "asset_entries_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "asset_entries_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "asset_units" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "asset_code" TEXT NOT NULL,
    "asset_item_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "supplier_id" TEXT,
    "entry_id" TEXT,
    "serial_number" TEXT,
    "condition" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "information_status" TEXT NOT NULL DEFAULT 'PARTIAL',
    "purchase_date" DATETIME,
    "purchase_date_known" BOOLEAN NOT NULL DEFAULT false,
    "unit_price" INTEGER,
    "price_known" BOOLEAN NOT NULL DEFAULT false,
    "supplier_known" BOOLEAN NOT NULL DEFAULT false,
    "invoice_available" BOOLEAN NOT NULL DEFAULT false,
    "invoice_reference" TEXT,
    "warranty_end_date" DATETIME,
    "notes" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,
    "deleted_at" DATETIME,
    CONSTRAINT "asset_units_asset_item_id_fkey" FOREIGN KEY ("asset_item_id") REFERENCES "asset_items" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "asset_units_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "asset_units_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "asset_units_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "asset_entries" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "asset_entries_entry_number_key" ON "asset_entries"("entry_number");
CREATE INDEX "asset_entries_entry_number_idx" ON "asset_entries"("entry_number");
CREATE INDEX "asset_entries_asset_item_id_idx" ON "asset_entries"("asset_item_id");
CREATE INDEX "asset_entries_location_id_idx" ON "asset_entries"("location_id");
CREATE INDEX "asset_entries_supplier_id_idx" ON "asset_entries"("supplier_id");
CREATE INDEX "asset_entries_entry_status_idx" ON "asset_entries"("entry_status");
CREATE INDEX "asset_entries_entry_date_idx" ON "asset_entries"("entry_date");

CREATE UNIQUE INDEX "asset_units_asset_code_key" ON "asset_units"("asset_code");
CREATE INDEX "asset_units_asset_code_idx" ON "asset_units"("asset_code");
CREATE INDEX "asset_units_asset_item_id_idx" ON "asset_units"("asset_item_id");
CREATE INDEX "asset_units_location_id_idx" ON "asset_units"("location_id");
CREATE INDEX "asset_units_supplier_id_idx" ON "asset_units"("supplier_id");
CREATE INDEX "asset_units_entry_id_idx" ON "asset_units"("entry_id");
CREATE INDEX "asset_units_condition_idx" ON "asset_units"("condition");
CREATE INDEX "asset_units_status_idx" ON "asset_units"("status");
CREATE INDEX "asset_units_information_status_idx" ON "asset_units"("information_status");
