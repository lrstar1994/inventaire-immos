-- Lot 2: shared referentials for suppliers, locations, asset categories and asset item models.

CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "supplier_type" TEXT,
    "contact_name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,
    "deleted_at" DATETIME
);

CREATE TABLE "locations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "location_type" TEXT,
    "parent_id" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,
    "deleted_at" DATETIME,
    CONSTRAINT "locations_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "locations" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "asset_categories" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "parent_id" TEXT,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,
    "deleted_at" DATETIME,
    CONSTRAINT "asset_categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "asset_categories" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "asset_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "unit_label" TEXT,
    "depreciation_years" INTEGER,
    "category_id" TEXT NOT NULL,
    "supplier_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,
    "deleted_at" DATETIME,
    CONSTRAINT "asset_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "asset_categories" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "asset_items_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "suppliers_code_key" ON "suppliers"("code");
CREATE INDEX "suppliers_name_idx" ON "suppliers"("name");
CREATE INDEX "suppliers_status_idx" ON "suppliers"("status");

CREATE UNIQUE INDEX "locations_code_key" ON "locations"("code");
CREATE INDEX "locations_name_idx" ON "locations"("name");
CREATE INDEX "locations_parent_id_idx" ON "locations"("parent_id");
CREATE INDEX "locations_status_idx" ON "locations"("status");

CREATE UNIQUE INDEX "asset_categories_code_key" ON "asset_categories"("code");
CREATE INDEX "asset_categories_name_idx" ON "asset_categories"("name");
CREATE INDEX "asset_categories_parent_id_idx" ON "asset_categories"("parent_id");
CREATE INDEX "asset_categories_status_idx" ON "asset_categories"("status");

CREATE UNIQUE INDEX "asset_items_code_key" ON "asset_items"("code");
CREATE INDEX "asset_items_name_idx" ON "asset_items"("name");
CREATE INDEX "asset_items_category_id_idx" ON "asset_items"("category_id");
CREATE INDEX "asset_items_supplier_id_idx" ON "asset_items"("supplier_id");
CREATE INDEX "asset_items_status_idx" ON "asset_items"("status");
