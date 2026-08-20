# Phase 13C-C — Socle quantitatif additif

## Statut

**PHASE 13C-C VALIDÉE LOCALEMENT — SOCLE QUANTITATIF ADDITIF PRÊT, AUCUNE BASCULE MÉTIER EFFECTUÉE**

La phase livre uniquement le socle structurel. Les entrées Q/QI, les stocks visibles, les mouvements quantitatifs, l’individualisation QI et le mode E ne sont pas activés.

## État initial et sauvegarde

- HEAD initial : `10d72a2 feat: manage asset references and models`.
- SQLite avant intervention : SHA-256 `25C9045F17962261920ECA6CC939A054027B4E22D2E5A3F2E648E7165AFADC29`.
- Intégrité avant : `ok`; aucune FK orpheline.
- Volumes avant : 3 catégories, 5 références, 10 entrées, 12 unités, 11 mouvements, 14 documents, 0 fichier.
- Sauvegarde binaire vérifiée créée dans le répertoire local ignoré : `backups/phase13c-c/dev-before-13c-c-20260820-134022.db`.
- Empreinte de la sauvegarde : identique à la source avant migration; ouverture SQLite et contrôle d’intégrité réussis.

Les rapports historiques non suivis existaient déjà et ont été conservés. Aucun fichier historique n’a été supprimé.

## Modèles ajoutés

### `QuantitativeStockPosition`

Nouvelle table `quantitative_stock_positions` :

- `id`;
- `assetEntryId` / `asset_entry_id` : lot d’acquisition obligatoire;
- `locationId` / `location_id` : emplacement obligatoire;
- `availableQuantity` / `available_quantity` : entier, défaut `0`;
- dates et identifiants d’audit (`createdAt`, `updatedAt`, `createdById`, `updatedById`).

Garanties :

- unicité `(asset_entry_id, location_id)`;
- index individuels sur lot et emplacement;
- contrainte de base `available_quantity >= 0`;
- aucun `assetItemId` dupliqué : la référence est toujours obtenue via le lot `AssetEntry`.

### `QuantitativeMovementLine`

Nouvelle table `quantitative_movement_lines`, distincte de `asset_movement_lines` :

- `id`;
- `movementId` / `movement_id`;
- `assetEntryId` / `asset_entry_id`;
- `fromLocationId` et `toLocationId`, nullable pour les futurs cas entrée/sortie;
- `quantity`, strictement positive;
- `lineNotes`, `createdAt`.

Garanties :

- index sur mouvement, lot, source et destination;
- contrainte de base `quantity > 0`;
- FK vers mouvement, lot et emplacements;
- aucune modification de `AssetMovementLine.assetUnitId`, qui reste obligatoire pour les mouvements individualisés historiques.

Les relations inverses nécessaires ont été ajoutées à `AssetEntry`, `Location` et `AssetMovement`. Aucune table `QuantitativeIndividualization` n’a été créée : elle reste réservée à 13C-F.

## Migrations préparées

Migration additive unique : `20260820110000_add_quantitative_foundation`.

| Cible | Emplacement | État |
|---|---|---|
| SQLite | `prisma/migrations/20260820110000_add_quantitative_foundation/migration.sql` | Appliquée localement. |
| PostgreSQL Production | `prisma/postgresql/migrations/20260820110000_add_quantitative_foundation/migration.sql` | Préparée uniquement, non appliquée. |
| PostgreSQL Recipe | `prisma/postgresql-recipe/migrations/20260820110000_add_quantitative_foundation/migration.sql` | Préparée uniquement, non appliquée. |

Les migrations créent seulement les deux tables, leurs index, contraintes et clés étrangères. Elles ne contiennent ni `DROP`, ni `INSERT`, ni `UPDATE`, ni `DELETE`, ni seed, ni position rétroactive.

## Gardes et compatibilité métier

- Nouveau garde PostgreSQL `assertQuantitativeFoundationSchema` : contrôle les deux tables, les colonnes nécessaires et les deux contraintes essentielles.
- `assertActiveDatabaseSchema` appelle ce garde après validation du schéma PostgreSQL attendu : une base PostgreSQL non migrée est refusée avant les écritures protégées.
- `createAssetEntryWithUnits` reste fonctionnellement inchangé.
- Les modes `Q`, `QI` et `E` restent refusés avec `TRACKING_MODE_NOT_OPERATIONAL` avant toute création d’`AssetUnit`.
- Le mode `I` reste le seul flux d’entrée actif et continue de créer les unités individualisées attendues.
- Aucun écran, endpoint ou action utilisateur de stock quantitatif n’a été exposé.

## Vérifications SQLite après migration

- SHA-256 après migration : `A194FD15D5AB4B698B3FEAD3BB6ECBD887F0753CED0DE2B02BD8EB7E8A4BFF92`.
- Intégrité SQLite : `ok`.
- FK orpheline : 0.
- Volumes historiques inchangés : 3 catégories, 5 références, 10 entrées, 12 unités, 11 mouvements, 14 documents, 0 fichier.
- `quantitative_stock_positions` : 0 ligne.
- `quantitative_movement_lines` : 0 ligne.

Aucune position n’a été créée pour les références, entrées ou unités historiques. L’existence d’une référence Q/QI/E ne crée donc aucun stock artificiel.

## Tests et validations

- Tests ciblés 13C-C : 6/6 réussis.
- Suite locale : 254/254 réussis, 0 échec.
- Tests couverts : tables vides, relations lot/emplacement/mouvement, unicité lot+emplacement, quantité zéro de position, refus des quantités négatives ou non positives, garde PostgreSQL, non-régression I et maintien du blocage Q/QI/E.
- Trois schémas Prisma validés. Les schémas PostgreSQL ont été validés avec une URL factice locale, sans connexion distante.
- Clients Prisma SQLite, PostgreSQL Production et PostgreSQL Recipe régénérés localement.
- TypeScript réussi.
- Build SQLite réussi.
- `git diff --check` réussi.

## Recipe et Production

- Production : inchangée; la migration Production n’a pas été exécutée.
- Recipe : inchangée; la migration Recipe n’a pas été exécutée.
- Une unique tentative de prévol Recipe a été arrêtée avant connexion par un format local de variable non accepté par le prévol. Aucun P1001 n’a été masqué, aucune nouvelle tentative distante n’a été effectuée et la validation Recipe est différée.
- Auth et Storage : inchangés.

## Sécurité et Git

- Aucun fichier `.env`, `.env.local`, dump, base SQLite, sauvegarde ou secret n’est préparé pour le versionnage.
- La sauvegarde SQLite est dans un emplacement ignoré par Git.
- Fichiers métier modifiés ou créés : trois schémas Prisma, trois migrations, garde quantitative, intégration de garde Prisma, tests quantitatifs et mises à jour des références d’empreinte SQLite des tests historiques.
- Aucun staging, commit, push, tag ou déploiement n’a été réalisé.

## Suite recommandée

**13C-D — Entrées Q/QI et consultation des positions** : activer le service transactionnel d’entrée quantitative, sans mouvements quantitatifs ni individualisation QI, d’abord sur SQLite puis Recipe avant toute migration Production.
