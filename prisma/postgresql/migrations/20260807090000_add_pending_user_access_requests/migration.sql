BEGIN;

ALTER TYPE "immos"."UserStatus" ADD VALUE IF NOT EXISTS 'PENDING' BEFORE 'ACTIVE';

CREATE UNIQUE INDEX IF NOT EXISTS "users_external_auth_id_key"
  ON "immos"."users"("external_auth_id");

COMMIT;
