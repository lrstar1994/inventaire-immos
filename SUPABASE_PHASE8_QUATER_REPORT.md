# Phase 8 quater — Reconstruction propre du schéma temporaire

Date : 2026-07-29

## État de référence avant suppression

- `immos` : 222 lignes
- Parité `immos`/SQLite : 9/9 sections identiques
- `asset_files` dans `immos` : 0
- SQLite : `8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec`
- Storage : privé et vide
- Client Prisma normal : schéma `immos`

## Suppression contrôlée

La procédure a vérifié :

- connexion administrative initialement sur `immos` ;
- nom de cible exactement égal à `immos_recipe_phase8` ;
- cible différente de `immos` et `public` ;
- présence du schéma temporaire.

Résultat : seul `immos_recipe_phase8` a été supprimé. Aucun objet de `immos`, `public`, Supabase ou Storage n'a été supprimé ou modifié.

La régénération locale exécutée dans le même processus a rencontré un verrou Windows du moteur Prisma après la suppression distante. Elle a été reprise localement après la fin du processus, sans nouvelle suppression.

## Reconstruction

- Schéma : `immos_recipe_phase8`
- Baseline PostgreSQL validée : appliquée
- Tables métier : 15
- Enums : 12
- Contraintes relevées : 154
- Index : 88
- Lignes avant import : 0
- `asset_files` avant import : 0

Trois connexions session IPv4 sur le port 5432 ont réussi :

- test 1 : 4 833 ms ;
- test 2 : 2 946 ms ;
- test 3 : 2 986 ms.

Chaque test a exécuté `SELECT 1`, vérifié la base et obtenu `current_schema() = immos_recipe_phase8`.

## Algorithme hiérarchique

Pour `locations` et `asset_categories`, le script :

1. construit en mémoire une table des identifiants ;
2. vérifie que chaque parent non nul existe ;
3. extrait les racines ;
4. extrait successivement les enfants dont le parent appartient à un niveau déjà traité ;
5. refuse l'import si aucun nouveau niveau ne peut être produit, ce qui signale un cycle ;
6. trie chaque niveau par identifiant ;
7. prépare les `createMany` avec `parentId`, `createdAt` et `updatedAt` historiques présents dès l'insertion.

Cycles détectés : aucun.

- Niveaux `locations` : 3
- Niveaux `asset_categories` : 3
- Appels `update()` ou `updateMany()` hiérarchiques : 0

## Import

- Connexion : session IPv4 port 5432
- SSL : `require`
- Schéma : `immos_recipe_phase8`
- `maxWait` : 30 000 ms
- `timeout` : 300 000 ms
- Lecture de fichier dans la transaction : aucune
- Calcul d'empreinte dans la transaction : aucun
- Requêtes d'écriture préparées : 19
- Requêtes d'écriture exécutées : 19
- Résultat : `COMMIT`
- Durée : 27 357 ms
- Lignes : 222

La différence avec les 20 requêtes précédemment prévues vient de la disparition complète des cinq mises à jour hiérarchiques et de l'ajout de quatre lots de niveau : 15 lots précédents − 2 lots hiérarchiques globaux + 6 lots de niveaux = 19.

## Parité post-COMMIT

- Tables identiques : 15/15
- Total recette : 222
- Total `immos` : 222
- Identifiants : identiques
- Toutes les colonnes : identiques
- Dates : identiques
- Enums : identiques
- Valeurs nulles : identiques
- Relations : identiques
- Empreintes normalisées : identiques pour 15/15 tables
- Clés étrangères invalides : 0
- `asset_files` : 0

### Cinq timestamps précédemment divergents

| Table | Identifiant | Recette et référence |
|---|---|---|
| asset_categories | `cmpu7ytff000iw03k5m8u9x75` | `2026-05-31 20:15:35.548+00` |
| asset_categories | `cmpu7ytfq000kw03kskwg2pt0` | `2026-05-31 20:15:35.558+00` |
| locations | `cmpu7yte8000bw03k2octjjgt` | `2026-05-31 20:15:35.504+00` |
| locations | `cmpu7ytei000dw03khegs9a4r` | `2026-05-31 20:15:35.514+00` |
| locations | `cmpu7ytet000fw03kely7wg8k` | `2026-05-31 20:15:35.525+00` |

Les cinq comparaisons strictes PostgreSQL retournent `true`.

## État final des références

- `immos` : toujours 222 lignes
- Parité finale `immos`/SQLite : 9/9
- `asset_files` dans `immos` : 0
- SQLite avant et après : `8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec`
- Storage : toujours privé et vide
- Client Prisma normal `immos` : restauré
- Schéma temporaire : conservé avec 222 lignes conformes

## Fichiers

Modifiés dans l'arbre Phase 8 :

- `lib/prisma.js`
- `package.json`
- `scripts/import-sqlite-export-to-supabase.mjs`
- `scripts/run-next-with-database.mjs`

Créés dans l'arbre Phase 8 :

- `scripts/setup-postgresql-recipe-schema.mjs`
- `scripts/cleanup-postgresql-recipe-schema.mjs`
- `scripts/verify-postgresql-write-recipe.mjs`
- `scripts/check-postgresql-recipe-session-stability.mjs`
- `scripts/verify-postgresql-recipe-parity.mjs`
- `SUPABASE_PHASE8_FAILURE_REPORT.md`
- `SUPABASE_PHASE8_BIS_FAILURE_REPORT.md`
- `SUPABASE_PHASE8_TER_CONNECTIVITY_REPORT.md`
- `SUPABASE_PHASE8_TER_IMPORT_REPORT.md`
- `SUPABASE_PHASE8_QUATER_REPORT.md`
- `outputs/migration/supabase-phase-8/*` — ignoré par Git

Aucun commit Phase 8 n'a été créé. Aucune valeur de secret ou URL complète n'a été journalisée.
