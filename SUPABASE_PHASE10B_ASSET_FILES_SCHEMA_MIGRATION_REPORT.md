# Phase 10B — Évolution du modèle `AssetFile`

Date : 2026-07-29

## Conclusion

**Phase 10B réussie.**

Les trois schémas Prisma sont alignés sur le modèle multi-provider validé. Deux migrations inspectables ont été ajoutées pour SQLite et PostgreSQL normal. Elles ont été testées uniquement sur une copie SQLite temporaire et un schéma PostgreSQL jetable. Aucune migration n’a été appliquée à SQLite original, `immos` ou `immos_recipe_phase8`.

Les trois clients Prisma ont été générés et les trois builds ont réussi. Aucun code applicatif, provider Storage, route ou page n’a été modifié.

## Référence et état initial

- Commit de départ : `4a022000c64a273d6492e58bfa5db3ce883a44a0`
- Message : `feat: validate supabase storage integration`
- HEAD conforme : oui
- Fichiers non suivis initiaux autorisés :
  - `SUPABASE_PHASE10A_BIS_ASSET_FILES_MODEL_VALIDATION_REPORT.md`
  - `SUPABASE_PHASE10A_TER_ASSET_FILES_SCHEMA_DESIGN_REPORT.md`
- Aucun fichier applicatif, Prisma ou migration déjà modifié

## Décisions humaines appliquées

- enum Prisma `StorageProvider`
- valeurs strictes `LOCAL` et `SUPABASE`
- aucun `storedFileName`
- nom technique dérivé du dernier segment de `storageKey`
- `filePath` conservé avec son nom, son mapping, sa nullabilité et sa sémantique actuels
- nouveaux champs initialement nullables
- aucune contrainte unique finale avant backfill
- aucune migration de fichier ou de donnée

## État protégé initial

| Cible | Schéma | `asset_units` | `asset_files` | FK orpheline | `storage_provider` déjà présent |
|---|---|---:|---:|---:|---|
| PostgreSQL production | `immos` | 12 | 0 | 0 | non |
| PostgreSQL recette | `immos_recipe_phase8` | 13 | 0 | 0 | non |

- SQLite SHA-256 : `8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec`
- bucket `asset-files` : privé et vide
- trois JPEG historiques : inchangés
- ports 3000 et 3018 : libres
- aucun processus Node, Prisma ou psql résiduel

## Fichiers Prisma réellement utilisés

### SQLite

- Schéma : `prisma/schema.prisma`
- Provider : `sqlite`
- Client généré : `generated/prisma-lot6`
- Historique de migrations : `prisma/migrations`
- Commandes :
  - génération : `prisma generate`
  - migration locale habituelle : `prisma migrate dev`
  - application manuelle existante : `node --experimental-sqlite scripts/apply-sqlite-migration.mjs`

### PostgreSQL normal

- Schéma : `prisma/postgresql/schema.prisma`
- Provider : `postgresql`
- schéma SQL déclaré : `immos`
- Client généré : `generated/prisma-postgresql`
- Historique de migrations : `prisma/postgresql/migrations`
- La baseline fixe explicitement `search_path = immos`.

### PostgreSQL recette

- Schéma : `prisma/postgresql-recipe/schema.prisma`
- Provider : `postgresql`
- schéma SQL déclaré : `immos_recipe_phase8`
- Client généré : `generated/prisma-recipe`
- Aucun historique de migrations dédié n’existait avant cette phase.
- Le projet utilise des scripts de préparation de recette et le même modèle conceptuel adapté au schéma cible.

### Scripts npm

- `prisma:generate`
- `prisma:generate:recipe`
- `prisma:validate:recipe`
- `db:migrate`
- `db:apply-local`
- `build`
- `build:sqlite`
- `build:postgresql`

Les dossiers `generated/` sont ignorés par Git et ne figurent pas dans le diff final.

## Ancien et nouveau modèle

### Ancien modèle

`AssetFile` contenait notamment :

- `id`
- `assetUnitId`
- `fileType`
- `fileName`
- `filePath`
- `mimeType`
- `fileSize`
- `createdAt`
- `deletedAt`

Il ne portait ni provider, ni bucket, ni clé Storage, ni `updatedAt`.

### Enum ajouté

```prisma
enum StorageProvider {
  LOCAL
  SUPABASE
}
```

Dans les deux schémas PostgreSQL, l’enum est rattaché au schéma SQL correspondant avec `@@schema`.

### Champs ajoutés

```prisma
storageProvider StorageProvider? @map("storage_provider")
storageBucket   String?          @map("storage_bucket")
storageKey      String?          @map("storage_key")
updatedAt       DateTime         @updatedAt @map("updated_at")
```

PostgreSQL précise `@db.Timestamptz(3)` sur `updatedAt`.

Nullabilité :

- `storageProvider` : nullable
- `storageBucket` : nullable
- `storageKey` : nullable
- `updatedAt` : obligatoire

`updatedAt` est automatiquement maintenu par Prisma. Les migrations remplissent les lignes préexistantes depuis `createdAt`, ce qui évite un échec sur une table non vide.

### `filePath`

`filePath` reste :

```prisma
filePath String @map("file_path")
```

Aucun renommage Prisma ou SQL, aucune modification de nullabilité et aucune modification de donnée n’ont été effectués.

## Index

Index ajoutés :

- `storageProvider`
- `storageKey`
- index composé `storageProvider + storageBucket + storageKey`

Index et contraintes reportés :

- aucune unicité provider/bucket/key ;
- aucun passage à `NOT NULL` de provider ou clé ;
- aucune règle spécifique au provider local.

La FK vers `AssetUnit`, `onDelete: Restrict`, `onUpdate: Cascade` et les index historiques restent inchangés.

## Migrations créées

### SQLite

Fichier :

`prisma/migrations/20260729120000_add_asset_file_storage_metadata/migration.sql`

Résumé :

1. désactivation temporaire des FK ;
2. création de `new_asset_files` avec les nouvelles colonnes ;
3. copie de toutes les colonnes historiques ;
4. initialisation de `updated_at` avec `created_at` ;
5. remplacement contrôlé de la table ;
6. recréation des index historiques et nouveaux ;
7. réactivation des FK.

La reconstruction est nécessaire pour ajouter un champ obligatoire initialisé de manière sûre sur une éventuelle table non vide.

### PostgreSQL

Fichier :

`prisma/postgresql/migrations/20260729120000_add_asset_file_storage_metadata/migration.sql`

Résumé :

1. `search_path = immos` ;
2. création de l’enum natif ;
3. ajout des trois colonnes nullable et de `updated_at` temporairement nullable ;
4. backfill `updated_at = created_at` ;
5. passage de `updated_at` à `NOT NULL` ;
6. création des trois index.

La recette n’ayant pas d’historique de migrations dédié, la migration PostgreSQL a été validée sous forme de SQL adapté à un schéma jetable. Son application future à `immos_recipe_phase8` devra être explicitement contrôlée en Phase 10C.

## Recherche d’opérations destructrices

### PostgreSQL

Absents :

- `DROP TABLE`
- `DROP COLUMN`
- changement de PK
- changement de FK
- changement de `onDelete`
- changement de type existant
- modification d’une autre table

### SQLite

Le seul `DROP TABLE asset_files` est la reconstruction attendue, après copie complète vers `new_asset_files`.

Absents :

- suppression d’une autre table ;
- suppression d’une colonne métier ;
- changement de PK ou de FK ;
- changement de type d’une colonne existante.

## Prisma format

Les trois formatages ont terminé :

- SQLite : 148 ms
- PostgreSQL normal : 141 ms
- PostgreSQL recette : 128 ms

Le processus englobant a ensuite dépassé son timeout externe de 60 secondes alors que les trois commandes avaient affiché leur succès. Aucun processus résiduel n’était présent.

Le formatage SQLite avait réaligné plusieurs modèles historiques hors périmètre. Cette réécriture mécanique a été retirée, puis seuls l’enum et le modèle `AssetFile` ont été réappliqués. Le diff final des schémas reste ciblé.

## Prisma validate

- SQLite : succès
- PostgreSQL normal :
  - première invocation refusée avant validation, car Prisma chargeait `.env` sans `SUPABASE_DIRECT_URL` ;
  - reprise environnementale unique via `scripts/run-prisma-supabase.mjs` : succès
- PostgreSQL recette via le wrapper sécurisé : succès

Aucune validation n’a affiché de secret ou écrit dans une base.

## Prisma generate

- `generated/prisma-lot6` : succès, 3,78 s
- `generated/prisma-postgresql` : succès, 1,41 s
- `generated/prisma-recipe` : succès, 1,07 s

Les trois clients exposent statiquement :

- `StorageProvider`
- `storageProvider`
- `storageBucket`
- `storageKey`
- `updatedAt`

Les clients générés sont ignorés par Git.

## Test SQLite sur copie

### Copie

- SHA source : `8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec`
- SHA copie initiale : identique
- copie placée sous le répertoire temporaire du système

Deux premières invocations diagnostiques via `node -e` ont échoué par altération des guillemets PowerShell avant ouverture de la copie. Chaque copie est restée au SHA source et a été supprimée.

Le test fiable a ensuite utilisé un validateur diagnostique temporaire, retiré du dépôt après exécution.

### Résultat

- migration appliquée uniquement à la copie : succès
- tables historiques : 16
- comptes de toutes les tables avant/après : identiques
- `asset_files` : 0
- `file_path` : présent et obligatoire
- `storage_provider` : `TEXT`, nullable
- `storage_bucket` : `TEXT`, nullable
- `storage_key` : `TEXT`, nullable
- `updated_at` : `DATETIME`, obligatoire
- trois nouveaux index : présents
- FK `asset_unit_id -> asset_units.id` : intacte
- `onDelete`: `RESTRICT`
- `onUpdate`: `CASCADE`
- violations FK : 0
- copie temporaire : supprimée
- dossier temporaire : supprimé

La représentation SQLite de l’enum est une colonne texte gérée par Prisma.

## Test PostgreSQL isolé

Schéma temporaire :

`immos_phase10b_migration_test`

### Prévol

- schéma absent avant test : oui
- données métier copiées : aucune
- structure minimale : `asset_units`, `asset_files`, enum `AssetFileType`, FK et index historiques

La première validation a exécuté le SQL dans un bloc annulé à cause d’une erreur du vérificateur sur la concaténation de colonnes catalogue de type `char`. Le contrôle a confirmé l’absence de schéma résiduel. La reprise a corrigé uniquement les casts du vérificateur et l’échappement du nettoyage.

### Résultat final

- création de l’enum `StorageProvider` : succès
- SQL de migration : succès
- colonnes :
  - `file_path`: présente, obligatoire
  - `storage_provider`: nullable
  - `storage_bucket`: nullable
  - `storage_key`: nullable
  - `updated_at`: obligatoire
- index attendus : présents
- FK : `RESTRICT/CASCADE`
- tables du schéma : 2
- lignes `asset_files` : 0
- aucune autre table concernée
- suppression du schéma temporaire : succès
- schéma temporaire résiduel : 0

Le SQL et les clients générés confirment que l’enum contient exactement `LOCAL` et `SUPABASE`.

## Builds

La première saisie `npm run build` a été bloquée avant npm par la politique PowerShell interdisant `npm.ps1`. La reprise environnementale unique via `npm.cmd` a réussi.

| Build | Résultat | Compilation | TypeScript | Pages |
|---|---|---|---|---|
| défaut | succès | 62 s | 9,2 s | 20/20 |
| SQLite | succès | 19,0 s | 1,351 s | 20/20 |
| PostgreSQL | succès | 19,8 s | 347 ms | 20/20 |

Pour les trois builds :

- route `/` : dynamique `ƒ`
- aucun P1001
- aucun P2028
- aucune migration automatique
- aucune écriture Storage
- aucune donnée modifiée

Un avertissement Turbopack préexistant sur une trace NFT large depuis `next.config.mjs` est présent dans les trois builds. Il n’est pas lié à cette migration et n’a pas été modifié.

## État protégé final

### SQLite original

- SHA-256 final : `8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec`
- identique à l’initial
- aucune copie temporaire résiduelle

### PostgreSQL

| Cible | `asset_units` | `asset_files` | FK orpheline | colonne `storage_provider` appliquée |
|---|---:|---:|---:|---|
| `immos` | 12 | 0 | 0 | non |
| `immos_recipe_phase8` | 13 | 0 | 0 | non |

- schéma temporaire résiduel : 0
- aucune migration appliquée aux schémas protégés

### Storage et fichiers

- bucket `asset-files` : privé et vide
- aucun objet créé
- aucune policy modifiée
- aucune URL signée créée
- trois JPEG historiques inchangés :
  - 2 405 379 octets — `4ea6fafc0e1dfec5b1763203715f20c00b2b84720c8ff9158a47a06c440fad4a`
  - 2 107 645 octets — `ff1a9c1a9ccf30932426389687755d2065074eacaa56948451e03903dac3bd83`
  - 1 501 619 octets — `d360445ca40c9e7c6afc77bc7d97a2c30c9f58b766cfb5de50db422bd5d393ec`

### Environnement

- aucun processus Node, Prisma ou psql résiduel
- ports 3000 et 3018 libres
- aucun secret exposé
- aucun commit créé

## Fichiers modifiés et ajoutés

Modifiés :

- `prisma/schema.prisma`
- `prisma/postgresql/schema.prisma`
- `prisma/postgresql-recipe/schema.prisma`

Ajoutés :

- `prisma/migrations/20260729120000_add_asset_file_storage_metadata/migration.sql`
- `prisma/postgresql/migrations/20260729120000_add_asset_file_storage_metadata/migration.sql`
- `SUPABASE_PHASE10B_ASSET_FILES_SCHEMA_MIGRATION_REPORT.md`

Rapports antérieurs non suivis conservés :

- `SUPABASE_PHASE10A_BIS_ASSET_FILES_MODEL_VALIDATION_REPORT.md`
- `SUPABASE_PHASE10A_TER_ASSET_FILES_SCHEMA_DESIGN_REPORT.md`

Aucun fichier applicatif, provider, route, page, `.env`, base, upload ou JPEG n’est inclus dans le diff.
