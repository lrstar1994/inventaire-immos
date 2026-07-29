# Phase 8 septies bis — Rapport de recette HTTP interrompue

Date : 2026-07-29
Campagne : `PG-RECIPE-PHASE8-20260729034635`
Commit créé : aucun

## Résultat

La campagne a démarré correctement avec le client et le schéma de recette. Le
scénario d'entrée précédemment bloqué par P2028 a réussi. La campagne s'est
ensuite arrêtée, sans relance, lors de la création du mouvement : la transaction
de mouvement utilise encore le timeout Prisma implicite de 5 secondes et a
expiré après 5 241 ms.

Les scénarios documents et les tests suivants n'ont pas été exécutés.

## Prévol et santé

- Provider : `postgresql`.
- Sélection : `APP_PRISMA_CLIENT=recipe`.
- Client chargé : `generated/prisma-recipe`.
- Schéma statique : `immos_recipe_phase8`.
- `current_schema()` : `immos_recipe_phase8`.
- Connexion session : port 5432, SSL requis.
- État initial : 222 lignes dans chaque schéma.
- `asset_files=0`.
- GET `/api/health` : HTTP 200.
- Réponse : application opérationnelle et base accessible.
- Aucun secret journalisé.

## Correction P2028 de l'entrée

Avant correction, la transaction de 5 secondes contenait validations, lectures,
recherche de doublons, génération, écritures et relectures.

Après correction :

- validations et préparation hors transaction ;
- transaction limitée à deux écritures :
  - création `asset_entries` ;
  - création `asset_units` ;
- relecture après COMMIT ;
- `maxWait=10000` ;
- `timeout=30000`.

Mesures :

- transaction : 2 312 ms ;
- requêtes d'écriture dans la transaction : 2 ;
- requête HTTP complète : environ 8,5 secondes ;
- résultat : HTTP 201 et COMMIT.

## Routes exécutées

| Scénario | Méthode et route | HTTP | Résultat |
|---|---|---:|---|
| Santé | `GET /api/health` | 200 | Conforme |
| Liste fournisseurs | `GET /api/suppliers` | 200 | Conforme |
| Créer fournisseur | `POST /api/suppliers` | 201 | Conforme |
| Modifier fournisseur | `PATCH /api/suppliers/{id}` | 200 | Conforme |
| Créer emplacement racine | `POST /api/locations` | 201 | Conforme |
| Créer emplacement enfant | `POST /api/locations` | 201 | Conforme |
| Modifier emplacement enfant | `PATCH /api/locations/{id}` | 200 | Conforme |
| Créer catégorie racine | `POST /api/asset-categories` | 201 | Conforme |
| Créer sous-catégorie | `POST /api/asset-categories` | 201 | Conforme |
| Créer article | `POST /api/asset-items` | 201 | Conforme |
| Fournisseur sans nom | `POST /api/suppliers` | 400 | Refus conforme |
| Enum entrée invalide | `POST /api/asset-entries` | 400 | Refus conforme |
| Quantité nulle | `POST /api/asset-entries` | 400 | Refus conforme |
| Créer entrée et unité | `POST /api/asset-entries` | 201 | Conforme |
| Modifier unité | `PATCH /api/asset-units/{id}` | 200 | Conforme |
| Enum unité invalide | `PATCH /api/asset-units/{id}` | 400 | Refus conforme |
| Mouvement sans ligne | `POST /api/asset-movements` | 400 | Refus conforme |
| Créer mouvement | `POST /api/asset-movements` | 400 | Échec inattendu P2028 |

Les validations exécutées avant les écritures sont celles des routes
applicatives existantes. Les opérations référentielles ne sont pas
transactionnelles. La création d'entrée utilise la transaction explicite
10/30 secondes. La création de mouvement utilisait encore le délai implicite de
5 secondes.

## Données conservées dans `immos_recipe_phase8`

Lignes métier créées :

- fournisseur `cms5jmm600000v5zwu34a5y0w`
- emplacement racine `cms5jn62k0005v5zw63q3jdhk`
- emplacement enfant `cms5jnaj40009v5zwxz50blnq`
- catégorie racine `cms5jnm6b000ev5zw5x3l99nu`
- sous-catégorie `cms5jnqpv000iv5zwlndnbt92`
- article `cms5jnvrr000mv5zwekkg5s5s`
- entrée `cms5jofzg000qv5zw2wfj99wz`
- unité `cms5jogls000rv5zw49j8a13s`

État du schéma temporaire :

- total : 241 lignes ;
- 8 lignes métier de campagne ;
- 11 audits associés ;
- aucun mouvement partiel ;
- aucune ligne de mouvement ;
- aucun document de campagne ;
- violations de clés étrangères : 0 ;
- `asset_files=0`.

Les audits attendus des créations et modifications réussies sont présents,
notamment `ASSET_ENTRY_CREATED`, `ASSET_UNIT_CREATED` et
`ASSET_UNIT_UPDATED`. Aucun audit de mouvement n'a été créé après le rollback.

## Protection de `immos`

Après chaque POST, PATCH ou DELETE, les 15 tables de `immos` ont été relues,
triées et comparées aux empreintes initiales.

- 16 contrôles successifs : tous `INCHANGÉ`.
- Total final : 222 lignes.
- Comparaison SQLite : 15/15 identiques.
- Aucun identifiant ou texte de campagne.
- `asset_files=0`.

## SQLite et Storage

- SQLite SHA-256 :
  `8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec`.
- Bucket `asset-files` privé et vide.
- Aucun upload.
- Aucune politique publique ajoutée.

## Arrêt

- Serveur confirmé arrêté.
- Contexte normal non modifié.
- Schéma temporaire conservé avec les données de campagne.
- Aucune correction du mouvement appliquée.
- Aucune relance.
- Aucun commit Phase 8.
- Builds non relancés après l'incident, conformément à l'arrêt immédiat.

## Fichiers créés ou modifiés dans cette reprise

- `lib/asset-service.js`
- `scripts/preflight-postgresql-recipe.mjs`
- `scripts/test-postgresql-recipe-guard.mjs`
- `scripts/run-next-with-database.mjs`
- `scripts/run-postgresql-write-recipe.mjs`
- `scripts/verify-postgresql-http-recipe.mjs`
- `SUPABASE_PHASE8_SEPTIES_BIS_REPORT.md`
- sorties ignorées sous `outputs/migration/phase8-http-recipe/`
