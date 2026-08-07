BEGIN;

ALTER TYPE "immos_recipe_phase8"."UserStatus" ADD VALUE IF NOT EXISTS 'PENDING' BEFORE 'ACTIVE';

CREATE UNIQUE INDEX IF NOT EXISTS "users_external_auth_id_key"
  ON "immos_recipe_phase8"."users"("external_auth_id");

COMMIT;
