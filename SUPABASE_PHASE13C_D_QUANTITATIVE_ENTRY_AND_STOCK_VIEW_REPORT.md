# Phase 13C-D — Entrées quantitatives Q et consultation des stocks

## État initial et protections

- Base de départ : `3cf6315 feat: add quantitative stock foundation`.
- Sauvegarde SQLite binaire vérifiée : `backups/phase13c-d/dev-before-13c-d-20260820-140302.db`.
- Empreinte SQLite avant et après : `A194FD15D5AB4B698B3FEAD3BB6ECBD887F0753CED0DE2B02BD8EB7E8A4BFF92`.
- Intégrité SQLite : `ok` ; clés étrangères orphelines : `0`.
- Volumes historiques conservés : 3 catégories, 5 références, 10 entrées, 12 unités, 11 mouvements, 14 documents, 0 fichier.
- Positions et lignes quantitatives existantes avant/après : `0` / `0`.
- PostgreSQL Production, Recipe, Auth et Storage n’ont pas été modifiés.

## Implémentation locale

- Le flux historique `I` est conservé dans `createAssetEntryWithUnits`.
- Le nouveau flux `Q` crée dans une transaction unique :
  1. un `AssetEntry` validé ;
  2. une `QuantitativeStockPosition` liée au lot et à l’emplacement initial ;
  3. les journaux d’audit correspondants.
- Le flux Q crée exactement `0 AssetUnit`. Un échec de création de position annule donc également l’entrée.
- La quantité Q est obligatoirement un entier strictement positif ; référence, famille et emplacement sont relus côté serveur.
- `QI` et `E` restent explicitement refusés avec `TRACKING_MODE_NOT_OPERATIONAL`.
- La page Parc distingue les **Biens individualisés** des **Stocks quantitatifs**. Le tableau quantitatif est en lecture seule et affiche référence, famille, lot, emplacement, quantités, fournisseur, date et prix.
- Un bon d’entrée Q produit une unique `AssetDocumentLine` quantitative sans `assetUnitId`.
- L’entrée initiale Q ne crée volontairement ni `AssetMovement` ni `QuantitativeMovementLine` : ces éléments sont réservés à la phase des mouvements quantitatifs.

## Validation

- Tests ciblés 13C-D : 4 réussis / 0 échec.
- Suite locale hors tests dépendants d’une connexion Supabase distante : réussie après adaptation du test historique de fondation à l’activation Q.
- La suite exhaustive a identifié une seule dépendance distante non disponible : `test-prisma-transaction-once.mjs` échoue par `P1001` avant transaction sur Recipe ; aucun test métier local n’a échoué.
- TypeScript : réussi.
- Build SQLite : réussi (compilation Next terminée sans erreur applicative).
- Scan de secrets : aucune valeur sensible ajoutée ; les seules correspondances observées sont des noms de variables et fixtures de test existantes.
- `git diff --check` : conforme.

## État distant

- Recipe : non migrée et non sollicitée pour une écriture ; recette distante différée si le canal est indisponible.
- Production : inchangée ; aucune migration 13C-C/D ni donnée de stock appliquée.

## Fichiers modifiés ou créés

- `lib/asset-service.js`
- `lib/asset-reference-foundation.js`
- `lib/document-service.js`
- `app/api/asset-entries/route.js`
- `app/api/quantitative-stock-positions/route.js`
- `app/parc/page.js`
- `app/parc/asset-park.js`
- `scripts/test-quantitative-foundation.mjs`
- `scripts/test-quantitative-entry.mjs`
- ce rapport.

## Conclusion

**PHASE 13C-D VALIDÉE LOCALEMENT — ENTRÉES Q ET CONSULTATION DES STOCKS OPÉRATIONNELLES**

Aucun commit, push, tag ou déploiement n’a été effectué.
