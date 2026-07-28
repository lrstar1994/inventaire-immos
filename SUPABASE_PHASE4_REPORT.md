# Phase 4 — Préparation Supabase sans import

Date : 28 juillet 2026

## Connexions

- `DATABASE_URL` reste `file:./dev.db`.
- `SUPABASE_DIRECT_URL` utilise le pooler Supavisor session sur le port 5432.
- `SUPABASE_DATABASE_URL` utilise le pooler runtime sur le port 6543.
- Les deux connexions ciblent la même base et imposent `sslmode=require`.
- Les deux connexions utilisent `schema=immos`.
- Les lectures Prisma réussissent par les deux connexions.
- Aucun secret ou URL réel n'est suivi par Git.

L'endpoint direct IPv6 n'étant pas joignable depuis le réseau local, la connexion administrative utilise le pooler session Supabase recommandé pour les environnements IPv4.

## PostgreSQL

La baseline `00000000000000_baseline` a été appliquée avec `prisma migrate deploy`.

- Schéma métier : `immos`.
- 15 tables métier.
- Une table technique Prisma `_prisma_migrations`, également dans `immos`.
- 12 enums PostgreSQL.
- Aucune table Inventaire Immos dans `public`.
- Aucune table `_prisma_migrations` dans `public`.
- Toutes les tables métier sont vides.

### Tables

- `users`
- `suppliers`
- `locations`
- `asset_categories`
- `asset_items`
- `asset_entries`
- `asset_units`
- `asset_files`
- `asset_movements`
- `asset_movement_lines`
- `asset_documents`
- `asset_document_entries`
- `asset_document_lines`
- `sensitive_action_approvals`
- `audit_logs`

### Enums

- `UserRole`
- `UserStatus`
- `AssetCondition`
- `AssetUnitStatus`
- `AssetInformationStatus`
- `AssetEntryType`
- `AssetEntryStatus`
- `AssetDocumentType`
- `AssetDocumentStatus`
- `AssetMovementType`
- `AssetMovementStatus`
- `AssetFileType`

### Contraintes et types

- 15 clés primaires.
- 25 clés étrangères.
- Suppressions : 12 `SET NULL`, 10 `RESTRICT`, 3 `CASCADE`.
- Mises à jour : 25 `CASCADE`.
- 88 index, clés uniques comprises.
- Index unique partiel `asset_files_one_active_primary_per_asset_idx` validé.
- Contrainte `asset_files_primary_must_be_image_check` validée.
- 43 colonnes métier en `TIMESTAMPTZ(3)`.
- Identifiants métier en `text`, avec génération `cuid()` définie dans Prisma.
- `unit_price`, `total_price` et `file_size` restent des `integer`.

## Prisma

- `prisma validate` : succès.
- Génération du client `generated/prisma-postgresql` : succès.
- `prisma migrate status` : base à jour.
- Lecture des 15 tables via connexion directe : succès.
- Lecture des 15 tables via connexion runtime : succès.
- Toutes les lectures retournent zéro ligne.

## Storage

Bucket `asset-files` :

- privé ;
- vide ;
- limite 10 485 760 octets ;
- MIME autorisés : `image/jpeg`, `image/png`, `image/webp`, `application/pdf` ;
- aucune URL publique ;
- aucune politique publique créée ;
- aucun fichier téléversé.

Le script de configuration a été exécuté deux fois avec le même résultat, confirmant son idempotence.

## Application SQLite

L'application n'a pas été basculée vers PostgreSQL.

`npm.cmd run build` réussit :

- compilation réussie ;
- TypeScript réussi ;
- 21/21 pages générées ;
- aucune erreur Prisma.

L'avertissement Turbopack de traçage large reste présent et n'a pas été traité.

## Import

Aucun export SQLite, import PostgreSQL, téléversement Storage ou changement de chemin `asset_files` n'a été exécuté.
