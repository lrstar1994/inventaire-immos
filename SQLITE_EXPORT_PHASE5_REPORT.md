# Phase 5 — Export contrôlé de SQLite

Date d'exécution : 2026-07-28  
Commit Git source : `601aa7ee34cb1c38472b05a0b2d97d4b4117ae30`

## Résultat

- Source : `prisma/dev.db`
- Empreinte SHA-256 avant : `8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec`
- Empreinte SHA-256 après : `8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec`
- Intégrité SQLite : `ok`
- Erreurs de clés étrangères : 0
- Tables exportées : 15
- Lignes exportées : 222
- Taille des fichiers JSON métier : 107 142 octets
- Taille complète de chaque dossier d'export : 141 223 octets
- `asset_files` : 0 ligne, exportée sous la forme `[]`
- Écriture PostgreSQL / Supabase Storage : aucune

## Comptages et empreintes des fichiers métier

| Table | Lignes | SHA-256 |
|---|---:|---|
| users | 5 | `27a4b349c2c2ebb8bbe4a3eb50e9f5fd20de28527e4e5c7e5f4f75a72c824025` |
| suppliers | 4 | `7c1fa1585e665283a284f5c94e2d9d8e1c1283a9516aea97c6117d25051f672b` |
| locations | 4 | `1bb2983a75af49bdd54239c218098e6a093cb0a16a0736a80ed567224e60f84f` |
| asset_categories | 3 | `bf0bd400a3d14a231d884488f7d344b570e9162cf6aaa6493f54303eb7f3aedc` |
| asset_items | 5 | `44df3a7c629403039991ef58f70f30552d7410a171e1df89f04e6a739df041e8` |
| asset_entries | 10 | `60c1828bb9ef0cdf89c0126fb086d00717c1ce7083cc59411cd404f034694159` |
| asset_units | 12 | `ee50ee44583d9600ecdfb47d18b067c1b892e1a13453101e4e0a0bc8fb44c859` |
| asset_files | 0 | `37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570` |
| asset_movements | 11 | `7eb0f087f52c8eb1e713c1800ed8475a6779bff42c25de78f2cddeaf2eb560e0` |
| asset_movement_lines | 13 | `b36da78cbdeb3b0b21cbb540f7cb377af2b7023cb6677eb1b7b88bd8b881613d` |
| asset_documents | 14 | `cd8676cfc3ec99a316f1d91dc50a76f35e1aed6d71f0fa1988c1de409d6b8bfc` |
| asset_document_entries | 19 | `e0a85d398a87c4f08cecee8ac3f1e689a7d4aadc5afcf29e2601123d14bf4aa9` |
| asset_document_lines | 26 | `a048ecf066916fb89493537c90e6e1a22e8bb0071d53ee0a354d3f7331918afd` |
| sensitive_action_approvals | 2 | `d1f85e459d0edc37b9d16fac54c458eba2e321d8b81570a734cffb117c0595b1` |
| audit_logs | 94 | `347edd80e58c94e02f071df2f202cc86b19522ab6468be2ebe99a15d1280e527` |

Les empreintes des fichiers auxiliaires figurent dans `SHA256SUMS.txt` dans chaque dossier d'export.

## Conversions et contrôles

- Booléens SQLite `0/1` convertis en booléens JSON.
- Valeurs nulles conservées.
- Identifiants et noms de colonnes conservés.
- Montants et tailles conservés sous forme d'entiers.
- Valeurs d'enum incompatibles : 0.
- 359 valeurs temporelles en epoch Unix millisecondes, converties en ISO 8601 UTC car elles représentent déjà un instant absolu.
- 15 valeurs ISO 8601 avec décalage explicite, normalisées sans changer l'instant.
- Valeurs temporelles ambiguës ou sans fuseau explicite : 0.

Les relations déclarées par SQLite et les contrôles sémantiques métier ne présentent aucune référence invalide. Douze entrées historiques de `audit_logs` ont une référence polymorphe vers une entité absente : 5 `asset_items`, 4 `asset_entries`, 2 `asset_documents` et 1 `asset_movements`. Ces références ne sont pas des clés étrangères SQLite et restent inchangées dans l'export.

## Fichiers orphelins

Les trois images locales connues ont été contrôlées par empreinte, exclues de l'export métier et n'ont produit aucune ligne dans `asset_files`. Elles n'ont été ni copiées, ni rattachées, ni téléversées.

## Reproductibilité

Deux exports indépendants ont été créés dans `outputs/migration/sqlite-export/run-1` et `run-2`.

- Comptages identiques : oui
- Contenu JSON identique : oui
- Empreintes des 15 fichiers métier identiques : oui
- Différences autorisées : horodatage et nom du dossier uniquement

## Ordre proposé pour l'import futur

Tables racines : `asset_categories`, `asset_documents`, `asset_movements`, `locations`, `sensitive_action_approvals`, `suppliers`, `users`.

Ordre calculé :

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

Seconde passe proposée pour les auto-références optionnelles : `locations.parent_id`, `asset_categories.parent_id`, `asset_movements.related_movement_id`. Aucun cycle non résolu.

Ordre de nettoyage/rollback : ordre d'import inversé, dans une transaction et uniquement après validation explicite.

## Validation locale

- `prisma validate --schema prisma/schema.prisma` : réussi.
- `npm.cmd run build` : réussi.
- Compilation : réussie.
- TypeScript : réussi.
- Génération : 21/21 pages.
- Aucune erreur Prisma `P2021`.
- Avertissement Turbopack NFT déjà connu, non traité dans cette phase.

## Fichiers de la phase 5

Créés :

- `scripts/export-sqlite-data.mjs`
- `SQLITE_EXPORT_PHASE5_REPORT.md`
- `outputs/migration/sqlite-export/precheck/*` (ignoré par Git)
- `outputs/migration/sqlite-export/run-1/*` (ignoré par Git, données sensibles)
- `outputs/migration/sqlite-export/run-2/*` (ignoré par Git, données sensibles)
- `outputs/migration/sqlite-export/reproducibility.json` (ignoré par Git)
- `outputs/migration/sqlite-export/prisma-validate-sqlite.txt` (ignoré par Git)
- `outputs/migration/sqlite-export/build-sqlite.txt` (ignoré par Git)

Modifiés par la phase 5 : aucun fichier préexistant.

Les changements Phase 4 déjà présents dans l'arbre de travail n'ont pas été modifiés. Aucun export contenant des données métier ou sensibles n'a été ajouté à Git.
