ALTER TABLE "asset_movements" ADD COLUMN "related_movement_id" TEXT;

CREATE INDEX "asset_movements_related_movement_id_idx" ON "asset_movements"("related_movement_id");
