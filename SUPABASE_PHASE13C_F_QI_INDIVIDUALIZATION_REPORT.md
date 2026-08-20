# Phase 13C-F — Mode QI et individualisation

## Fichiers modifiés

- `lib/asset-reference-foundation.js`
- `lib/asset-service.js`
- `lib/document-service.js`
- `lib/quantitative-individualization-service.js`
- `app/api/quantitative-stock-individualizations/route.js`
- `app/parc/asset-park.js`
- `scripts/test-quantitative-entry.mjs`
- `scripts/test-qi-individualization.mjs`

## Comportement QI

Les entrées QI réutilisent le flux quantitatif initial de Q : une transaction crée un `AssetEntry` et une `QuantitativeStockPosition`, avec zéro `AssetUnit`. Le bon d'entrée conserve une ligne portant la quantité acquise. Le mode E reste refusé par `TRACKING_MODE_NOT_OPERATIONAL`.

L'action **Individualiser** est proposée uniquement sur les positions QI. Le service relit le lot, la référence, la famille, le mode QI, l'emplacement actif et la position. Il décrémente la position par mise à jour conditionnelle `availableQuantity >= quantity`, génère les identifiants avec `generateAssetCodes`, crée exactement N `AssetUnit` liés au même `AssetEntry` et au même emplacement, puis écrit les audits dans la même transaction.

Un échec de création d'une unité ou un conflit de concurrence annule intégralement le décrément et les créations. Une position entièrement consommée est conservée à zéro. Aucun document ni mouvement artificiel n'est créé lors de l'individualisation.

Invariant validé :

`stock quantitatif restant + AssetUnit issus du lot = AssetEntry.quantity`.

## Tests ciblés

- 16 tests ciblés 13C-D/E/F réussis, 0 échec.
- Les assertions couvrent les 20 cas demandés : entrée QI, individualisation partielle et totale, rattachements, codes uniques, quantités invalides, stock insuffisant, concurrence, refus Q/I/E par le service QI, rollback, invariant, absence de document et non-régression Q/I.
- Vérification syntaxique des nouveaux modules et `git diff --check` : réussies.

## SQLite et environnements protégés

- SHA-256 SQLite inchangé : `A194FD15D5AB4B698B3FEAD3BB6ECBD887F0753CED0DE2B02BD8EB7E8A4BFF92`.
- Intégrité : `ok` ; FK orphelines : `0`.
- Aucun changement Prisma ni migration.
- Production, Recipe, Auth et Storage n'ont pas été contactés ni modifiés.

## Point différé

Le transfert quantitatif d'une position QI reste différé ; cette phase limite volontairement QI à l'entrée initiale et à l'individualisation sur place. La désindividualisation et les mouvements mixtes restent hors périmètre.

## Statut

**PHASE 13C-F VALIDÉE LOCALEMENT — MODE QI ET INDIVIDUALISATION OPÉRATIONNELS**

Aucun staging, commit, push, tag ou déploiement.
