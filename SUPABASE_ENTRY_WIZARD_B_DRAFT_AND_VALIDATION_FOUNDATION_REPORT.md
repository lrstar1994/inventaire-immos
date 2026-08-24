# ENTRY-WIZARD-B — Socle brouillon et validation patrimoniale

## Statut

**PHASE ENTRY-WIZARD-B VALIDÉE LOCALEMENT — SOCLE BROUILLON ET VALIDATION PATRIMONIALE I/Q/QI OPÉRATIONNEL**

## Services

`lib/asset-service.js` expose désormais :

- `createAssetEntryDraft()` : crée une seule `AssetEntry` `DRAFT`, avec numéro stable, sans unité ni position quantitative ;
- `updateAssetEntryDraft()` : met à jour uniquement la même entrée encore `DRAFT` et refuse `VALIDATED`/`CANCELLED` ;
- `validateAssetEntryDraft()` : point unique de validation patrimoniale I/Q/QI ;
- `computeAssetEntryProgress()` : progression légère calculée depuis les champs existants, sans table, JSON ou nouveau statut.

Les validations existantes des référentiels, quantités, prix, doublons et modes ont été réutilisées. Le `POST /api/asset-entries` historique reste inchangé afin de ne pas casser `/parc` avant la phase UI.

## Routes

- `POST /api/asset-entries/drafts` : création explicite d’un brouillon ;
- `GET /api/asset-entries/[id]` : reprise avec données existantes et progression calculée ;
- `PATCH /api/asset-entries/[id]` : sauvegarde du brouillon uniquement ;
- `POST /api/asset-entries/[id]/validate` : validation finale dédiée.

Les erreurs métier retournent notamment `ENTRY_ALREADY_VALIDATED`, `ENTRY_NOT_VALIDATABLE`, `ENTRY_DRAFT_HAS_PATRIMONY` ou le code de validation correspondant.

## Comportement DRAFT

- même `id` et même `entryNumber` pendant toutes les sauvegardes ;
- `updatedAt` actualisé par Prisma ;
- 0 `AssetUnit` ;
- 0 création ou incrément de `QuantitativeStockPosition` ;
- aucun mouvement quantitatif ;
- fichiers liés à `assetEntryId` conservés sans copie ni suppression ;
- article, quantité, emplacement, fournisseur et autres champs structurels revalidés à chaque sauvegarde.

## Validation I

La transaction réclame atomiquement `DRAFT → VALIDATED`, relit le mode depuis la famille, applique les contrôles de doublon et réutilise `createUnitsForValidatedEntry()` avec la génération de codes existante. Elle crée exactement le nombre d’unités attendu au bon emplacement et ne crée aucune position quantitative.

## Validation Q et QI

Q et QI suivent le même socle initial validé : création d’une position pour le lot et l’emplacement avec `availableQuantity = AssetEntry.quantity`, zéro `AssetUnit`. QI n’est pas individualisé automatiquement ; son flux ultérieur reste inchangé.

## Atomicité et double validation

La validation complète est dans une transaction Prisma unique : réclamation du statut, effet patrimonial et audit. Une erreur provoque le rollback ; l’entrée reste `DRAFT` et aucun patrimoine partiel ne subsiste.

La réclamation utilise une mise à jour conditionnelle `id + entryStatus=DRAFT`. Une seconde requête, un double clic ou un retry ne peut pas recréer d’unités ni réincrémenter un stock. Une entrée déjà validée retourne `ENTRY_ALREADY_VALIDATED`. La présence anormale de patrimoine sur un brouillon bloque également la validation.

Le bon d’entrée automatique n’a volontairement pas été ajouté ; le service est structuré pour permettre son insertion ultérieure dans cette même transaction.

## Compatibilité et progression

- l’interface actuelle conserve son ancien endpoint de création immédiate ;
- les entrées historiques restent lisibles et ne sont ni converties ni recalculées ;
- la progression repose sur identification, affectation, compte de fichiers et indicateurs financiers existants ;
- aucun statut `TO_COMPLETE`/`READY_TO_VALIDATE`, aucune table d’étapes et aucun champ Prisma n’ont été ajoutés.

## Validation locale

- tests ciblés brouillon/validation/rollback/API : **11 réussis** ;
- contrôles quantitatifs Q ciblés : **4 réussis** ;
- contrôles QI ciblés : **6 réussis** ;
- total ciblé : **21 réussis, 0 échec** ;
- build SQLite : **réussi** ;
- TypeScript intégré au build Next.js : **réussi** ;
- `git diff --check` : **réussi** ;
- scan ciblé : **aucun secret détecté** ;
- avertissement NFT Turbopack historique : présent et non bloquant.

## SQLite

- SHA avant/après : `E45B2AF6733CB6D1A2194071DD6067C567014A938252D49643978134957ABD50` ;
- volumes avant/après : 10 entrées, 12 unités, 0 position quantitative, 0 fichier ;
- `integrity_check` : **ok** ;
- `foreign_key_check` : **0 anomalie**.

## Fichiers de la phase

- `lib/asset-service.js`
- `app/api/asset-entries/[id]/route.js`
- `app/api/asset-entries/drafts/route.js`
- `app/api/asset-entries/[id]/validate/route.js`
- `scripts/test-entry-draft-validation.mjs`

Aucun schéma Prisma, migration, Storage, Auth, Production, Recipe, EquipmentSet, document ou mouvement n’a été modifié. Aucun accès distant, staging, commit, push, tag ou déploiement n’a été effectué.
