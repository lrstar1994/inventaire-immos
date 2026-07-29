# Phase 8 bis — Arrêt au contrôle de connexion

Date : 2026-07-29

## Diagnostic de P2028 précédent

L'ancienne transaction effectuait :

- 15 verrous de tables ;
- 15 comptages dans la transaction ;
- 222 insertions unitaires ;
- 5 mises à jour d'auto-références ;
- soit 257 requêtes applicatives dans la transaction, hors ouverture et commit.

Les lectures JSON, validations du manifeste, SHA-256, préparation de l'ordre, contrôle de cible, contrôle Storage et lecture des métadonnées PostgreSQL avaient lieu avant la transaction.

Paramètres précédents :

- `maxWait` : 20 000 ms ;
- `timeout` : 120 000 ms.

La transaction a expiré au plafond de 120 secondes. L'ancien script ne conservait pas la table courante ; Prisma a renvoyé `P2028` à l'instruction d'insertion suivante.

## Stratégie optimisée préparée

- Conversion complète des colonnes SQLite vers les champs Prisma avant transaction.
- Conversion des dates avant transaction.
- Lots `createMany` de 50 lignes.
- 15 lots d'insertion pour les 14 tables non vides : un lot par table, sauf `audit_logs` en deux lots.
- `asset_files` reste sans lot car elle est vide.
- 5 mises à jour unitaires minimales pour les auto-références :
  - `asset_categories.parent_id` : 2 ;
  - `locations.parent_id` : 3 ;
  - `asset_movements.related_movement_id` : 0.
- Total prévu dans la transaction : 20 requêtes, contre 257 auparavant.
- Aucun `skipDuplicates`.
- Aucun contrôle, fichier ou appel réseau externe dans la transaction.
- Journalisation limitée à la table, au lot, aux comptages et durées.
- Contexte d'échec : table, lot, lignes traitées, code Prisma et durée.

Nouveaux paramètres limités au script :

- `maxWait` : 30 000 ms ;
- `timeout` : 300 000 ms.

## Nouvel arrêt

La connexion imposée pour l'opération a été construite à partir de `SUPABASE_DIRECT_URL`, avec :

- port session IPv4 `5432` ;
- `sslmode=require` ;
- `schema=immos_recipe_phase8`.

Le contrôle préalable de vacuité a échoué avant toute transaction et avant toute instruction SQL :

- code : `P1001` ;
- cause : serveur session Supabase injoignable sur le port 5432 ;
- import exécuté : non ;
- résultat `COMMIT` ou `ROLLBACK` : sans objet, aucune transaction ouverte ;
- relance automatique : aucune.

Le client Prisma normal du schéma `immos` a ensuite été régénéré localement.

## États

- Dernier état vérifié de `immos_recipe_phase8` : baseline complète, 15 tables métier, 0 ligne, `asset_files` vide.
- `immos` avant cette tentative : 222 lignes et parité 9/9.
- Écriture distante pendant cette tentative : aucune, la connexion n'a pas été établie.
- SQLite après la tentative : `8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec`.
- Storage : non contacté pendant cette tentative ; dernier état validé vide.

La parité technique post-import, la recette HTTP, les tests de contraintes, les builds et le nettoyage du schéma temporaire n'ont pas été lancés.

## Fichiers modifiés

- `scripts/import-sqlite-export-to-supabase.mjs`
- `scripts/verify-postgresql-write-recipe.mjs`

Les fichiers Phase 8 encore non commités restent présents :

- `lib/prisma.js`
- `package.json`
- `scripts/run-next-with-database.mjs`
- `scripts/setup-postgresql-recipe-schema.mjs`
- `scripts/cleanup-postgresql-recipe-schema.mjs`
- `SUPABASE_PHASE8_FAILURE_REPORT.md`

Créé :

- `SUPABASE_PHASE8_BIS_FAILURE_REPORT.md`

Aucun commit Phase 8 ou Phase 8 bis n'a été créé.
