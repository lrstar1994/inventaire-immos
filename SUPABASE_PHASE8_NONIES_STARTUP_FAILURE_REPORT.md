# Phase 8 nonies — Arrêt avant tentative de validation

Date : 2026-07-29
Commit créé : aucun

## Résultat

Le prévol de validation a réussi, mais Next.js n'a pas pu écouter sur le port
3018 (`EADDRINUSE`). Le port avait été contrôlé libre avant le démarrage ; un
processus résiduel l'a repris avant l'ouverture du serveur.

Aucune requête HTTP de validation n'a été exécutée. La tentative unique de
validation reste donc non consommée au niveau métier, mais aucune relance n'a
été faite conformément à l'arrêt au premier incident.

## Diagnostic et correction préparée

Route : `POST /api/asset-movements/{id}/validate`.
Handler : `app/api/asset-movements/[id]/validate/route.js`.
Service : `validateMovement()` dans `lib/movement-service.js`.

Avant correction, la transaction au timeout implicite de 5 secondes exécutait,
pour une ligne :

- 1 lecture du mouvement avec ses lignes ;
- 1 lecture de l'unité ;
- 1 mise à jour de l'unité ;
- 1 mise à jour du mouvement ;
- contrôles de schéma avant les écritures ;
- audits après COMMIT dans le handler.

La latence cumulée avait atteint 5 567 ms.

Correction préparée :

- normalisation de l'identifiant avant transaction ;
- relecture du mouvement et des lignes conservée atomiquement ;
- vérification du statut `DRAFT` conservée atomiquement ;
- relecture et validation de chaque unité conservée atomiquement ;
- déplacement de l'unité conservé atomiquement ;
- mise à jour du mouvement conservée atomiquement ;
- audits de validation et de déplacement désormais créés dans la même
  transaction ;
- suppression des audits post-transaction du handler ;
- `maxWait=10000` ;
- `timeout=30000` ;
- instrumentation de l'acquisition, de la transaction, des lectures et
  écritures.

Cette correction n'a pas été exercée par HTTP.

## Prévol réussi

- client : `generated/prisma-recipe` ;
- schéma réel : `immos_recipe_phase8` ;
- total recette : 245 ;
- total `immos` : 222 ;
- mouvement unique en `DRAFT` ;
- une ligne de mouvement ;
- unité dans l'emplacement d'origine ;
- statut unité `IN_STOCK` ;
- aucun audit de validation ;
- `asset_files=0`.

## État après arrêt

- `immos_recipe_phase8` : 245 lignes ;
- mouvement toujours `DRAFT` ;
- unité toujours à l'emplacement d'origine ;
- aucun audit de validation ;
- `immos` : 222 lignes, parité SQLite 15/15 ;
- SQLite SHA-256 :
  `8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec` ;
- Storage privé et vide ;
- port 3018 confirmé libre après arrêt ;
- aucun secret journalisé ;
- aucun commit.

## Fichiers créés ou modifiés

- `lib/movement-service.js`
- `app/api/asset-movements/[id]/validate/route.js`
- `scripts/preflight-postgresql-movement-validation.mjs`
- `scripts/resume-postgresql-movement-validation.mjs`
- `SUPABASE_PHASE8_NONIES_STARTUP_FAILURE_REPORT.md`
- journaux ignorés sous `outputs/migration/phase8-http-recipe/server-nonies/`
