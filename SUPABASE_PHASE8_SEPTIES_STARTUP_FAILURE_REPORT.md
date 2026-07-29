# Phase 8 septies — Arrêt avant recette HTTP

Date : 2026-07-29
Commit courant : `36a446d1c38d1e032830ed8f591b77407d4acd21`
Commit créé : aucun

## Résultat

La phase s'est arrêtée avant toute requête HTTP métier. Le prévol de sécurité a
réussi, puis Next.js a refusé de démarrer car le port local 3018 était occupé
(`EADDRINUSE`).

Aucune relance n'a été effectuée.

## Garde-fou

Une combinaison volontairement incohérente a été testée :

- provider demandé : `postgresql` ;
- client demandé : `normal` ;
- schéma demandé : `immos_recipe_phase8`.

Résultat : refus avant connexion. Les schémas sont restés à 222/222 lignes.

## Prévol du démarrage réel

Le prévol du démarrage dédié a confirmé :

- provider : `postgresql` ;
- client : `recipe` ;
- client généré : `generated/prisma-recipe` ;
- schéma statique du client : `immos_recipe_phase8` ;
- `current_schema()` : `immos_recipe_phase8` ;
- `immos_recipe_phase8` : 222 lignes ;
- `immos` : 222 lignes.

Le serveur n'a ensuite pas pu écouter sur le port 3018. Aucun appel aux routes
de l'application n'a été exécuté.

## Diagnostic P2028 et correction préparée

La transaction initiale de création d'entrée utilisait le timeout interactif
Prisma implicite de 5 secondes. Elle contenait :

- validation du payload ;
- lecture des référentiels ;
- recherche des doublons ;
- génération du numéro d'entrée ;
- génération des codes de biens ;
- création de l'entrée ;
- création des unités ;
- relecture des unités.

Correction préparée dans `lib/asset-service.js` :

- validation et normalisation avant transaction ;
- lectures des référentiels avant transaction ;
- recherche des doublons avant transaction ;
- génération des numéros et codes avant transaction ;
- transaction limitée à la création de l'entrée et des unités ;
- relecture des unités après COMMIT ;
- `maxWait=10000` ;
- `timeout=30000`.

Cette correction n'a pas encore été exercée par HTTP.

## État après arrêt

- `immos` : 222 lignes, identique à SQLite sur 15/15 tables.
- `immos_recipe_phase8` : 222 lignes, identique à `immos` sur 15/15 tables.
- Violations de clés étrangères : 0.
- `asset_files` : 0.
- SQLite SHA-256 :
  `8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec`.
- Storage : bucket privé, zéro objet, aucune politique publique.
- Aucune donnée de campagne créée.
- Aucun audit de campagne créé.
- Aucun secret journalisé.

## Routes et scénarios

Aucune route HTTP métier n'a été appelée. Les scénarios positifs, négatifs,
mouvements, documents et audits restent à exécuter après une nouvelle
autorisation humaine.

## Builds

Les builds n'ont pas été relancés après cet incident de démarrage afin de
respecter l'arrêt immédiat demandé. Les derniers builds validés avant cette
tentative étaient réussis.

## Fichiers créés ou modifiés dans cette tentative

- `lib/asset-service.js`
- `scripts/preflight-postgresql-recipe.mjs`
- `scripts/test-postgresql-recipe-guard.mjs`
- `scripts/run-next-with-database.mjs`
- `scripts/run-postgresql-write-recipe.mjs`
- `SUPABASE_PHASE8_SEPTIES_STARTUP_FAILURE_REPORT.md`
- journaux ignorés sous
  `outputs/migration/phase8-http-recipe/server-septies/`
