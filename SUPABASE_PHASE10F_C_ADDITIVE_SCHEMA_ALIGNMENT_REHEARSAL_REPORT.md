# Phase 10F-C — Répétition contrôlée de l’alignement additif `asset_files`

## Statut

**PHASE 10F-C VALIDÉE — ALIGNEMENT ADDITIF RÉPÉTÉ SUR COPIE UNIQUEMENT**

L’ajout des quatre colonnes Storage a été répété exclusivement sur une copie
SQLite jetable. Les trois lectures auparavant bloquées par `P2022` fonctionnent
sur la copie alignée, sans régression des dix autres scénarios. La vraie SQLite,
PostgreSQL Recipe, PostgreSQL production, Auth, Storage et les trois JPEG sont
inchangés.

## État initial

- branche : `master` ;
- HEAD : `6244fdc58b6e908ea3a7483a9e3a0abe313aaf84` ;
- commit : `6244fdc feat(auth): secure Supabase authorization and recipe validation` ;
- aucun fichier suivi modifié avant 10F-C ;
- rapports historiques et fichiers 10F-A/10F-B non suivis déjà connus ;
- runtime par défaut : SQLite ;
- SQLite réelle : SHA-256
  `8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec` ;
- Recipe : 253 lignes métier, 13 `asset_units`, 0 `asset_files`,
  0 FK orpheline ;
- production : 222 lignes métier, 12 `asset_units`, 0 `asset_files` ;
- production : aucune des quatre colonnes Storage ;
- Storage : bucket `asset-files` privé et vide ;
- aucun diff Prisma, aucune migration imprévue ;
- `.env.local` ignoré et non suivi.

Toutes les lectures PostgreSQL de contrôle ont été exécutées dans une
transaction vérifiée par `SHOW transaction_read_only = on`.

## Définition exacte des quatre colonnes

| Colonne | Champ Prisma | SQLite cible | PostgreSQL cible | Nullabilité | Défaut | Index Recipe | Rôle Storage |
|---|---|---|---|---|---|---|---|
| `storage_provider` | `storageProvider: StorageProvider?` | `TEXT` | enum `StorageProvider` (`LOCAL`, `SUPABASE`) | nullable | aucun | simple et composite | choisit le provider |
| `storage_bucket` | `storageBucket: String?` | `TEXT` | `text` | nullable | aucun | composite | bucket Supabase enregistré |
| `storage_key` | `storageKey: String?` | `TEXT` | `text` | nullable | aucun | simple et composite | clé stable de l’objet |
| `updated_at` | `updatedAt: DateTime @updatedAt` | `DATETIME` | `timestamptz(3)` | non nulle | aucun | aucun | horodatage de mise à jour Prisma |

Les index Recipe associés aux métadonnées Storage sont :

- `asset_files_storage_provider_idx` ;
- `asset_files_storage_key_idx` ;
- `asset_files_storage_provider_storage_bucket_storage_key_idx`.

La répétition SQLite demandée était limitée aux quatre opérations
`ADD COLUMN`. Elle conserve donc les cinq index historiques sans créer les trois
index Storage. Ces index ne sont pas nécessaires pour supprimer `P2022`, mais
ils devront faire partie d’une migration d’alignement complète ultérieure.

## Copie SQLite jetable

- source protégée : `prisma/dev.db` ;
- copie : `tmp/phase10f-c/dev-aligned-rehearsal.db` ;
- mécanisme : copie octet par octet via `Copy-Item` avant toute ouverture en
  écriture ;
- SHA-256 initial de la source et de la copie :
  `8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec` ;
- SHA-256 de la copie après alignement :
  `9645a17ea36adfba0c8964fbf536c47a323d22f606896112f4ed62334882d5ed` ;
- SHA-256 de la source après toutes les opérations : valeur protégée inchangée ;
- copie supprimée après validation ;
- dossier temporaire absent du statut Git final.

La différence d’empreinte de la copie est exclusivement structurelle.

## Garde contre la confusion de cible

`scripts/align-asset-files-sqlite-copy.mjs` :

- exige `--database` et `--confirm-copy-only` ;
- accepte uniquement un chemin filesystem `.db` ;
- refuse les URL `postgresql://`, `postgres://` et `file://` ;
- exige un chemin résolu sous `tmp/phase10f-c` ;
- refuse le chemin exact `prisma/dev.db` ;
- refuse également tout alias résolu vers la vraie base ;
- contrôle l’en-tête SQLite ;
- exige la table `asset_files` ;
- exige exactement les treize colonnes historiques, ou l’état complètement
  aligné ;
- refuse tout état partiellement aligné ;
- refuse cette répétition si `asset_files` contient une ligne ;
- valide que le SQL contient exactement quatre instructions
  `ALTER TABLE "asset_files" ADD COLUMN` ;
- exécute les quatre ajouts dans une transaction locale ;
- rollbacke automatiquement la copie en cas d’écart.

La restriction à zéro ligne est volontaire : elle permet d’ajouter exactement
`updated_at DATETIME NOT NULL` sans valeur artificielle. Une vraie migration
contenant des lignes devra effectuer un backfill contrôlé depuis `created_at`.

## Sauvegarde logique avant application

Avant et après l’alignement :

- lignes `asset_files` : 0 ;
- checksum logique des treize colonnes historiques :
  `4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945` ;
- checksum des index :
  `81902e5c91410e830b83d4a4d75f02e52fe2aef3f306c0e6bc12aa9755cb3882` ;
- checksum des FK :
  `1b01fe965d24630a50ee7f0d487a5b5d8a2330885fce84201acab39ac3c5bdf0`.

Ces trois checksums sont strictement identiques avant/après.

La FK conservée reste :

- `asset_unit_id` vers `asset_units.id` ;
- `ON UPDATE CASCADE` ;
- `ON DELETE RESTRICT`.

Les index historiques conservés restent :

- clé primaire automatique ;
- `asset_files_asset_unit_id_idx` ;
- `asset_files_file_type_idx` ;
- `asset_files_is_primary_idx` ;
- `asset_files_deleted_at_idx`.

`PRAGMA integrity_check` retourne `ok`.

## SQL appliqué uniquement à la copie

Le fichier
`scripts/sql/phase10f-c-align-asset-files-sqlite-copy.sql` contient uniquement :

```sql
ALTER TABLE "asset_files" ADD COLUMN "storage_provider" TEXT;
ALTER TABLE "asset_files" ADD COLUMN "storage_bucket" TEXT;
ALTER TABLE "asset_files" ADD COLUMN "storage_key" TEXT;
ALTER TABLE "asset_files" ADD COLUMN "updated_at" DATETIME NOT NULL;
```

Il n’a jamais été appliqué à `prisma/dev.db`.

## Compatibilité Prisma sur la copie alignée

Le client `generated/prisma-lot6` a été configuré avec l’URL absolue de la copie
et `mode=ro` après alignement. Ont réussi sans `P2022` :

- `assetFile.count()` ;
- `assetFile.findMany()` sans `select` ;
- `assetFile.findFirst()` sans `select` ;
- une `AssetUnit` avec `include: { assetFiles: true }` ;
- une lecture individuelle `findUnique` incluant `assetFiles` ;
- un `select` limité aux colonnes historiques ;
- un `select` contenant simultanément `storageProvider`, `storageBucket`,
  `storageKey` et `updatedAt`.

## Matrice de parité rejouée

La copie alignée était ouverte en lecture seule. Recipe était dans une
transaction `READ ONLY`. Une extension Prisma du diagnostic refusait toutes les
opérations mutantes.

| # | Scénario | 10F-B | 10F-C |
|---:|---|---|---|
| 1 | profil Auth, statut et rôle | PARITÉ CONFIRMÉE | PARITÉ CONFIRMÉE |
| 2 | compteurs tableau de bord | PARITÉ CONFIRMÉE | PARITÉ CONFIRMÉE |
| 3 | liste, recherche, filtre, tri, pagination des unités | PARITÉ CONFIRMÉE | PARITÉ CONFIRMÉE |
| 4 | détail d’unité sans fichiers | PARITÉ CONFIRMÉE | PARITÉ CONFIRMÉE |
| 5 | unité avec relation `assetFiles` implicite | BLOQUÉ PAR P2022 | PARITÉ CONFIRMÉE |
| 6 | compteur de fichiers | PARITÉ CONFIRMÉE | PARITÉ CONFIRMÉE |
| 7 | `assetFile.findMany` implicite | BLOQUÉ PAR P2022 | PARITÉ CONFIRMÉE |
| 8 | `assetFile.findFirst` implicite | BLOQUÉ PAR P2022 | PARITÉ CONFIRMÉE |
| 9 | colonnes historiques explicites | PARITÉ CONFIRMÉE | PARITÉ CONFIRMÉE |
| 10 | référentiels | PARITÉ CONFIRMÉE, données différentes attendues | PARITÉ CONFIRMÉE |
| 11 | entrées | PARITÉ CONFIRMÉE, données différentes attendues | PARITÉ CONFIRMÉE |
| 12 | mouvements | PARITÉ CONFIRMÉE, données différentes attendues | PARITÉ CONFIRMÉE |
| 13 | documents | PARITÉ CONFIRMÉE, données différentes attendues | PARITÉ CONFIRMÉE |

La classification automatique compare la forme et la taille de l’échantillon
borné. Les volumes complets restent différents de manière attendue :
222 lignes SQLite contre 253 lignes Recipe.

Résultat : **13/13 scénarios compatibles, 0 P2022, 0 autre blocage**.

## Idempotence et tests de protection

Six tests spécifiques réussissent :

1. alignement sans modification des données, index ou FK historiques ;
2. seconde exécution retournant `ALREADY_ALIGNED` ;
3. refus d’une structure partiellement alignée ;
4. refus de la vraie SQLite avant ouverture en écriture ;
5. refus d’une URL PostgreSQL et d’un chemin hors racine ;
6. lectures Prisma implicites, relationnelles, historiques et Storage sans
   `P2022`.

Un premier passage du sixième test avait réussi ses lectures mais Windows avait
tenté de supprimer la copie avant la fermeture du client Prisma. L’ordre du
nettoyage du test a été corrigé ; le passage final est 6/6.

## Rollback

Le rollback validé est simple et sans suppression de colonne :

1. conserver `prisma/dev.db` fermée et intacte ;
2. exécuter toute répétition uniquement sur une copie identifiée ;
3. en cas d’échec SQL, rollback transactionnel de la copie ;
4. après analyse, supprimer uniquement le dossier temporaire résolu
   `tmp/phase10f-c` ;
5. continuer à utiliser la vraie SQLite, dont le runtime n’a jamais changé.

La copie jetable a été supprimée. Aucune dépendance applicative irréversible
n’a été créée.

## Brouillon PostgreSQL production

Le fichier
`scripts/sql/phase10f-c-production-alignment-draft-NOT-EXECUTED.sql` porte
explicitement la mention :

**NON EXÉCUTÉ — BROUILLON POUR PHASE ULTÉRIEURE**

Il :

- cible exclusivement `"immos"` ;
- refuse un autre `current_schema()` ;
- refuse un état partiel des quatre colonnes ;
- prépare l’enum `StorageProvider` seulement s’il est absent ;
- utilise `ADD COLUMN IF NOT EXISTS` pour les quatre champs ;
- bloque si un backfill `updated_at` reste nécessaire ;
- prépare la contrainte `NOT NULL` et les trois index Recipe ;
- demande les contrôles 222/12/0 avant validation ;
- se termine volontairement par `ROLLBACK`, jamais `COMMIT`.

Ce fichier n’a pas été exécuté. Aucune connexion PostgreSQL d’écriture n’a été
ouverte.

## Tests et contrôles

- tests historiques : **181/181 réussis** ;
- tests spécifiques 10F-C : **6/6 réussis** ;
- total local : **187/187 réussis**, 0 échec ;
- matrice distante : 13/13 compatible ;
- syntaxe des trois scripts JavaScript : réussie ;
- `git diff --check` : réussi ;
- build SQLite : réussi ;
- TypeScript intégré au build : réussi en 2,5 s ;
- 19 pages générées ;
- avertissement NFT/Turbopack Prisma historique, non bloquant ;
- prévol PostgreSQL Recipe réel sans `RECIPE_SKIP_PREFLIGHT` :
  `RECIPE_PREFLIGHT_OK`.

## Scan de secrets

- aucune valeur réelle des quatre secrets Supabase chargés localement dans les
  fichiers 10F-C ;
- `.env.local` ignoré et non suivi ;
- aucun JWT, cookie, token, mot de passe ou URL signée ajouté ;
- aucune valeur sensible affichée ou copiée dans ce rapport.

## États finaux protégés

### SQLite réelle

- SHA-256 :
  `8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec` ;
- runtime par défaut inchangé ;
- aucune écriture ;
- aucune migration appliquée.

### PostgreSQL Recipe

- transaction de contrôle read-only ;
- 253 lignes métier ;
- 13 `asset_units` ;
- 0 `asset_files` ;
- 0 FK orpheline ;
- quatre colonnes Storage toujours présentes ;
- aucune mutation.

### PostgreSQL production

- transaction de contrôle read-only ;
- 222 lignes métier ;
- 12 `asset_units` ;
- 0 `asset_files` ;
- les quatre colonnes Storage toujours absentes ;
- brouillon SQL non exécuté ;
- aucune mutation.

### Storage, Auth et JPEG

- bucket `asset-files` privé et vide ;
- aucune écriture Storage ;
- aucune modification Auth ;
- trois JPEG historiques présents avec leurs trois empreintes de référence ;
- aucune écriture dans `public/uploads/assets`.

## Fichiers créés ou modifiés

Créés :

- `scripts/align-asset-files-sqlite-copy.mjs` ;
- `scripts/sql/phase10f-c-align-asset-files-sqlite-copy.sql` ;
- `scripts/sql/phase10f-c-production-alignment-draft-NOT-EXECUTED.sql` ;
- `scripts/test-phase10f-c-sqlite-alignment.mjs` ;
- `SUPABASE_PHASE10F_C_ADDITIVE_SCHEMA_ALIGNMENT_REHEARSAL_REPORT.md`.

Modifié :

- `scripts/diagnose-read-only-functional-parity.mjs`, uniquement pour accepter
  explicitement une copie SQLite et son empreinte attendue ; son comportement
  protégé par défaut reste `prisma/dev.db` en lecture seule.

Non conservés :

- copie et fichiers de tests sous `tmp/phase10f-c`, supprimés après validation.

## Confirmation finale

- aucune donnée protégée modifiée ;
- aucun schéma Prisma modifié ;
- aucune migration créée ou exécutée ;
- aucune activation PostgreSQL par défaut ;
- aucun fichier métier modifié ;
- aucun commit ;
- aucun push ;
- aucun tag.
