# Phase 8 — Arrêt contrôlé après échec d'import de recette

Date : 2026-07-28

## Git préalable

- Commit Phase 4 : `36a446d1c38d1e032830ed8f591b77407d4acd21`
- Valeurs secrètes détectées dans les fichiers commités : aucune
- Dépôt propre après le commit Phase 4 : oui

## Préparation réalisée

- Schéma temporaire : `immos_recipe_phase8`
- Baseline : appliquée intégralement
- Tables métier : 15
- Table `_prisma_migrations` : présente
- Données avant import : 0 ligne
- `asset_files` : 0 ligne
- Aucun objet créé ou modifié dans `public`

Le pooler administratif sur le port 5432 a refusé deux connexions avant toute instruction SQL. Une tentative de `prisma migrate deploy` via le pooler transactionnel est restée bloquée et a été arrêtée. L'état constaté était alors un schéma existant mais vide. La baseline SQL validée a ensuite été appliquée exactement avec `psql`, sans `db push`.

## Échec de l'import de référence

- Source : `outputs/migration/sqlite-export/run-1`
- Résultat : `ROLLBACK`
- Code Prisma : `P2028`
- Cause : expiration de la transaction interactive sur le pooler Supabase
- Emplacement : `scripts/import-sqlite-export-to-supabase.mjs`, instruction d'insertion ligne 198
- Table et colonne : Prisma n'a pas renvoyé le nom de la table ou d'une colonne, car l'identifiant de transaction était déjà expiré avant l'exécution de l'instruction suivante. Il ne s'agit pas d'une erreur de conversion de colonne.
- Relance automatique : aucune

Le script de cette exécution ne conservait pas encore le nom de la table courante dans son rapport d'échec. Une nouvelle exécution serait nécessaire pour obtenir cette information si l'échec se reproduit, mais elle est interdite sans validation humaine.

## État après rollback

### Schéma temporaire

- Schéma présent : oui
- Tables métier : 15
- Total métier : 0 ligne
- `asset_files` : 0 ligne
- Ligne partielle : aucune

### Schéma de référence `immos`

- Total : 222 lignes
- Parité SQLite/PostgreSQL : 9/9 sections identiques
- `asset_files` : 0 ligne
- Écriture de recette dans `immos` : aucune

### SQLite et Storage

- Empreinte SQLite : `8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec`
- SQLite modifiée : non
- Bucket `asset-files` : vide
- Fichier téléversé : aucun

## Tests non exécutés

Conformément à la règle d'arrêt sur échec, les écritures HTTP, validations métier, contrôles d'audit, test transactionnel volontaire, builds finaux et suppression du schéma temporaire n'ont pas été exécutés.

Le client Prisma normal du schéma `immos` a été régénéré localement après le diagnostic. Le schéma temporaire vide est conservé pour décision humaine.

## Fichiers modifiés ou créés avant l'arrêt

Modifiés :

- `lib/prisma.js`
- `package.json`
- `scripts/import-sqlite-export-to-supabase.mjs`
- `scripts/run-next-with-database.mjs`

Créés :

- `scripts/setup-postgresql-recipe-schema.mjs`
- `scripts/verify-postgresql-write-recipe.mjs`
- `scripts/cleanup-postgresql-recipe-schema.mjs`
- `SUPABASE_PHASE8_FAILURE_REPORT.md`
- `outputs/migration/supabase-phase-8/*` — ignoré par Git

Aucun commit Phase 8 n'a été créé.
