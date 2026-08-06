-- NON EXÉCUTÉ — BROUILLON POUR PHASE ULTÉRIEURE
-- Ce fichier ne doit jamais être exécuté sans prévol, sauvegarde, validation
-- humaine et répétition dédiée. Cible unique : schéma de production "immos".

BEGIN;

DO $$
DECLARE
  unexpected_count integer;
BEGIN
  IF current_schema() <> 'immos' THEN
    RAISE EXCEPTION 'Schéma actif inattendu : %', current_schema();
  END IF;

  SELECT COUNT(*) INTO unexpected_count
  FROM information_schema.columns
  WHERE table_schema = 'immos'
    AND table_name = 'asset_files'
    AND column_name IN ('storage_provider', 'storage_bucket', 'storage_key', 'updated_at');

  IF unexpected_count NOT IN (0, 4) THEN
    RAISE EXCEPTION 'Alignement partiel asset_files refusé';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'immos' AND t.typname = 'StorageProvider'
  ) THEN
    CREATE TYPE "immos"."StorageProvider" AS ENUM ('LOCAL', 'SUPABASE');
  END IF;
END $$;

ALTER TABLE "immos"."asset_files"
  ADD COLUMN IF NOT EXISTS "storage_provider" "immos"."StorageProvider",
  ADD COLUMN IF NOT EXISTS "storage_bucket" text,
  ADD COLUMN IF NOT EXISTS "storage_key" text,
  ADD COLUMN IF NOT EXISTS "updated_at" timestamptz;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "immos"."asset_files" WHERE "updated_at" IS NULL) THEN
    RAISE EXCEPTION 'Backfill explicite requis avant contrainte NOT NULL';
  END IF;
END $$;

ALTER TABLE "immos"."asset_files"
  ALTER COLUMN "updated_at" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "asset_files_storage_provider_idx"
  ON "immos"."asset_files" ("storage_provider");
CREATE INDEX IF NOT EXISTS "asset_files_storage_key_idx"
  ON "immos"."asset_files" ("storage_key");
CREATE INDEX IF NOT EXISTS "asset_files_storage_provider_storage_bucket_storage_key_idx"
  ON "immos"."asset_files" ("storage_provider", "storage_bucket", "storage_key");

-- Contrôle avant COMMIT obligatoire dans une phase ultérieure :
-- 4 colonnes exactes, 3 index exacts, compteurs 222/12/0 et aucune divergence.
-- Remplacer ROLLBACK par COMMIT uniquement après validation humaine explicite.
ROLLBACK;
