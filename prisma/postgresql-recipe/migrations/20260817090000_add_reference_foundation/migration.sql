BEGIN;

CREATE TYPE "immos_recipe_phase8"."AssetCategoryLevel" AS ENUM ('CATEGORY', 'SUBCATEGORY', 'FAMILY');
CREATE TYPE "immos_recipe_phase8"."AssetTrackingMode" AS ENUM ('I', 'Q', 'QI', 'E');
CREATE TYPE "immos_recipe_phase8"."AssetControlLevel" AS ENUM ('C1', 'C2', 'C3', 'C4');

ALTER TABLE "immos_recipe_phase8"."asset_categories"
  ADD COLUMN "hierarchy_level" "immos_recipe_phase8"."AssetCategoryLevel" NOT NULL DEFAULT 'CATEGORY',
  ADD COLUMN "tracking_mode" "immos_recipe_phase8"."AssetTrackingMode",
  ADD COLUMN "control_level" "immos_recipe_phase8"."AssetControlLevel";

UPDATE "immos_recipe_phase8"."asset_categories"
SET "hierarchy_level" = 'SUBCATEGORY'
WHERE "parent_id" IN (
  SELECT "id" FROM "immos_recipe_phase8"."asset_categories" WHERE "parent_id" IS NULL
);

UPDATE "immos_recipe_phase8"."asset_categories"
SET "hierarchy_level" = 'FAMILY',
    "tracking_mode" = 'I',
    "control_level" = 'C1'
WHERE "parent_id" IN (
  SELECT "id" FROM "immos_recipe_phase8"."asset_categories" WHERE "hierarchy_level" = 'SUBCATEGORY'
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "immos_recipe_phase8"."asset_categories" child
    LEFT JOIN "immos_recipe_phase8"."asset_categories" parent ON parent."id" = child."parent_id"
    WHERE (child."hierarchy_level" = 'CATEGORY' AND child."parent_id" IS NOT NULL)
       OR (child."hierarchy_level" = 'SUBCATEGORY' AND parent."hierarchy_level" IS DISTINCT FROM 'CATEGORY')
       OR (child."hierarchy_level" = 'FAMILY' AND parent."hierarchy_level" IS DISTINCT FROM 'SUBCATEGORY')
  ) THEN
    RAISE EXCEPTION 'Hiérarchie historique incompatible avec CATEGORY/SUBCATEGORY/FAMILY';
  END IF;
END $$;

CREATE INDEX "asset_categories_hierarchy_level_idx"
  ON "immos_recipe_phase8"."asset_categories"("hierarchy_level");

COMMIT;
