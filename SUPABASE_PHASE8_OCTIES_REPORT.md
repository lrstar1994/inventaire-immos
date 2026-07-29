# Phase 8 octies — Correction de création du mouvement

Date : 2026-07-29
Campagne : `PG-RECIPE-PHASE8-20260729034635`
Commit créé : aucun

## Résultat

La tentative unique de création du mouvement a réussi avec HTTP 201 et COMMIT.
La poursuite autorisée s'est arrêtée au scénario suivant : la validation du
mouvement utilise encore une transaction au timeout implicite de 5 secondes et
a échoué avec P2028 après 5 567 ms.

Aucune seconde tentative, correction de validation ou poursuite vers les
documents n'a été effectuée.

## Cause du P2028 de création

Route : `POST /api/asset-movements`.
Handler : `app/api/asset-movements/route.js`.
Service : `createMovement()` dans `lib/movement-service.js`.

Avant correction, la transaction implicite de 5 secondes effectuait :

- lecture des unités et de leurs relations ;
- contrôle des emplacements actifs ;
- génération du numéro par lecture des mouvements existants ;
- validations et construction des lignes ;
- création imbriquée du mouvement et de ses lignes.

Pour ce scénario sans mouvement lié :

- 3 lectures préparatoires ;
- 1 création Prisma imbriquée écrivant le mouvement et sa ligne ;
- 1 lecture de sécurité `current_schema()` avant l'écriture.

La latence cumulée dépassait le délai implicite de 5 secondes.

## Correction appliquée

Déplacé hors transaction :

- validation du type ;
- normalisation de la date, du motif et des notes ;
- validation et construction des lignes ;
- lecture des unités ;
- contrôle des emplacements ;
- génération du numéro ;
- vérification d'un éventuel mouvement lié.

Conservé dans la transaction :

- création atomique imbriquée du mouvement et de ses lignes ;
- contrôle de schéma précédant l'écriture.

Paramètres ciblés :

- `maxWait=10000` ;
- `timeout=30000`.

Aucun timeout global n'a été modifié.

## Prévol

- Client : `generated/prisma-recipe`.
- Schéma statique et réel : `immos_recipe_phase8`.
- État temporaire avant reprise : 241 lignes.
- `immos` avant reprise : 222 lignes.
- `asset_files=0`.
- Unité de campagne présente.
- Aucun mouvement de campagne avant tentative.
- Aucun audit de mouvement avant tentative.

## Tentative unique de création

- Route : `POST /api/asset-movements`.
- HTTP : 201.
- Durée HTTP : 18 136 ms.
- Acquisition de transaction : 401 ms.
- Durée interne de transaction : 6 052 ms.
- Durée totale de l'appel transactionnel : 6 680 ms.
- Lectures préparatoires : 3.
- Lectures de transaction journalisées : 1 contrôle de schéma.
- Écriture Prisma transactionnelle : 1 création imbriquée.
- Résultat : COMMIT.

Mouvement créé :

- id : `cms5k4pgx0001v5ckzffmjdzh`
- statut : `DRAFT`
- ligne : `cms5k4pgx0003v5ck9xii8m65`
- unité : `cms5jogls000rv5zw49j8a13s`
- origine : `cms5jnaj40009v5zwxz50blnq`
- destination : `cms5jn62k0005v5zw63q3jdhk`

Audits créés une seule fois :

- `ASSET_MOVEMENT_CREATED` :
  `cms5k4sut0005v5ck4fnetq8h`
- `ASSET_MOVEMENT_LINE_ADDED` :
  `cms5k4uea0007v5ckmb1ntqel`

## Incident suivant : validation

Route : `POST /api/asset-movements/{id}/validate`.

Résultat :

- HTTP 400 ;
- Prisma P2028 ;
- timeout effectif : 5 secondes ;
- expiration constatée : 5 567 ms.

La transaction de validation n'a pas été modifiée dans cette phase.

Vérification du rollback :

- mouvement toujours `DRAFT` ;
- `validatedAt=null` ;
- `validatedById=null` ;
- unité toujours dans l'emplacement d'origine ;
- statut unité toujours `IN_STOCK` ;
- aucune mise à jour partielle ;
- aucun audit de validation mensonger.

## État final

### `immos_recipe_phase8`

- 245 lignes ;
- mouvement et ligne présents une seule fois ;
- 2 audits de création de mouvement ;
- intégrité relationnelle conforme ;
- `asset_files=0`.

### `immos`

- toujours exactement 222 lignes ;
- empreintes inchangées après la création et après l'échec de validation ;
- aucune donnée de campagne ;
- parité SQLite 15/15 maintenue.

### SQLite et Storage

- SQLite SHA-256 :
  `8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec`.
- Bucket `asset-files` privé et vide.
- Aucun upload et aucune politique publique ajoutée.

## Arrêt

- Serveur confirmé arrêté.
- Schéma temporaire et campagne conservés.
- Aucun nettoyage.
- Aucun commit.
- Aucun secret journalisé.
- Aucun build relancé après l'incident.

## Fichiers créés ou modifiés

- `lib/movement-service.js`
- `scripts/preflight-postgresql-recipe.mjs`
- `scripts/preflight-postgresql-movement-resume.mjs`
- `scripts/resume-postgresql-movement-recipe.mjs`
- `scripts/verify-postgresql-movement-resume.mjs`
- `SUPABASE_PHASE8_OCTIES_REPORT.md`
- sorties ignorées sous `outputs/migration/phase8-http-recipe/`
