# Phase 10C ter — Historique de migrations PostgreSQL dédié à la recette

## Conclusion

**Phase 10C ter réussie, historique recette prêt.**

Un historique Prisma autonome a été créé sous `prisma/postgresql-recipe/migrations`. Il cible exclusivement `immos_recipe_phase8`, se déploie intégralement sur une base PostgreSQL 17 vide et permet la procédure `migrate resolve` puis `migrate deploy` sur une restauration du dump recette.

Aucune migration et aucun `migrate resolve` n'ont été exécutés sur la vraie recette ou sur la production.

## Commit et état Git initial

- Commit de départ : `f4deccac406f07d7e252bdd835dee916b1c96107`
- Dernier commit : `f4decca feat: prepare asset file storage metadata schema`
- Fichiers non suivis initiaux :
  - `SUPABASE_PHASE10C_RECIPE_MIGRATION_REPORT.md`
  - `SUPABASE_PHASE10C_BIS_PGDUMP17_BACKUP_REPORT.md`
  - `SUPABASE_PHASE10C_RECIPE_MIGRATION_RESUME_REPORT.md`
- Aucun fichier applicatif, Prisma ou migration déjà modifié

## Cause du blocage Phase 10C

L'historique PostgreSQL production se trouve sous :

`prisma/postgresql/migrations`

Sa migration AssetFile contient :

```sql
SET search_path = "immos";
```

Le schéma recette `prisma/postgresql-recipe/schema.prisma` déclarait correctement `immos_recipe_phase8`, mais ne possédait aucun dossier de migrations adjacent. Prisma ne pouvait donc pas associer simultanément le schéma recette, un historique autonome et un SQL ciblant la recette.

## État protégé initial

| Cible | `asset_units` | `asset_files` | FK orphelines | Colonnes Phase 10B | Migration Phase 10B |
|---|---:|---:|---:|---:|---:|
| Production `immos` | 12 | 0 | 0 | 0 | 0 |
| Recette `immos_recipe_phase8` | 13 | 0 | 0 | 0 | 0 |

- Historique réel recette : uniquement `00000000000000_baseline`
- Checksum de cette baseline historique : `ed0457f71508aa7abfa3e300d3db150679166728eed6830a44fb0651ee4ad545`
- SQLite SHA-256 : `8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec`
- Bucket `asset-files` : privé et vide
- Dump : présent, 86 900 octets, SHA-256 conforme
- Trois JPEG historiques : inchangés

## Audit des schémas et historiques

### PostgreSQL production

- Schéma Prisma : `prisma/postgresql/schema.prisma`
- Client généré : `generated/prisma-postgresql`
- Datasource : `SUPABASE_DIRECT_URL`
- Schéma SQL : `immos`
- Historique :
  - `00000000000000_baseline`
  - `20260729120000_add_asset_file_storage_metadata`

### PostgreSQL recette

- Schéma Prisma : `prisma/postgresql-recipe/schema.prisma`
- Client généré : `generated/prisma-recipe`
- Datasource : `SUPABASE_DIRECT_URL`
- Schéma SQL : `immos_recipe_phase8`
- Historique dédié avant cette phase : absent
- Scripts existants :
  - `prisma:generate:recipe`
  - `prisma:validate:recipe`
  - `dev:postgresql:recipe`

Le wrapper générique `scripts/run-prisma-supabase.mjs` reste orienté vers `immos`. Il n'a pas été modifié et n'est pas utilisé pour déployer l'historique recette.

## Choix de baseline

### Option A — recopier l'historique avec le même nom de baseline

Rejetée pour la vraie recette : celle-ci possède déjà `00000000000000_baseline` avec le checksum de la baseline production. Une baseline recette adaptée sous le même nom aurait un checksum différent.

### Option B — baseline recette autonome et distincte

**Option retenue.**

La baseline recette porte le nom :

`00000000000001_recipe_baseline`

Elle représente l'état complet avant Phase 10B et cible explicitement `immos_recipe_phase8`.

Sur une base vide, `migrate deploy` l'exécute normalement.

Sur la recette existante, la procédure future sera :

1. vérifier que l'état correspond toujours au dump de référence ;
2. exécuter une seule fois :
   `prisma migrate resolve --applied 00000000000001_recipe_baseline`
   avec la connexion ciblant `immos_recipe_phase8` ;
3. vérifier l'enregistrement et son checksum ;
4. exécuter `prisma migrate deploy` ;
5. Prisma applique alors uniquement la migration AssetFile.

Cette procédure conserve la baseline historique `00000000000000_baseline` et ajoute une baseline recette explicite, sans modifier manuellement `_prisma_migrations`.

### Option C — historique partagé avec production

Rejetée : elle conserverait des références à `immos` et couplerait les deux schémas.

## Fichiers créés

```text
prisma/postgresql-recipe/migrations/
├── 00000000000001_recipe_baseline/
│   └── migration.sql
├── 20260729120000_add_asset_file_storage_metadata/
│   └── migration.sql
└── migration_lock.toml
```

### `migration_lock.toml`

```toml
provider = "postgresql"
```

### Baseline recette

- Taille : 23 299 octets
- SHA-256 : `db9d1d7abc508c5ebbe80b15990cd93f89409c034c27fd531bbe5163b2773787`
- Crée uniquement `immos_recipe_phase8`
- Fixe uniquement `search_path = "immos_recipe_phase8"`
- Ne contient aucune donnée métier
- Ne contient aucune référence exacte au schéma `"immos"`

### Migration AssetFile recette

- Taille : 754 octets
- SHA-256 : `27a0d72af6b17913fbbd009dae66466f5063c60a57ac2757a8fc8b2addc2d5b0`
- Crée l'enum `StorageProvider`
- Valeurs : `LOCAL`, `SUPABASE`
- Ajoute :
  - `storage_provider` nullable ;
  - `storage_bucket` nullable ;
  - `storage_key` nullable ;
  - `updated_at`, rempli depuis `created_at`, puis rendu obligatoire.
- Ajoute trois index non uniques
- Conserve `file_path`, PK, FK et règles référentielles
- Ne contient aucune référence exacte au schéma `"immos"`

## Audit SQL

Les deux migrations recette ont été inspectées intégralement.

Confirmations :

- cible explicite : `immos_recipe_phase8` ;
- aucune référence au schéma temporaire ;
- aucune chaîne de connexion ;
- aucun secret ;
- aucun chemin Windows absolu ;
- aucun `DROP TABLE` ;
- aucun `DROP COLUMN` ;
- aucun `DELETE` ;
- aucun `INSERT` de données ;
- aucun `storedFileName` ;
- aucune modification d'une table hors baseline ;
- seul `UPDATE` métier de la migration Phase 10B :
  `updated_at = created_at`, nécessaire à la compatibilité avec une table non vide.

Les occurrences `ON UPDATE` de la baseline sont des règles de FK, pas des mises à jour de données.

## Environnement de test

Un cluster PostgreSQL 17.10 local éphémère a été créé sous `backups/phase10c-ter`, écoutant uniquement sur `127.0.0.1:55432`.

Deux bases jetables ont été utilisées :

- `phase10c_empty`
- `phase10c_restore`

Les variables de connexion des commandes de test pointaient exclusivement vers ce cluster local. Aucune commande Prisma de test n'a utilisé une URL Supabase.

Une première tentative `initdb` avec l'extraction client minimale a échoué avant création du cluster, car `postgres.bki` n'était pas inclus. Aucun serveur n'avait alors démarré. Le payload serveur PostgreSQL 17.10 officiel a ensuite été extrait localement pour le test, sans service système ni modification du PATH.

## Test migrate deploy sur base vide

Commande logique :

```text
prisma migrate deploy \
  --schema prisma/postgresql-recipe/schema.prisma
```

Datasource de test :

```text
postgresql://postgres@127.0.0.1:55432/phase10c_empty?schema=immos_recipe_phase8
```

Résultat :

- code de sortie : 0
- durée finale : 4 929 ms
- migrations détectées : 2
- migrations appliquées dans l'ordre :
  1. `00000000000001_recipe_baseline`
  2. `20260729120000_add_asset_file_storage_metadata`
- migration échouée : aucune

Historique obtenu :

| Migration | Checksum | Terminée | Non rollbackée |
|---|---|---|---|
| `00000000000001_recipe_baseline` | `db9d1d7a…b2773787` | oui | oui |
| `20260729120000_add_asset_file_storage_metadata` | `27a0d72a…dc2d5b0` | oui | oui |

Validation du schéma vide :

- enum : `LOCAL,SUPABASE`
- `file_path` : présent et obligatoire
- trois colonnes Storage : présentes et nullables
- `updated_at` : présent et obligatoire
- `stored_file_name` : absent
- trois index Storage : présents et non uniques
- FK AssetFile → AssetUnit :
  - `ON UPDATE CASCADE`
  - `ON DELETE RESTRICT`

## Test sur restauration isolée du dump

Le dump validé a été restauré sans propriétaire ni privilèges dans `phase10c_restore`.

### État avant procédure

- `asset_units` : 13
- `asset_files` : 0
- FK orphelines : 0
- colonnes Phase 10B : 0
- historique :
  - `00000000000000_baseline`
  - checksum historique production conforme au dump

### Procédure testée

1. `prisma migrate resolve --applied 00000000000001_recipe_baseline`
2. `prisma migrate deploy`

Résultats :

- resolve : succès
- deploy : succès
- seule migration déployée :
  `20260729120000_add_asset_file_storage_metadata`
- durée du deploy : 4 378 ms

### État après procédure

- `asset_units` : 13
- `asset_files` : 0
- FK orphelines : 0
- aucune donnée métier créée ou supprimée
- `file_path` : conservé
- trois colonnes Storage : présentes et nullables
- `updated_at` : présent et obligatoire
- enum : `LOCAL,SUPABASE`
- trois index Storage : présents
- FK : `CASCADE/RESTRICT`, inchangée

Historique final isolé :

| Migration | Rôle |
|---|---|
| `00000000000000_baseline` | baseline historique provenant du dump |
| `00000000000001_recipe_baseline` | baseline autonome recette marquée appliquée |
| `20260729120000_add_asset_file_storage_metadata` | migration Phase 10B réellement déployée |

Les checksums enregistrés pour les deux nouvelles migrations correspondent exactement aux fichiers versionnés.

## Validation Prisma recette

Commandes exécutées une seule fois sur le schéma recette :

- `prisma format` : succès, 133 ms
- `prisma validate` : succès
- `prisma generate` : succès, client 6.19.3 généré en 698 ms

Client généré :

`generated/prisma-recipe`

Le client expose :

- `StorageProvider`
- `LOCAL`
- `SUPABASE`
- `storageProvider`
- `storageBucket`
- `storageKey`
- `updatedAt`
- `filePath`

Le formatage n'a produit aucune modification suivie de `schema.prisma`.

## Build PostgreSQL

Le script `build:postgresql` sélectionne le backend PostgreSQL normal et non la recette. Il n'applique aucune migration.

La première commande via `npm.ps1` a été refusée par la politique PowerShell avant démarrage de npm. L'exécution réelle unique a été effectuée via `npm.cmd`.

Résultat :

- compilation : succès, 98 s
- TypeScript : succès, 2,3 s
- génération : 20/20 pages, succès
- route `/` : dynamique `ƒ`
- P1001 : aucun
- P2028 : aucun
- migration automatique : aucune
- écriture Storage : aucune

Les avertissements Turbopack préexistants sur les traces larges des clients Prisma et `next.config.mjs` restent présents et ne sont pas liés à cette phase.

## Nettoyage

Après validation :

- cluster PostgreSQL 17 local arrêté ;
- bases locales jetables supprimées avec le cluster ;
- dossier `backups/phase10c-ter` supprimé ;
- payload serveur PostgreSQL 17 temporaire supprimé ;
- installeur téléchargé supprimé ;
- client PostgreSQL 17 minimal conservé pour le dump ;
- aucun schéma PostgreSQL temporaire distant ;
- aucun fichier SQL ou de connexion temporaire ;
- aucun processus Node, Prisma, `psql`, `pg_dump` ou `pg_restore` résiduel ;
- aucun listener sur 3000, 3018 ou 55432.

## État protégé final

| Cible | `asset_units` | `asset_files` | FK orphelines | Colonnes Phase 10B | Nouvelles migrations |
|---|---:|---:|---:|---:|---:|
| Production `immos` | 12 | 0 | 0 | 0 | 0 |
| Recette `immos_recipe_phase8` | 13 | 0 | 0 | 0 | 0 |

- vraie recette : baseline recette non résolue
- vraie recette : migration AssetFile non appliquée
- production : historique Prisma inchangé
- recette : historique Prisma inchangé
- schémas temporaires distants : 0
- SQLite SHA-256 : `8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec`
- bucket `asset-files` : privé et vide
- objet Storage créé : aucun
- URL signée créée : aucune

Dump final :

- taille : 86 900 octets
- SHA-256 :
  `59125d7433656b9e0a10556420fc33b235d764ac2aa53ddfa11c3e186f72086e`
- non modifié, hors Git

JPEG historiques :

| Taille | SHA-256 |
|---:|---|
| 2 405 379 | `4ea6fafc0e1dfec5b1763203715f20c00b2b84720c8ff9158a47a06c440fad4a` |
| 2 107 645 | `ff1a9c1a9ccf30932426389687755d2065074eacaa56948451e03903dac3bd83` |
| 1 501 619 | `d360445ca40c9e7cafc77bc7d97a2c30c9f58b766cfb5de50db422bd5d393ec` |

## État Git final

Nouveau contenu applicatif autorisé :

- `prisma/postgresql-recipe/migrations/00000000000001_recipe_baseline/migration.sql`
- `prisma/postgresql-recipe/migrations/20260729120000_add_asset_file_storage_metadata/migration.sql`
- `prisma/postgresql-recipe/migrations/migration_lock.toml`

Rapports non suivis :

- `SUPABASE_PHASE10C_RECIPE_MIGRATION_REPORT.md`
- `SUPABASE_PHASE10C_BIS_PGDUMP17_BACKUP_REPORT.md`
- `SUPABASE_PHASE10C_RECIPE_MIGRATION_RESUME_REPORT.md`
- `SUPABASE_PHASE10C_TER_RECIPE_MIGRATION_HISTORY_REPORT.md`

Aucun fichier production, provider Storage, API, UI, `.env`, SQLite, dump ou JPEG n'a été modifié.

## Confirmations

- aucune migration appliquée à la vraie recette ;
- aucune baseline résolue sur la vraie recette ;
- aucune migration appliquée à production ;
- aucune modification SQLite ;
- aucune ligne `asset_files` créée ;
- aucun objet Storage créé ;
- aucun secret exposé ;
- aucun commit créé.
