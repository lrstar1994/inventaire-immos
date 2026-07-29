# Phase 8 tredecies bis — Correction du garde-fou transactionnel

Date : 2026-07-29 (Indian/Antananarivo)

## Résultat

La correction ciblée est validée. L'unique tentative de création du document
`ENTRY_SLIP` a obtenu HTTP 201 et un COMMIT atomique.

## Anomalie initiale

L'extension Prisma capturait le `PrismaClient` global `base`. Lors d'une
écriture effectuée avec un `TransactionClient tx`, elle exécutait :

```js
base.$queryRaw`SELECT current_schema() AS schema`
```

Le garde utilisait donc une autre connexion que la transaction interactive.

## Architecture avant et après

Avant :

- extension `$extends` interceptant toutes les écritures;
- requête dynamique de schéma via `base`;
- acquisition d'une connexion hors transaction;
- aucune garantie que la session contrôlée soit celle qui écrit.

Après :

- validation statique de l'URL, du client généré et du schéma conservée à la
  construction du client;
- suppression de toute requête `base.$queryRaw` dans l'extension;
- helper `assertExpectedSchema(client, expectedSchema, clientName)`;
- wrapper serveur `assertActiveDatabaseSchema(tx)`;
- première requête SQL de chaque transaction applicative :
  `tx.$queryRaw SELECT current_schema()`;
- aucune nouvelle instance Prisma;
- aucun timeout global modifié.

Les neuf transactions interactives applicatives recensées commencent désormais
par le garde transactionnel : mouvements (3), entrée (2), documents (2) et
fichiers (2).

## Preuves statiques et mock

- Recherche `base.$queryRaw` : aucun résultat dans le code applicatif.
- Aucun `prisma.$queryRaw` utilisé comme garde dans un callback transactionnel.
- Aucune nouvelle construction `new PrismaClient` dans `app/` ou `lib/`.
- Aucun nouvel appel `$disconnect` applicatif.
- Client normal : schéma statique `immos`.
- Client recipe : schéma statique `immos_recipe_phase8`.

Test de routage mock :

- schéma correct : poursuite autorisée;
- schéma fictif incorrect : erreur avant écriture simulée;
- appels au `TransactionClient` mock : 2;
- appels au client global mock : 0;
- `globalClientUsed=false`.

## Transaction réelle sans écriture

Connexion : Supavisor Session 5432, SSL requis.

Test positif :

- acquisition : 2 356 ms;
- garde `tx.current_schema()` : 462 ms;
- `tx SELECT 1` : 442 ms;
- durée transaction : 1 130 ms;
- appel transactionnel : 3 487 ms;
- résultat : COMMIT;
- schéma réel : `immos_recipe_phase8`.

Test de mismatch fictif :

- valeur attendue : `invalid_expected_schema_for_test`;
- acquisition : 225 ms;
- détection/rollback : 456 ms dans la transaction;
- appel total : 680 ms;
- résultat : ROLLBACK;
- aucune écriture tentée.

## Prévol métier

- Port 3018 libre et aucun Node du projet.
- Client chargé : `generated/prisma-recipe`.
- `current_schema()` : `immos_recipe_phase8`.
- `immos_recipe_phase8` : 247 lignes.
- `immos` : 222 lignes.
- Mouvement : `VALIDATED`.
- Unité à l'emplacement final attendu.
- Audits de validation : exactement 2.
- Document `ENTRY_SLIP` de campagne : 0.
- Audit documentaire de campagne : 0.
- Violations FK : 0.
- `asset_files` : 0.

## Serveur et lectures HTTP

- PID parent : `9844`.
- Heure de démarrage :
  `2026-07-29T09:16:20.2141125+03:00`.
- Serveur prêt en 14,6 secondes.

| Route | Code HTTP | Durée client |
|---|---:|---:|
| `/api/health` | 200 | 85 714 ms |
| `/api/asset-movements/cms5k4pgx0001v5ckzffmjdzh` | 200 | 17 619 ms |
| `/api/asset-units/cms5jogls000rv5zw49j8a13s` | 200 | 9 743 ms |
| `/api/asset-documents` | 200 | 2 808 ms |

## Tentative unique `ENTRY_SLIP`

- Route : `POST /api/asset-documents/from-entries`.
- Code : HTTP 201.
- Résultat : COMMIT.
- Durée HTTP client : 12 203 ms.
- Préparation hors transaction : 0 ms.
- Acquisition : 355 ms.
- Garde `current_schema()` avec `tx` : 495 ms.
- Durée transaction : 10 019 ms.
- Appel transactionnel total : 10 375 ms.
- Lectures : 6, garde inclus.
- Écritures : 4.
- Total : 10 requêtes.
- `maxWait=10000`.
- `timeout=30000`.
- `guardClient=transaction`.
- `globalClientUsedInsideTransaction=false`.

## Données créées

- Document : `cms5p313k0000v5qo7b1vv0y2`.
- Numéro unique : `BE-2026-000011`.
- Type : `ENTRY_SLIP`.
- Statut : `DRAFT`.
- Relation vers l'entrée :
  `cms5jofzg000qv5zw2wfj99wz`.
- Ligne vers l'unité :
  `cms5jogls000rv5zw49j8a13s`.
- Audit `ASSET_DOCUMENT_FROM_ENTRIES_CREATED` : exactement 1.
- Relation dupliquée : 0.
- Numéro dupliqué : 0.
- Violations FK documentaires : 0.
- `asset_files` : 0.

Le total recette passe de 247 à 251 lignes : un document, une relation d'entrée,
une ligne documentaire et un audit.

## Environnements de référence

- `immos` avant/après : exactement 222 lignes.
- Empreinte normalisée avant/après :
  `92d21219717d44445ad6a9eb1ecfeab333b808dc5cc094cd85d4e267913d290a`.
- Aucune donnée de campagne dans `immos`.
- SQLite SHA-256 :
  `8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec`.
- Bucket `asset-files` : privé, vide, aucune politique publique.

## Arrêt

- PID `9844` arrêté.
- Aucun processus Node du projet restant.
- Port 3018 libre.
- Contexte normal restauré par arrêt du processus temporaire.
- Aucun second scénario ni test négatif HTTP.
- Aucun secret exposé.
- Aucun commit créé.

## Fichiers modifiés ou créés

- `lib/prisma-client-factory.js`
- `lib/prisma.js`
- `lib/schema-guard.js`
- `lib/document-service.js`
- `lib/movement-service.js`
- `lib/asset-service.js`
- `lib/asset-file-service.js`
- `app/api/asset-entries/[id]/route.js`
- `app/api/asset-documents/[id]/validate/route.js`
- `scripts/test-prisma-schema-guard-routing.mjs`
- `scripts/test-prisma-schema-guard-transaction.mjs`
- `scripts/verify-postgresql-entry-slip-result.mjs`
- `SUPABASE_PHASE8_TREDECIES_BIS_REPORT.md`

Les sorties sous `outputs/` restent ignorées par Git.
