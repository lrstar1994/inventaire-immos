# Phase 13C-E — Transferts quantitatifs Q

## Modifications

- `lib/quantitative-transfer-service.js` : service transactionnel de transfert Q.
- `app/api/quantitative-stock-transfers/route.js` : API protégée dédiée.
- `app/parc/asset-park.js` : action et formulaire minimal « Transférer » dans Stocks quantitatifs.
- `scripts/test-quantitative-transfer.mjs` : scénarios ciblés avec transaction simulée et rollback.

## Stratégie transactionnelle et concurrence

Le transfert relit le lot, la référence, la famille, son mode de suivi, les emplacements et la position source côté serveur. Seul `trackingMode = Q` est accepté.

Une transaction unique :

1. décrémente la source par `updateMany` conditionnel avec `availableQuantity >= quantity` ;
2. crée ou incrémente la destination par `upsert` sur l'unicité lot + emplacement ;
3. crée un `AssetMovement` validé de type `STOCK_TRANSFER` ;
4. crée exactement une `QuantitativeMovementLine` immuable ;
5. écrit l'audit associé.

Un résultat `count = 0` au décrément indique un stock insuffisant ou une concurrence et annule la transaction. La position source est conservée avec quantité zéro lors d'un transfert total. `AssetEntry.quantity` ne change pas, aucun `AssetUnit` n'est créé et la somme des positions du lot est conservée.

## Tests ciblés

- 6 tests ciblés réussis, 0 échec.
- Cas couverts : création et incrément de destination, transfert total, quantités invalides, source = destination, stock insuffisant, échec concurrent, refus QI/E, conservation du total et du lot, absence d'AssetUnit, ligne quantitative unique et rollback complet sur échec de création du mouvement.
- Vérification syntaxique des nouveaux modules : réussie.
- `git diff --check` : réussi.

## État SQLite et environnements protégés

- SHA-256 SQLite inchangé : `A194FD15D5AB4B698B3FEAD3BB6ECBD887F0753CED0DE2B02BD8EB7E8A4BFF92`.
- Intégrité SQLite : `ok`.
- FK orphelines : `0`.
- Aucun test ou accès Recipe/Production.
- Production, Recipe, Auth et Storage inchangés.
- Aucun changement Prisma ni migration.

## Point différé

L'historique global des mouvements n'affiche pas encore les lignes quantitatives ; l'intégrité transactionnelle et l'historique en base sont opérationnels. Aucun flux de sortie, correction, perte/casse, QI ou E n'a été ajouté.

## Statut

**PHASE 13C-E VALIDÉE LOCALEMENT — TRANSFERTS QUANTITATIFS Q OPÉRATIONNELS**

Aucun staging, commit, push, tag ou déploiement.
