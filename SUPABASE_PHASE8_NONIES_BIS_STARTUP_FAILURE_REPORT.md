# Phase 8 nonies bis — Arrêt avant validation HTTP

Date : 2026-07-29
Commit créé : aucun

## Résultat

Le prévol strict a réussi, mais le serveur n'a pas pu démarrer sur le port 3018
à cause d'un nouvel `EADDRINUSE`.

Conformément aux consignes :

- aucune relance ;
- aucune requête HTTP ;
- aucune tentative de validation ;
- aucune écriture.

## Prévol

- provider prévu : `postgresql` ;
- client prévu : `generated/prisma-recipe` ;
- `APP_PRISMA_CLIENT=recipe` ;
- schéma statique et réel : `immos_recipe_phase8` ;
- `immos_recipe_phase8` : 245 lignes ;
- `immos` : 222 lignes ;
- `asset_files=0` ;
- mouvement unique en statut `DRAFT` ;
- une ligne de mouvement ;
- unité dans son emplacement d'origine ;
- statut unité `IN_STOCK` ;
- aucun audit de validation.

Le code exécuté contient bien :

- `maxWait=10000` ;
- `timeout=30000` ;
- audits de validation créés dans la transaction ;
- contrôles de cohérence et écritures atomiques conservés dans la transaction.

## Incident de démarrage

Le port était libre lors du premier contrôle, puis un processus Node résiduel l'a
repris avant l'écoute de Next.js.

- erreur : `EADDRINUSE` ;
- port : 3018 ;
- PID occupant identifié après l'incident : `12116` ;
- processus : `node.exe` ;
- heure de démarrage du processus : 2026-07-29 06:59:35 locale ;
- processus arrêté ;
- port 3018 confirmé libre.

Le lanceur de cette phase avait déjà quitté après son échec. Aucun serveur de
recette de cette phase n'a servi de requête.

## État final

- `immos_recipe_phase8` : 245 lignes ;
- mouvement toujours `DRAFT` ;
- unité inchangée ;
- aucun audit de validation ;
- `immos` : 222 lignes et parité SQLite 15/15 ;
- SQLite SHA-256 :
  `8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec` ;
- Storage privé et vide ;
- aucun secret exposé ;
- aucun commit.

## Mesures de validation

Sans requête HTTP, aucune durée de validation, acquisition, transaction ou
nombre de requêtes métier n'est disponible. La tentative unique HTTP n'a pas été
consommée.

## Fichiers modifiés

- `SUPABASE_PHASE8_NONIES_BIS_STARTUP_FAILURE_REPORT.md`
- journaux ignorés sous
  `outputs/migration/phase8-http-recipe/server-nonies-bis/`
