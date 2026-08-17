ALTER TABLE "asset_categories" ADD COLUMN "hierarchy_level" TEXT NOT NULL DEFAULT 'CATEGORY';
ALTER TABLE "asset_categories" ADD COLUMN "tracking_mode" TEXT;
ALTER TABLE "asset_categories" ADD COLUMN "control_level" TEXT;

UPDATE "asset_categories"
SET "hierarchy_level" = 'SUBCATEGORY'
WHERE "parent_id" IN (
  SELECT "id" FROM "asset_categories" WHERE "parent_id" IS NULL
);

UPDATE "asset_categories"
SET "hierarchy_level" = 'FAMILY',
    "tracking_mode" = 'I',
    "control_level" = 'C1'
WHERE "parent_id" IN (
  SELECT "id" FROM "asset_categories" WHERE "hierarchy_level" = 'SUBCATEGORY'
);

CREATE INDEX "asset_categories_hierarchy_level_idx" ON "asset_categories"("hierarchy_level");
