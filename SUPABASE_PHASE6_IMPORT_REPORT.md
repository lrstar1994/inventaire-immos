# Phase 6 — Import contrôlé SQLite vers PostgreSQL Supabase

Date : 2026-07-28  
Commit Git courant : `601aa7ee34cb1c38472b05a0b2d97d4b4117ae30`

## Résultat global

- Source utilisée exclusivement : `outputs/migration/sqlite-export/run-1`
- Empreinte du manifeste : `9d5527100e752341dbfd6155ebc2ab28d7c3e2c20d3bfbe65d7d3dd4f25d9dc8`
- Empreinte SQLite enregistrée : `8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec`
- Cible : base Supabase validée, schéma actif `immos`
- Tables métier trouvées dans `immos` : 15
- Tables Inventaire Immos trouvées dans `public` : 0
- Baseline : `00000000000000_baseline`, terminée et non annulée
- État initial : 15 tables métier vides
- Résultat de la transaction : `COMMIT`
- Durée : 93 588 ms
- Lignes importées : 222
- Écriture dans Storage : aucune

La connexion contient `sslmode=require`. Derrière le pooler Supabase, `pg_stat_ssl` ne signale pas le segment TLS terminé par le pooler ; cette observation est consignée dans l'état initial sans exposer la connexion.

## Ordre réellement utilisé

1. `asset_categories`
2. `asset_documents`
3. `asset_movements`
4. `locations`
5. `sensitive_action_approvals`
6. `suppliers`
7. `users`
8. `asset_items`
9. `audit_logs`
10. `asset_entries`
11. `asset_document_entries`
12. `asset_units`
13. `asset_document_lines`
14. `asset_files`
15. `asset_movement_lines`

Les auto-références optionnelles `asset_categories.parent_id`, `locations.parent_id` et `asset_movements.related_movement_id` ont été restaurées dans une seconde passe au sein de la même transaction.

## Comparaison déterministe source/cible

| Table | Lignes | SHA-256 source et cible | Identifiants |
|---|---:|---|---|
| users | 5 | `27a4b349c2c2ebb8bbe4a3eb50e9f5fd20de28527e4e5c7e5f4f75a72c824025` | identiques |
| suppliers | 4 | `7c1fa1585e665283a284f5c94e2d9d8e1c1283a9516aea97c6117d25051f672b` | identiques |
| locations | 4 | `1bb2983a75af49bdd54239c218098e6a093cb0a16a0736a80ed567224e60f84f` | identiques |
| asset_categories | 3 | `bf0bd400a3d14a231d884488f7d344b570e9162cf6aaa6493f54303eb7f3aedc` | identiques |
| asset_items | 5 | `44df3a7c629403039991ef58f70f30552d7410a171e1df89f04e6a739df041e8` | identiques |
| asset_entries | 10 | `60c1828bb9ef0cdf89c0126fb086d00717c1ce7083cc59411cd404f034694159` | identiques |
| asset_units | 12 | `ee50ee44583d9600ecdfb47d18b067c1b892e1a13453101e4e0a0bc8fb44c859` | identiques |
| asset_files | 0 | `37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570` | identiques |
| asset_movements | 11 | `7eb0f087f52c8eb1e713c1800ed8475a6779bff42c25de78f2cddeaf2eb560e0` | identiques |
| asset_movement_lines | 13 | `b36da78cbdeb3b0b21cbb540f7cb377af2b7023cb6677eb1b7b88bd8b881613d` | identiques |
| asset_documents | 14 | `cd8676cfc3ec99a316f1d91dc50a76f35e1aed6d71f0fa1988c1de409d6b8bfc` | identiques |
| asset_document_entries | 19 | `e0a85d398a87c4f08cecee8ac3f1e689a7d4aadc5afcf29e2601123d14bf4aa9` | identiques |
| asset_document_lines | 26 | `a048ecf066916fb89493537c90e6e1a22e8bb0071d53ee0a354d3f7331918afd` | identiques |
| sensitive_action_approvals | 2 | `d1f85e459d0edc37b9d16fac54c458eba2e321d8b81570a734cffb117c0595b1` | identiques |
| audit_logs | 94 | `347edd80e58c94e02f071df2f202cc86b19522ab6468be2ebe99a15d1280e527` | identiques |

La normalisation de comparaison est limitée aux objets `Date` PostgreSQL convertis en ISO 8601. Toutes les autres colonnes sont comparées sans transformation. Les booléens, enums, entiers, valeurs nulles, textes Unicode, hashes, identifiants et instants temporels sont identiques.

## Intégrité et Prisma

- Total cible : 222 lignes
- Clés étrangères déclarées inspectées : 25
- Références invalides : 0
- Ensembles de clés primaires source/cible : identiques pour 15/15 tables
- Comptages Prisma : identiques au manifeste pour 15/15 tables
- Lectures représentatives Prisma : réussies
- Relations principales Prisma : réussies
- Valeurs d'enums présentes : lues et conformes
- `asset_files` : 0 ligne

Les 12 références polymorphes historiques de `audit_logs` sont conservées exactement :

- `asset_items` : 5
- `asset_entries` : 4
- `asset_documents` : 2
- `asset_movements` : 1

Aucune entité n'a été recréée et aucune référence n'a été remplacée par `null`.

## Storage

- Bucket : `asset-files`
- Privé : oui
- Objets avant import : 0
- Objets après import : 0
- Fichiers téléversés : 0
- Métadonnées `asset_files` créées : 0
- Trois images orphelines : non transférées et non rattachées

## Non-régression SQLite

- `DATABASE_URL` reste `file:./dev.db`
- Empreinte avant : `8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec`
- Empreinte après : `8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec`
- `prisma validate` SQLite : réussi
- Build Next.js SQLite : réussi
- TypeScript : réussi
- Pages générées : 21/21
- Erreur Prisma `P2021` : aucune
- Avertissement Turbopack NFT déjà connu : non traité

## Procédure de retour à vide préparée

Le fichier d'état initial contient l'ordre inverse des 15 tables. Un éventuel nettoyage doit employer des `DELETE` explicites dans une transaction et cibler seulement ces tables dans `immos`. Il ne doit supprimer ni le schéma, ni `_prisma_migrations`, ni les enums, contraintes, objets Supabase ou éléments de `public`. Cette procédure n'a pas été exécutée puisque l'import a réussi.

## Fichiers créés par la phase 6

- `scripts/import-sqlite-export-to-supabase.mjs`
- `scripts/verify-supabase-data-import.mjs`
- `SUPABASE_PHASE6_IMPORT_REPORT.md`
- `outputs/migration/supabase-phase-6/pre-import-state.json` (ignoré par Git)
- `outputs/migration/supabase-phase-6/import-result.json` (ignoré par Git)
- `outputs/migration/supabase-phase-6/verification.json` (ignoré par Git)
- `outputs/migration/supabase-phase-6/import-failure.json` (diagnostic du précontrôle SSL initial, ignoré par Git)
- `outputs/migration/supabase-phase-6/prisma-validate-sqlite.txt` (ignoré par Git)
- `outputs/migration/supabase-phase-6/build-sqlite.txt` (ignoré par Git)

Fichiers préexistants modifiés par la phase 6 : aucun. Les changements non commités des phases précédentes n'ont pas été modifiés.
