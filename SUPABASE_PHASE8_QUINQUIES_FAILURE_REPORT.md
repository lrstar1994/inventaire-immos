# Phase 8 quinquies — Rapport d'arrêt sur violation de séparation

Date : 2026-07-29
Campagne : `PG-RECIPE-PHASE8-20260729025413`
Commit courant : `36a446d1c38d1e032830ed8f591b77407d4acd21`

## Résultat

La recette a été arrêtée au premier échec inattendu. Aucun scénario n'a été relancé.

Deux incidents ont été constatés :

1. Les écritures HTTP ont ciblé `immos`, malgré une URL de connexion portant
   `schema=immos_recipe_phase8`. Le client Prisma PostgreSQL généré contient des
   annotations statiques `@@schema("immos")`, qui priment sur le schéma courant
   de la connexion pour les modèles métier.
2. La création d'une entrée validée a échoué avec Prisma `P2028` : la transaction
   interactive applicative conserve son délai normal de 5 secondes et a expiré
   après 5 245 ms.

La campagne n'a pas été poursuivie après cet échec.

## Contrôles préalables

- Connexion session Supabase : port 5432, `sslmode=require`.
- Trois connexions successives : 3/3 réussies.
- `current_schema()` : `immos_recipe_phase8` pour les trois connexions.
- Schéma temporaire avant recette : 222 lignes, 15 tables, `asset_files=0`.
- Schéma `immos` avant recette : 222 lignes, parité stricte validée.
- SQLite avant recette :
  `8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec`.
- Bucket `asset-files` : privé et vide.
- Aucun secret n'a été affiché ou journalisé.

## Routes exécutées avant arrêt

| Scénario | Méthode et route | HTTP | Résultat |
|---|---|---:|---|
| Lecture préalable | `GET /api/suppliers` | 200 | Conforme |
| Création fournisseur | `POST /api/suppliers` | 201 | Écriture effectuée |
| Modification fournisseur | `PATCH /api/suppliers/{id}` | 200 | Écriture effectuée |
| Création emplacement racine | `POST /api/locations` | 201 | Écriture effectuée |
| Création emplacement enfant | `POST /api/locations` | 201 | Écriture effectuée |
| Modification emplacement enfant | `PATCH /api/locations/{id}` | 200 | Écriture effectuée |
| Création catégorie racine | `POST /api/asset-categories` | 201 | Écriture effectuée |
| Création sous-catégorie | `POST /api/asset-categories` | 201 | Écriture effectuée |
| Création article | `POST /api/asset-items` | 201 | Écriture effectuée |
| Champ fournisseur obligatoire absent | `POST /api/suppliers` | 400 | Refus conforme, aucune écriture |
| Enum d'entrée invalide | `POST /api/asset-entries` | 400 | Refus conforme, aucune écriture |
| Quantité d'entrée nulle | `POST /api/asset-entries` | 400 | Refus conforme, aucune écriture |
| Création entrée et unité | `POST /api/asset-entries` | 400 | Échec inattendu P2028 |

Les scénarios mouvements, documents, suppression logique, validations restantes
et builds n'ont pas été exécutés après l'arrêt.

## État après arrêt

### `immos_recipe_phase8`

- Toujours 222 lignes.
- Aucune donnée de campagne.
- `asset_files=0`.

### `immos`

- 236 lignes, soit 14 lignes supplémentaires :
  - 1 fournisseur ;
  - 2 emplacements ;
  - 2 catégories ;
  - 1 article ;
  - 8 journaux d'audit.
- Aucune entrée ni unité de campagne n'a été créée.
- `asset_files=0`.

Identifiants métier concernés :

- fournisseur : `cms5hqxbq0000v59ws1hoghhs`
- emplacement racine : `cms5hrfzy0005v59w8r9cbxep`
- emplacement enfant : `cms5hrgui0009v59wlha3q8i0`
- catégorie racine : `cms5hrkrj000ev59wg4r8sl8r`
- sous-catégorie : `cms5hrls8000iv59w4a6uis6p`
- article : `cms5hrnef000mv59wnej2rner`

Les huit audits portent exclusivement sur les créations et modifications
ci-dessus. Aucune correction ou suppression n'a été appliquée après détection.

### SQLite et Storage

- Empreinte SQLite après arrêt :
  `8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec`.
- Bucket `asset-files` toujours privé et vide.
- Aucun fichier téléversé.
- Aucune ligne `asset_files` créée.

## Arrêt et restauration

- Serveur de recette arrêté.
- Client Prisma normal conservé/restauré avec le schéma statique `immos`.
- Aucun commit Phase 8 créé.
- Aucun nettoyage des données distantes effectué.
- Aucun build exécuté après l'incident, conformément à l'arrêt immédiat.

## Fichiers créés ou modifiés pendant cette étape

- `lib/prisma.js`
- `scripts/run-next-with-database.mjs`
- `scripts/run-postgresql-write-recipe.mjs`
- `scripts/verify-postgresql-http-recipe.mjs`
- `SUPABASE_PHASE8_QUINQUIES_FAILURE_REPORT.md`
- sorties ignorées sous `outputs/migration/phase8-http-recipe/`

## Décision humaine requise

Avant toute reprise, il faut décider explicitement :

1. si les 14 lignes de campagne doivent être retirées de `immos` par une
   procédure contrôlée et atomique ;
2. si un client Prisma de recette généré avec
   `@@schema("immos_recipe_phase8")` doit être imposé avant le prochain
   démarrage HTTP ;
3. si le délai transactionnel applicatif de l'opération d'entrée doit être
   adapté uniquement pour la recette ou si l'opération doit être optimisée.
