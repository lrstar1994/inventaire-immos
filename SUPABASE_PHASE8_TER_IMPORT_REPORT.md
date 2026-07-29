# Phase 8 ter — Reprise unique de l'import optimisé

Date : 2026-07-29

## Connectivité

Configuration utilisée, sans secret :

- protocole : `postgresql`
- endpoint : pooler Supabase session IPv4
- port : `5432`
- base : `postgres`
- schéma : `immos_recipe_phase8`
- SSL : `require`

Trois connexions distinctes ont réussi :

| Test | SELECT 1 | Schéma | Durée |
|---|---|---|---:|
| 1 | réussi | `immos_recipe_phase8` | 5 153 ms |
| 2 | réussi | `immos_recipe_phase8` | 2 897 ms |
| 3 | réussi | `immos_recipe_phase8` | 3 159 ms |

Aucune erreur `P1001` et aucun timeout.

## État avant import

- Tables temporaires : 15
- Total temporaire : 0 ligne
- `asset_files` temporaire : 0 ligne
- `immos` : 222 lignes
- Parité `immos`/SQLite : 9/9
- Empreinte SQLite : `8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec`
- Storage : vide

## Import

- Tentatives : 1
- Connexion : session IPv4, port 5432
- Lots `createMany` : 15
- Mises à jour d'auto-références : 5
- Requêtes d'écriture prévues : 20
- `maxWait` : 30 000 ms
- `timeout` : 300 000 ms
- Résultat transactionnel : `COMMIT`
- Durée totale : 28 364 ms
- Lignes insérées : 222

Comptages :

| Table | Lignes |
|---|---:|
| users | 5 |
| suppliers | 4 |
| locations | 4 |
| asset_categories | 3 |
| asset_items | 5 |
| asset_entries | 10 |
| asset_units | 12 |
| asset_files | 0 |
| asset_movements | 11 |
| asset_movement_lines | 13 |
| asset_documents | 14 |
| asset_document_entries | 19 |
| asset_document_lines | 26 |
| sensitive_action_approvals | 2 |
| audit_logs | 94 |

## Validation post-COMMIT

- Total temporaire : 222
- Identifiants : identiques pour 15/15 tables
- Clés étrangères invalides : 0
- `asset_files` : 0
- Tables strictement identiques : 13/15
- Tables divergentes : `locations`, `asset_categories`

Cause précise :

- les 3 valeurs `locations.parent_id` et les 2 valeurs `asset_categories.parent_id` sont correctes et identiques à `immos` ;
- les cinq mises à jour Prisma utilisées pour restaurer ces auto-références ont déclenché automatiquement `@updatedAt` ;
- cinq valeurs historiques `updated_at` ont donc été remplacées par l'heure de l'import dans le seul schéma temporaire ;
- les empreintes de `locations` et `asset_categories` diffèrent pour cette raison.

Il ne s'agit ni d'une différence d'identifiant, ni d'une clé étrangère invalide, ni d'une différence de `parent_id`. La validation complète attendue est néanmoins en échec.

Conformément à l'interdiction de relance ou correction automatique :

- aucune seconde tentative ;
- aucune correction des cinq dates ;
- aucun nettoyage du schéma temporaire ;
- aucun test HTTP en écriture ;
- aucun commit Phase 8.

## Références après l'échec de parité

- `immos` : toujours 222 lignes
- Parité `immos`/SQLite : 9/9
- `asset_files` dans `immos` : 0
- SQLite : inchangée
- Storage : vide
- Client Prisma normal ciblant `immos` : restauré

## Fichiers

Créés pendant la reprise :

- `scripts/check-postgresql-recipe-session-stability.mjs`
- `scripts/verify-postgresql-recipe-parity.mjs`
- `SUPABASE_PHASE8_TER_IMPORT_REPORT.md`
- `outputs/migration/supabase-phase-8/immos-before-ter-resume.json`
- `outputs/migration/supabase-phase-8/recipe-parity.json`
- `outputs/migration/supabase-phase-8/immos-after-ter-resume.json`

Le script optimisé déjà préparé et non commité a été utilisé :

- `scripts/import-sqlite-export-to-supabase.mjs`

Aucun secret n'a été affiché dans les journaux applicatifs ou ajouté à Git. Aucun commit n'a été créé.
