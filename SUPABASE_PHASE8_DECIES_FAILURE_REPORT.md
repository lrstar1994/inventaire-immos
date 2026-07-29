# Phase 8 decies — Arrêt avant scénarios restants

Date : 2026-07-29
Commit créé : aucun

## Résultat

La phase s'est arrêtée avant le premier scénario métier restant. Le serveur
contrôlé était prêt et `GET /api/health` a répondu 200, mais le script de
campagne a rencontré Prisma P1001 pendant la lecture initiale des empreintes de
référence de `immos`.

Aucune requête POST, PATCH ou DELETE de cette phase n'a été envoyée. Aucune
relance n'a été effectuée.

## Prévol

- port 3018 libre ;
- aucun ancien processus Node/Next du projet ;
- client : `generated/prisma-recipe` ;
- schéma réel : `immos_recipe_phase8` ;
- `immos_recipe_phase8` : 247 lignes ;
- `immos` : 222 lignes ;
- mouvement : `VALIDATED` ;
- unité dans l'emplacement final attendu ;
- deux audits de validation uniques ;
- violations FK : 0 ;
- `asset_files=0`.

## Serveur contrôlé

- PID contrôleur : `15864` ;
- démarrage : `2026-07-29T07:40:51.2835732+03:00` ;
- prévol serveur : réussi ;
- état Next.js : prêt ;
- GET `/api/health` : HTTP 200.

Arbre arrêté explicitement après l'incident :

- PID `19108` ;
- PID `15864` ;
- PID `14780` ;
- PID `2756`.

Port 3018 confirmé libre après arrêt.

## Incident

Étape : construction de l'empreinte initiale de `immos`, avant toute requête
métier.

Erreur :

- Prisma `P1001` / `PrismaClientInitializationError` ;
- endpoint session Supabase port 5432 momentanément injoignable.

La connexion a été disponible lors d'un contrôle final en lecture, sans relance
de la campagne.

## Inventaire des scénarios restants

### Positifs applicables

- création d'un document `ENTRY_SLIP` depuis l'entrée de campagne ;
- validation de ce document ;
- suppression logique du fournisseur de campagne.

### Négatifs applicables

- annulation interdite du mouvement validé : HTTP 423 attendu ;
- validation d'un mouvement inexistant : HTTP 400 attendu ;
- création de mouvement avec unité inexistante : HTTP 400 attendu ;
- entrée avec date invalide : HTTP 400 attendu ;
- entrée avec numéro de série dupliqué : HTTP 400 attendu ;
- second document actif du même type pour la même entrée : HTTP 409 attendu.

### Non applicables ou différés

- suppression physique / `RESTRICT` : aucune route métier publique correspondante ;
- retour lié : le mouvement créé est une affectation, pas un départ de prêt ou
  d'atelier permettant un retour métier justifié ;
- sorties et nouveaux modules : hors périmètre ;
- fichiers, photos, PDF et `asset_files` : différés à la phase Storage ;
- upload : interdit dans cette phase ;
- inventaire périodique, export, QR et PDF généré : hors périmètre.

## Scénarios exécutés

Dans cette phase :

- `GET /api/health` : 200 ;
- aucun scénario positif ou négatif d'écriture ;
- aucun audit créé ;
- aucune transaction métier ouverte ;
- aucun P2028.

## État final

### `immos_recipe_phase8`

- 247 lignes ;
- mouvement `VALIDATED` ;
- unité à l'emplacement final ;
- deux audits de validation ;
- violations FK : 0 ;
- `asset_files=0`.

### `immos`

- 222 lignes ;
- parité SQLite : 15/15 ;
- empreintes inchangées ;
- aucune donnée de campagne.

### SQLite et Storage

- SQLite SHA-256 :
  `8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec` ;
- Storage privé et vide ;
- aucun upload ;
- aucune politique publique ajoutée.

## Fichiers créés ou modifiés

- `scripts/run-postgresql-final-recipe.mjs`
- `SUPABASE_PHASE8_DECIES_FAILURE_REPORT.md`
- sorties ignorées sous `outputs/migration/phase8-http-recipe/server-decies/`

## Sécurité

- aucun secret exposé ;
- aucune écriture dans `immos` ;
- aucune écriture dans le schéma de recette pendant cette phase ;
- serveur arrêté ;
- port 3018 libre ;
- aucun commit.
