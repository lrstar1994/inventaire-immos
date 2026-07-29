# Phase 8 nonies ter — Validation contrôlée du mouvement

Date : 2026-07-29
Commit créé : aucun

## Résultat

La validation unique du mouvement a réussi avec HTTP 200 et COMMIT. Le mouvement
est `VALIDATED`, l'unité a été déplacée vers l'emplacement prévu et les deux
audits ont été créés dans la même transaction.

Le test de seconde validation a confirmé le comportement idempotent existant de
l'API : HTTP 200 sans nouvelle écriture ni nouvel audit. L'API ne rejette pas
une seconde validation ; elle retourne le mouvement déjà validé.

## Port et processus

Avant démarrage :

- port 3018 libre ;
- aucun processus Node/Next associé au projet ;
- aucun ancien serveur de recette.

Serveur contrôlé :

- PID contrôleur : `15536` ;
- démarrage : `2026-07-29T07:27:15.7307638+03:00` ;
- PID Next : `21824` ;
- PID écouteur : `7648` ;
- port : 3018 ;
- client : `generated/prisma-recipe` ;
- schéma : `immos_recipe_phase8`.

Arbre vérifié :

`15536` → `21824` → `7648`.

Après les contrôles :

- processus contrôleur et enfants arrêtés explicitement ;
- port 3018 libre.

## Prévol

- `APP_DATABASE_PROVIDER=postgresql` ;
- `APP_PRISMA_CLIENT=recipe` ;
- client généré : `generated/prisma-recipe` ;
- `current_schema()=immos_recipe_phase8` ;
- `immos_recipe_phase8` : 245 lignes ;
- `immos` : 222 lignes ;
- `asset_files=0` ;
- mouvement unique en `DRAFT` ;
- une ligne de mouvement ;
- unité dans l'emplacement d'origine ;
- aucun audit de validation.

## GET non destructifs

| Route | HTTP | Résultat |
|---|---:|---|
| `GET /api/health` | 200 | base accessible |
| `GET /api/asset-movements/cms5k4pgx0001v5ckzffmjdzh` | 200 | mouvement `DRAFT` |

Après les GET, les états 245/222 étaient inchangés.

## Correction exécutée

La transaction réellement chargée utilisait :

- `maxWait=10000` ;
- `timeout=30000`.

Elle conservait atomiquement :

- relecture du mouvement et de sa ligne ;
- contrôle du statut ;
- relecture de l'unité ;
- contrôle de disponibilité et d'emplacement ;
- mise à jour de l'unité ;
- mise à jour du mouvement ;
- création des deux audits.

Seule la normalisation syntaxique de l'identifiant était préparée avant la
transaction. Aucune règle métier n'a été modifiée.

## Validation unique

- route :
  `POST /api/asset-movements/cms5k4pgx0001v5ckzffmjdzh/validate` ;
- HTTP : 200 ;
- résultat : COMMIT ;
- durée HTTP mesurée côté client : 13 338 ms ;
- acquisition de transaction : 316 ms ;
- durée interne de transaction : 8 162 ms ;
- durée totale de l'appel transactionnel : 8 712 ms ;
- lectures métier dans la transaction : 2 ;
- écritures métier dans la transaction : 3 ;
- contrôles de schéma avant écritures : 3 ;
- total logique instrumenté : 5 opérations métier, plus 3 contrôles de cible.

État après COMMIT :

- mouvement : `VALIDATED` ;
- `validatedAt` présent ;
- `validatedById` présent ;
- une seule ligne de mouvement ;
- unité `cms5jogls000rv5zw49j8a13s` déplacée de
  `cms5jnaj40009v5zwxz50blnq` vers `cms5jn62k0005v5zw63q3jdhk` ;
- statut unité : `IN_STOCK` ;
- aucune duplication ;
- violations FK : 0 ;
- `asset_files=0`.

Audits atomiques créés une seule fois :

- `cms5l5pdb0000v5wgp6f16vkp` —
  `ASSET_MOVEMENT_VALIDATED`, rattaché au mouvement ;
- `cms5l5pe60001v5wg4no7id2g` —
  `ASSET_UNIT_LOCATION_UPDATED_BY_MOVEMENT`, rattaché à l'unité, avec
  mouvement, origine et destination dans les métadonnées.

## Seconde validation

- HTTP : 200 ;
- durée HTTP : 2 782 ms ;
- état retourné : `VALIDATED` ;
- comportement : idempotent ;
- nouvelle écriture : aucune ;
- nouvel audit : aucun ;
- total des audits de validation : toujours 2.

## États finaux

### `immos_recipe_phase8`

- avant : 245 lignes ;
- après : 247 lignes ;
- différence : les 2 audits atomiques ;
- mouvement et unité modifiés sans création de ligne métier supplémentaire ;
- intégrité FK : 0 violation ;
- `asset_files=0`.

### `immos`

- avant : 222 lignes ;
- après : 222 lignes ;
- comparaison SQLite : 15/15 identiques ;
- aucun identifiant ou contenu de campagne ;
- empreintes inchangées.

### SQLite et Storage

- SQLite SHA-256 :
  `8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec` ;
- Storage privé et vide ;
- aucun upload ;
- aucune politique publique.

## Sécurité et arrêt

- aucun secret affiché ou journalisé ;
- aucune écriture dans `immos` ;
- contexte normal conservé ;
- campagne et schéma temporaire conservés ;
- aucun nettoyage ;
- aucun commit.

## Fichiers modifiés dans cette phase

- `scripts/verify-postgresql-movement-validation-result.mjs`
- `SUPABASE_PHASE8_NONIES_TER_REPORT.md`
- sorties ignorées sous
  `outputs/migration/phase8-http-recipe/server-nonies-ter/`
