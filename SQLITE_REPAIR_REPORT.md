# Rapport de mise à niveau contrôlée de SQLite

Date : 28 juillet 2026

## Périmètre

La base SQLite source `prisma/dev.db` a été mise à niveau sans recréation, sans `db push`, sans modification SQL manuelle et sans insertion dans `asset_files`.

Les migrations appliquées par `prisma migrate deploy` sont exclusivement :

1. `20260601130000_lot_5_related_return_movements`
2. `20260608100000_lot_6_asset_files`

## Sauvegarde préalable

Sauvegarde immédiate :

`C:\Users\santa\.codex\visualizations\2026\07\28\019fa88d-0827-76b3-b4ce-2635b12b8704\sqlite-pre-migration-20260728-164931`

Elle contient :

- `prisma/dev.db` ;
- les uploads sous `public/uploads/assets` ;
- un manifeste SHA-256 ;
- un rapport d'audit pré-migration.

Aucun fichier `dev.db-journal`, `dev.db-wal` ou `dev.db-shm` n'était présent au moment de la sauvegarde.

Empreinte SQLite avant migration :

`dd22071ff5dc9feaeb09ab9edc1919ae9f6b1a48bb3db147e4c2491a00c2163f`

Empreinte immédiatement après les deux migrations :

`c1e8796244d4ece608492e7293cbcd6cb7d7d4788940f2077c0b04ee2a53e211`

Empreinte finale après la recette fonctionnelle et ses traces d'audit :

`8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec`

## Vérifications structurelles

- 15/15 tables présentes.
- 9/9 migrations enregistrées.
- `prisma migrate status` indique une base à jour.
- `PRAGMA integrity_check` retourne `ok`.
- `PRAGMA foreign_key_check` ne retourne aucune erreur.
- Les nombres de lignes des 14 tables historiques sont strictement identiques avant et immédiatement après migration.
- `asset_files` est présente et vide.
- Les quatre index `asset_files_*` sont présents.
- La clé étrangère `asset_files.asset_unit_id -> asset_units.id` est conforme.
- `asset_movements.related_movement_id` et son index sont présents.
- Les trois fichiers locaux ont conservé leurs empreintes SHA-256.
- Aucune métadonnée n'a été créée pour les trois images orphelines.

## Recette sur la source réparée

- accueil : HTTP 200 ;
- `/referentiels` : HTTP 200 ;
- `/parc` : HTTP 200 ;
- fiche du bien `LIT-KING-000002` : HTTP 200 ;
- `/documents` : HTTP 200 ;
- `/mouvements` : HTTP 200 ;
- création d'un fournisseur `REPAIR-TEST-*` : HTTP 201 ;
- suppression logique du fournisseur de test : HTTP 200 ;
- lecture directe des trois JPEG : HTTP 200 avec tailles identiques.

Le fournisseur de test n'est plus actif. Sa ligne supprimée logiquement et les deux entrées d'audit sont conservées conformément aux règles métier de traçabilité.

## Build final

`npm.cmd run build` réussit :

- compilation réussie ;
- contrôle TypeScript réussi ;
- 21/21 pages générées ;
- aucune erreur Prisma P2021.

L'avertissement Turbopack relatif au traçage large reste présent et n'a pas été traité dans cette phase.

## Git

Commit préparatoire des scripts :

`5a3685fca9a8a568dbdcb3b5682dd29fd20116fb`

La base SQLite, les uploads, les secrets, `.next`, les sauvegardes et les sorties générées restent exclus de Git.
