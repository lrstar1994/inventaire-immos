# Phase 8 duodecies — Rapport d'arrêt

Date : 2026-07-29 (Indian/Antananarivo)

## Résultat

La correction ciblée de la transaction documentaire a été préparée, mais
l'unique tentative HTTP s'est arrêtée sur un incident réseau Prisma `P1001`.
Aucune seconde tentative et aucun test négatif n'ont été exécutés.

## Diagnostic du P2028 initial

Route : `POST /api/asset-documents/from-entries`.

Chaîne applicative :

- handler : `app/api/asset-documents/from-entries/route.js`;
- service : `createDocumentFromEntries()` dans `lib/document-service.js`;
- transaction Prisma interactive sans paramètres explicites avant correction;
- timeout effectif initial : 5 000 ms.

Avant correction, la transaction effectuait séquentiellement :

1. lecture complète des entrées et unités;
2. contrôle des conflits par entrée;
3. contrôle des conflits par unité;
4. lecture des numéros documentaires existants;
5. création du document;
6. création des relations avec les entrées;
7. création des lignes liées aux unités;
8. relecture complète du document.

L'audit était ensuite créé hors transaction. Les allers-retours PostgreSQL via
Supavisor dépassaient le délai implicite : expiration observée après 5 834 ms.

Le scénario est strictement métier. Il n'exige aucun upload, fichier local,
objet Storage ou enregistrement `asset_files`.

## Correction appliquée

- Validation et normalisation du payload avant la transaction.
- Préparation des identifiants, du type, de la date, du titre et des notes avant
  la transaction.
- Contrôles de cohérence, génération du numéro et écritures conservés dans la
  transaction.
- Audit documentaire déplacé dans la même transaction que le document.
- Suppression de l'audit séparé dans le handler HTTP.
- Paramètres ciblés :
  - `maxWait: 10000`;
  - `timeout: 30000`.
- Instrumentation non sensible des durées et nombres de requêtes.
- Aucun timeout global ni règle métier modifié.

## Prévol et connexion

- Port 3018 libre.
- Aucun processus Node résiduel du projet.
- Client : `generated/prisma-recipe`.
- `current_schema()` : `immos_recipe_phase8`.
- Connexion Session pooler, port 5432, SSL requis.
- Test `SELECT 1` réussi.
- Durée du prévol Prisma : 7 369 ms.
- `immos_recipe_phase8` : 247 lignes.
- `immos` : 222 lignes.
- Mouvement : `VALIDATED`.
- Unité à l'emplacement final attendu.
- Deux audits de validation uniques.
- Document `ENTRY_SLIP` de campagne : 0.
- Audit documentaire de campagne : 0.
- Violations FK : 0.
- `asset_files` : 0.

## Serveur et GET

- PID parent : `22672`.
- Démarrage : `2026-07-29T08:48:45.1477587+03:00`.
- Serveur prêt en 23,0 secondes.
- Une seule instance sur le port 3018.

| Route | Code | Durée |
|---|---:|---:|
| `GET /api/health` | 200 | 36 138 ms côté client |
| `GET /api/asset-movements/cms5k4pgx0001v5ckzffmjdzh` | 200 | 40 732 ms |
| `GET /api/asset-units/cms5jogls000rv5zw49j8a13s` | 200 | 22 327 ms |
| `GET /api/asset-documents` | 200 | 15 611 ms |

Aucune écriture n'a été produite par ces lectures.

## Tentative HTTP unique

- Route : `POST /api/asset-documents/from-entries`.
- Résultat : HTTP 400.
- Durée HTTP mesurée par le client : 24 573 ms.
- Résultat transactionnel : ROLLBACK.
- Préparation hors transaction : 0 ms.
- Acquisition de transaction : 2 714 ms.
- Durée dans la transaction avant l'erreur : 19 064 ms.
- Appel transactionnel total : 21 778 ms.
- Requêtes comptabilisées : 4 lectures et 1 écriture tentée.
- Paramètres actifs : `maxWait=10000`, `timeout=30000`.

L'écriture comptabilisée correspond à l'appel de création du document. Le
garde-fou de cible exécute d'abord `current_schema()`; cette requête a échoué
avec `P1001` avant que l'écriture métier puisse aboutir. La transaction a donc
été annulée intégralement.

## État final

- `immos_recipe_phase8` : 247 lignes, inchangé.
- Document `ENTRY_SLIP` de campagne : 0.
- Relation ou ligne documentaire partielle : 0.
- Audit documentaire créé : 0.
- Mouvement toujours `VALIDATED`.
- Unité toujours à l'emplacement attendu.
- Audits de validation : exactement 2.
- Violations FK : 0.
- `asset_files` : 0.
- `immos` : 222 lignes avant et après.
- Empreinte normalisée `immos` avant/après :
  `92d21219717d44445ad6a9eb1ecfeab333b808dc5cc094cd85d4e267913d290a`.
- SQLite SHA-256 :
  `8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec`.
- Bucket `asset-files` : privé, vide, sans politique publique.

## Arrêt

- PID `22672` arrêté explicitement.
- Aucun processus Node du projet restant.
- Port 3018 libre.
- Aucun secret exposé.
- Aucun commit créé.
- Aucun scénario supplémentaire ni test négatif exécuté.

## Fichiers modifiés ou créés

- `lib/document-service.js`
- `app/api/asset-documents/from-entries/route.js`
- `scripts/preflight-postgresql-document-recipe.mjs`
- `SUPABASE_PHASE8_DUODECIES_FAILURE_REPORT.md`

Les sorties d'exécution sous `outputs/` restent ignorées par Git.
