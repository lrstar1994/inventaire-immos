# Phase 8 quattuordecies — Validation HTTP finale

Date : 2026-07-29 (Indian/Antananarivo)

## Résultat

Tous les scénarios restants de la Phase 8 sont validés. Aucun incident
inattendu, `P1001` ou `P2028` n'est survenu.

## Inventaire exhaustif

### Déjà validés et non rejoués

| Scénario | Route | Méthode | État |
|---|---|---|---|
| Référentiels de campagne | routes référentielles | POST/PATCH | Validé antérieurement |
| Entrée et unités | `/api/asset-entries` | POST | Validé antérieurement |
| Création mouvement | `/api/asset-movements` | POST | Validé antérieurement |
| Validation mouvement | `/api/asset-movements/[id]/validate` | POST | Validé antérieurement |
| Seconde validation idempotente | même route | POST | Validé antérieurement |
| Création `BE-2026-000011` | `/api/asset-documents/from-entries` | POST | Validé antérieurement |

### Exécutés dans cette phase

| Scénario | Route | Méthode | Attendu | Obtenu |
|---|---|---|---:|---:|
| Validation du document | `/api/asset-documents/cms5p313k0000v5qo7b1vv0y2/validate` | POST | 200 | 200 |
| Suppression logique fournisseur | `/api/suppliers/cms5jmm600000v5zwu34a5y0w` | DELETE | 200 | 200 |
| Annulation mouvement validé interdite | `/api/asset-movements/cms5k4pgx0001v5ckzffmjdzh/cancel` | POST | 423 | 423 |
| Validation mouvement inexistant | `/api/asset-movements/missing-phase8-movement/validate` | POST | 400 | 400 |
| Mouvement avec unité inexistante | `/api/asset-movements` | POST | 400 | 400 |
| Entrée avec date invalide | `/api/asset-entries` | POST | 400 | 400 |
| Entrée avec série dupliquée | `/api/asset-entries` | POST | 400 | 400 |
| Second document actif | `/api/asset-documents/from-entries` | POST | 409 | 409 |

### Non applicables ou différés

- Suppression physique/RESTRICT : aucune route publique correspondante.
- Retour lié : mouvement de campagne non compatible avec ce workflow.
- Fichiers, photos, PDF, uploads et `asset_files` : différés à la phase Storage.
- Sorties ou nouveaux modules : hors périmètre.
- Inventaires périodiques, exports, QR et PDF générés : hors périmètre.

## Prévol

- `SELECT 1` réussi.
- `current_schema()` : `immos_recipe_phase8`.
- Client : `generated/prisma-recipe`.
- `immos_recipe_phase8` : 251 lignes.
- `immos` : 222 lignes.
- Empreinte `immos` :
  `92d21219717d44445ad6a9eb1ecfeab333b808dc5cc094cd85d4e267913d290a`.
- `BE-2026-000011` présent une fois, une entrée et une ligne.
- Audit de création documentaire : 1.
- Mouvement : `VALIDATED`.
- Unité à l'emplacement final.
- Audits de validation mouvement : 2.
- Violations FK : 0.
- `asset_files` : 0.
- SQLite SHA-256 attendu confirmé.
- Port 3018 libre et aucun Node résiduel.

## Serveur et GET

- PID parent : `25348`.
- Démarrage : `2026-07-29T09:33:40.1558374+03:00`.
- Serveur prêt en 3,2 secondes.

| Route GET | Code | Durée |
|---|---:|---:|
| `/api/health` | 200 | 11 934 ms |
| mouvement de campagne | 200 | 24 242 ms |
| unité de campagne | 200 | 10 538 ms |
| document `BE-2026-000011` | 200 | 10 479 ms |

## Résultats détaillés

### Positifs

Validation documentaire :

- HTTP 200 en 18 609 ms;
- document passé de `DRAFT` à `VALIDATED`;
- un audit `ASSET_DOCUMENT_VALIDATED`;
- total recette 251 → 252;
- relations documentaires inchangées et uniques;
- COMMIT confirmé par l'état persistant.

Suppression logique fournisseur :

- HTTP 200 en 9 700 ms;
- statut `DISABLED`;
- `deletedAt` renseigné;
- un audit `SUPPLIERS_DISABLED`;
- total recette 252 → 253;
- COMMIT confirmé.

Les routes ne journalisent pas séparément leur durée transactionnelle; aucune
valeur transactionnelle n'est inventée dans ce rapport.

### Négatifs

| Scénario | Durée | Résultat |
|---|---:|---|
| Annulation mouvement validé | 9 671 ms | Rejet 423, aucune écriture |
| Validation mouvement absent | 9 678 ms | Rejet 400, transaction annulée |
| Mouvement/unité absente | 11 561 ms | Rejet 400 avant création |
| Date d'entrée invalide | 9 480 ms | Rejet 400 avant création |
| Série dupliquée | 28 114 ms | Rejet 400, aucune création |
| Document actif dupliqué | 10 701 ms | Rejet 409, rollback |

Pour le doublon documentaire, l'instrumentation indique :

- acquisition : 234 ms;
- garde transactionnel : 484 ms;
- transaction : 4 263 ms;
- appel transactionnel : 4 497 ms;
- quatre lectures, zéro écriture;
- résultat : ROLLBACK.

Après chacun des huit scénarios :

- violations FK : 0;
- `asset_files` : 0;
- `immos` : 222 lignes et empreinte identique;
- aucun scénario négatif n'a ajouté de ligne ou d'audit.

## État final du schéma recette

Total : 253 lignes.

| Table | Lignes |
|---|---:|
| `users` | 5 |
| `suppliers` | 5 |
| `locations` | 6 |
| `asset_categories` | 5 |
| `asset_items` | 6 |
| `asset_entries` | 11 |
| `asset_units` | 13 |
| `asset_files` | 0 |
| `asset_movements` | 12 |
| `asset_movement_lines` | 14 |
| `asset_documents` | 15 |
| `asset_document_entries` | 20 |
| `asset_document_lines` | 27 |
| `sensitive_action_approvals` | 2 |
| `audit_logs` | 112 |

Contrôles :

- document `BE-2026-000011` : `VALIDATED`;
- une relation d'entrée et une ligne d'unité;
- audit création : 1;
- audit validation : 1;
- fournisseur logiquement supprimé;
- audit fournisseur : 1;
- mouvement toujours `VALIDATED`;
- unité toujours à l'emplacement final;
- doublons documentaires : aucun;
- violations FK : 0.

## Références protégées

- `immos` avant/après : 222 lignes.
- Empreinte avant/après :
  `92d21219717d44445ad6a9eb1ecfeab333b808dc5cc094cd85d4e267913d290a`.
- SQLite SHA-256 :
  `8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec`.
- `asset_files` : 0.
- Bucket `asset-files` : privé, vide, aucune politique publique.

## Arrêt et Git

- PID `25348` arrêté explicitement.
- Aucun processus Node du projet restant.
- Port 3018 libre.
- Aucun secret exposé.
- Aucun commit créé.
- Commit courant inchangé :
  `36a446d1c38d1e032830ed8f591b77407d4acd21`.

## Fichiers créés ou modifiés dans cette phase

- `scripts/preflight-postgresql-final-recipe.mjs`
- `scripts/run-postgresql-final-recipe.mjs`
- `scripts/verify-postgresql-final-recipe-result.mjs`
- `SUPABASE_PHASE8_QUATTUORDECIES_REPORT.md`

Les sorties sous `outputs/` restent ignorées par Git.
