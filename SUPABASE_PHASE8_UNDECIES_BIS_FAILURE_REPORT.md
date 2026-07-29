# Phase 8 undecies bis — Rapport d'arrêt

Date : 2026-07-29 (Indian/Antananarivo)

## Résultat

La procédure s'est arrêtée au premier incident métier inattendu, sans relance.
L'unique scénario autorisé a échoué avec Prisma `P2028`. La transaction de
création documentaire utilise encore le délai interactif implicite de 5 secondes.

## Stabilité PostgreSQL avant serveur

Un seul client Prisma recette isolé a exécuté trois séries séquentielles, avec
fermeture propre après la troisième série.

| Série | Durée | `current_schema()` | `immos` | `immos_recipe_phase8` | Empreinte `immos` |
|---|---:|---|---:|---:|---|
| 1 | 18 786 ms | `immos_recipe_phase8` | 222 | 247 | `92d21219717d44445ad6a9eb1ecfeab333b808dc5cc094cd85d4e267913d290a` |
| 2 | 4 762 ms | `immos_recipe_phase8` | 222 | 247 | identique |
| 3 | 4 513 ms | `immos_recipe_phase8` | 222 | 247 | identique |

Aucun `P1001` et aucune écriture n'ont été observés pendant ces lectures.

## Serveur et contrôles HTTP

- Port 3018 libre avant démarrage.
- PID contrôleur lancé : `22092`.
- Client : `generated/prisma-recipe`.
- Schéma réel : `immos_recipe_phase8`.
- Prévol serveur : 247 lignes recette, 222 lignes référence.
- Serveur prêt en 6,3 secondes.
- `GET /api/health` : HTTP 200.
- `GET /api/asset-movements/cms5k4pgx0001v5ckzffmjdzh` : HTTP 200.
- `GET /api/asset-units/cms5jogls000rv5zw49j8a13s` : HTTP 200.
- Mouvement toujours `VALIDATED`; unité toujours à l'emplacement final attendu.

## Premier scénario positif restant

Scénario sélectionné selon l'ordre du rapport decies : création d'un document
`ENTRY_SLIP` depuis l'entrée de campagne existante.

- Route : `POST /api/asset-documents/from-entries`.
- Entrée : `cms5jofzg000qv5zw2wfj99wz`.
- Tables attendues : `asset_documents`, `asset_document_entries`,
  `asset_document_lines`, puis `audit_logs`.
- Résultat attendu : HTTP 201 et COMMIT atomique.
- Résultat obtenu : HTTP 400 après 13 265 ms.
- Résultat transactionnel : ROLLBACK.
- Erreur : Prisma `P2028`; transaction expirée après 5 834 ms avec un timeout
  effectif de 5 000 ms, lors de `assetDocument.create()`.
- Aucune deuxième tentative n'a été effectuée.

## Contrôles après l'échec

- `immos_recipe_phase8` : 247 lignes, inchangé.
- Documents portant la campagne : 0.
- Aucun document, lien documentaire, ligne documentaire ou audit documentaire
  partiel n'a été créé.
- Mouvement : `VALIDATED`, une ligne.
- Audits atomiques de validation : exactement 2.
- Violations FK vérifiées : 0.
- `asset_files` : 0.
- `immos` : 222 lignes avant et après.
- Empreinte normalisée de `immos` avant/après :
  `92d21219717d44445ad6a9eb1ecfeab333b808dc5cc094cd85d4e267913d290a`.
- SQLite SHA-256 :
  `8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec`.
- Storage : bucket `asset-files` privé, vide, zéro politique publique.

## Arrêt

- PID `22092` arrêté explicitement.
- Port 3018 confirmé libre.
- Aucun autre scénario métier exécuté.
- Aucun secret journalisé.
- Aucun commit créé. Commit courant :
  `36a446d1c38d1e032830ed8f591b77407d4acd21`.

## Fichiers créés pendant cette phase

- `scripts/stability-postgresql-readonly.mjs`
- `scripts/run-postgresql-first-remaining-scenario.mjs`
- `scripts/verify-postgresql-first-remaining-scenario-rollback.mjs`
- `SUPABASE_PHASE8_UNDECIES_BIS_FAILURE_REPORT.md`

Les sorties d'exécution sous `outputs/` restent ignorées par Git. Aucun autre
fichier suivi n'a été modifié pendant cette phase.
