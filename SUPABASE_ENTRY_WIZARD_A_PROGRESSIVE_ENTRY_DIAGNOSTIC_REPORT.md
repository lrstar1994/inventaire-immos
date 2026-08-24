# ENTRY-WIZARD-A — Diagnostic du brouillon et de la validation d’entrée

## Statut

**PHASE ENTRY-WIZARD-A TERMINÉE — DIAGNOSTIC DU BROUILLON ET DE LA VALIDATION D’ENTRÉE ÉTABLI**

## 1. Flux I actuel

L’interface envoie actuellement `entryStatus = VALIDATED` à `POST /api/asset-entries`. Le dispatcher appelle `createAssetEntryWithUnits()`.

Dans une même transaction Prisma :

1. `AssetEntry` est créée ;
2. si son statut est `VALIDATED`, exactement `quantity` lignes `AssetUnit` sont créées ;
3. les unités recopient l’article, l’emplacement, le fournisseur, l’état/statut initiaux et plusieurs informations financières de l’entrée.

Le retour et les audits sont effectués après la transaction. Une valeur `DRAFT` passée directement au service I crée déjà l’`AssetEntry` seule, sans `AssetUnit`. Ce chemin existe techniquement mais n’est pas utilisé par l’interface actuelle.

La création visible aujourd’hui est donc une validation patrimoniale immédiate, pas un brouillon UX.

## 2. Flux Q actuel

Le dispatcher relit le mode depuis la famille, puis appelle `createQuantitativeAssetEntryWithPosition()`.

Ce service refuse explicitement tout statut autre que `VALIDATED`. Dans une transaction unique :

1. `AssetEntry` est créée avec `entryStatus = VALIDATED` ;
2. une `QuantitativeStockPosition` est créée pour le même lot et l’emplacement initial ;
3. aucun `AssetUnit` n’est créé.

L’entrée Q ne peut donc pas exister seule via le service actuel. La création est immédiatement patrimoniale.

## 3. Flux QI actuel

L’entrée QI utilise exactement le même flux initial que Q : `AssetEntry` validée et position quantitative atomiques, zéro `AssetUnit`. L’individualisation éventuelle intervient plus tard et ne fait pas partie de la création d’entrée.

Comme Q, QI refuse actuellement `DRAFT` et ne peut pas être sauvegardé sans effet patrimonial.

## 4. Moment exact de création patrimoniale

| Mode | Effet patrimonial actuel | Transaction avec AssetEntry |
|---|---|---|
| I | création de N `AssetUnit` | oui |
| Q | création d’une position quantitative initiale | oui |
| QI | création d’une position quantitative initiale | oui |

L’action actuelle « Créer l’entrée » équivaut donc à « créer et valider immédiatement » dans les trois modes.

## 5. Statuts AssetEntry actuels

Les trois schémas et les constantes exposent uniquement :

- `DRAFT` — Brouillon ;
- `VALIDATED` — Validée ;
- `CANCELLED` — Annulée.

Ils suffisent. « À compléter » et « Prêt à valider » doivent être des états calculés, pas de nouveaux statuts persistés.

## 6. Capacité actuelle de brouillon, modification et reprise

`GET /api/asset-entries` sait filtrer par `entryStatus`, et `GET /api/asset-entries/[id]` sait relire une entrée. Le modèle possède `updatedAt` et toutes les relations nécessaires aux fichiers et au patrimoine.

`PATCH /api/asset-entries/[id]` permet actuellement de modifier :

- état et statut initiaux ;
- statut d’entrée ;
- complétude ;
- date d’achat et indicateur associé ;
- prix unitaire, prix total et indicateur associé ;
- présence/référence de facture ;
- notes.

Limites importantes :

- il ne modifie pas article, quantité, emplacement, fournisseur, type ou date d’entrée ;
- après chaque mise à jour, il appelle `createUnitsForValidatedEntry()` ;
- cette fonction est idempotente pour une entrée I déjà dotée d’unités, mais exige le mode I lorsqu’aucune unité n’existe ;
- une entrée Q/QI validée ne possédant pas d’unité, son `PATCH` aboutit au garde-fou « individuel » : la route n’est donc pas un service de reprise commun I/Q/QI ;
- la route autorise aujourd’hui des transitions trop larges, notamment la remise en `DRAFT` ou l’annulation d’une entrée déjà patrimoniale, sans annuler le patrimoine ;
- modifier une entrée I validée ne synchronise pas les champs déjà copiés dans ses unités, ce qui peut créer une divergence.

## 7. Comparaison des architectures

### Option A — Effet patrimonial immédiat conservé

Avantages : très peu de changement dans les services de création ; compatibilité immédiate avec les flux actuels ; les photos et compléments financiers peuvent déjà être ajoutés après création.

Inconvénients : « brouillon » ne désignerait qu’un dossier documentaire postérieur à la création patrimoniale. Article, quantité, mode et emplacement ne pourraient plus être corrigés librement. Une erreur terrain crée déjà des unités ou du stock. Quitter/reprendre est possible pour les compléments, mais pas avant l’engagement patrimonial.

Risques : unités ou positions erronées, divergence entre une entrée I et ses unités, annulation ambiguë, impossibilité de corriger proprement quantité/article après coup.

### Option B — Vrai brouillon avant patrimoine

`AssetEntry` est créée avec `DRAFT`, conserve le même `id` pendant tout le parcours et reçoit progressivement données et fichiers. La validation finale crée ensuite, dans une transaction unique, le patrimoine I/Q/QI et le bon d’entrée brouillon.

Modifications nécessaires :

- séparer « créer/sauvegarder le brouillon » de « valider » ;
- permettre à Q/QI de créer une `AssetEntry` sans position ;
- compléter le service de mise à jour des brouillons ;
- créer un service unique `validateAssetEntry` qui relit le mode en base et branche vers I ou Q/QI ;
- verrouiller les transitions après validation ;
- adapter le service documentaire pour fonctionner dans la transaction de validation ;
- conserver les services patrimoniaux existants comme primitives internes.

Compatibilité : les entrées historiques `VALIDATED` restent inchangées. Aucun backfill n’est requis.

Complexité : moyenne. Le modèle et le statut existent déjà ; la difficulté est transactionnelle et applicative, pas structurelle.

### Recommandation

**Retenir l’Option B.** C’est la seule qui donne au mot « brouillon » son sens attendu et permet un vrai travail terrain/bureau sans créer prématurément du patrimoine.

## 8. Champs modifiables, contrôlés et verrouillés

### A — Librement modifiables en brouillon

- notes ;
- `informationStatus` ;
- indicateurs et valeurs financières facultatives ;
- présence/référence de facture ;
- date d’achat ;
- fichiers, photos et photo principale ;
- état/statut initiaux tant que l’entrée n’est pas validée.

### B — Modifiables avec contrôle en brouillon

- article/modèle : référence active, famille active, mode relu en base ;
- quantité : entier strictement positif et règles I/Q/QI ;
- emplacement : actif ;
- fournisseur : actif s’il est renseigné ;
- type et date d’entrée : valeurs/date valides ;
- changement d’article : doit recalculer le mode et invalider les contrôles de doublon antérieurs ;
- données financières : renormaliser prix unitaire/total avec la quantité.

### C — À verrouiller après validation patrimoniale

- article/modèle et mode ;
- quantité ;
- emplacement initial ;
- fournisseur si les unités I l’ont recopié ;
- état/statut initiaux ;
- type et date d’entrée lorsqu’ils déterminent numéros/codes ;
- retour `VALIDATED → DRAFT` ;
- annulation simple sans opération patrimoniale compensatoire.

Après validation, les données financières I sont également sensibles car elles sont dupliquées sur `AssetUnit`. Soit elles sont verrouillées, soit leur modification doit synchroniser les unités dans une transaction auditée. Pour Q/QI, `AssetEntry` reste le lot source, mais toute correction doit rester contrôlée et auditée.

## 9. Progression calculée

Aucune table d’étapes, colonne JSON ou workflow persistant n’est nécessaire.

- Identification complète : article, quantité, type et date valides.
- Affectation/état complets : emplacement, état initial et statut initial valides.
- Photos : compte des `AssetFile` actifs `MATERIAL_PHOTO`.
- Documents : compte des `AssetFile` actifs `SUPPORTING_DOCUMENT`.
- Finances : indicateurs `purchaseDateKnown`, `supplierKnown`, `priceKnown`, `invoiceAvailable` et valeurs cohérentes ; cette section peut rester « à compléter » sans bloquer.
- Prêt à valider : champs réellement exigés par `validateEntryPayload()`, référentiels actifs, mode I/Q/QI opérationnel et contrôles de doublon I satisfaits.

La photo principale, les fichiers et les données financières facultatives ne sont pas bloquants.

## 10. Stratégie minimale « Entrées en cours »

Critère : `entryStatus = DRAFT`. Les entrées `VALIDATED` et `CANCELLED` sont exclues.

La requête peut sélectionner uniquement `id`, `entryNumber`, `quantity`, `entryStatus`, `updatedAt`, champs nécessaires au calcul, article et emplacement, avec `_count` des fichiers par nature si nécessaire. L’index actuel sur `entryStatus` suffit au démarrage.

Ordre recommandé : `updatedAt DESC`, pagination `take`/curseur dès que le volume le justifie (20 à 50 lignes). La sélection des quelque 500 références doit être chargée/recherchée à la demande plutôt que répétée sur chaque écran. L’action « Continuer » transporte le même `entryId`.

Un index composite `(entryStatus, updatedAt)` pourra être ajouté plus tard seulement si les mesures le justifient.

## 11. Champs financiers réellement présents

| Champ | Obligatoire | Usage actuel | Après validation |
|---|---|---|---|
| `supplierId` | non | fournisseur du lot, recopié sur unités I | contrôlé/verrouillé ou synchronisé pour I |
| `supplierKnown` | non | indique si le fournisseur est connu | même contrainte de cohérence |
| `purchaseDate` | non | date d’achat, recopiée sur unités I | contrôlée pour I |
| `purchaseDateKnown` | non | qualifie la date d’achat | contrôlée pour I |
| `unitPrice` | non | montant entier ; calculable depuis total | contrôlé/synchronisé pour I |
| `totalPrice` | non | montant total entier ; calculable depuis unitaire × quantité | verrouillé si quantité verrouillée |
| `priceKnown` | non | indique si un prix est connu | contrôlé/synchronisé pour I |
| `invoiceAvailable` | non | indique la présence d’une facture | contrôlé/synchronisé pour I |
| `invoiceReference` | non | référence libre de facture | contrôlée/synchronisée pour I |

Il n’existe pas sur `AssetEntry` de devise, mode d’acquisition structuré distinct de `entryType`, valeur estimée ou garantie structurée. La garantie datée existe sur `AssetUnit`, pas sur l’entrée.

## 12. Fichiers et brouillon

Les fichiers sont liés directement à `assetEntryId`. Avec l’Option B, ils restent attachés au même brouillon lorsqu’il est quitté, repris puis validé. Aucun déplacement, changement Storage ou copie vers les unités n’est nécessaire. La photo principale reste recommandée mais non bloquante.

## 13. Validation finale atomique et idempotente

Créer une action dédiée, par exemple `POST /api/asset-entries/[id]/validate`, qui n’accepte pas de mode fourni par le navigateur.

Dans une transaction unique :

1. relire l’entrée et ses référentiels ;
2. réclamer atomiquement la transition `DRAFT → VALIDATED` avec une condition sur le statut ;
3. si aucune ligne n’est réclamée, retourner le résultat déjà validé ou un conflit contrôlé ;
4. valider les champs bloquants et relire le `trackingMode` de la famille ;
5. I : créer les unités seulement si aucune n’existe pour `entryId` ;
6. Q/QI : créer la position initiale seulement si aucune n’existe pour le lot/emplacement ;
7. créer le bon d’entrée `DRAFT` s’il n’existe pas ;
8. écrire les audits ;
9. commit global, sinon rollback global.

Protections : statut conditionnel contre double clic/seconde requête, unicités existantes comme garde de dernier niveau, absence d’upsert aveugle qui masquerait une incohérence, résultat idempotent lorsqu’un second appel retrouve une validation complète.

Champs véritablement bloquants d’après le code actuel : article, emplacement, quantité positive, type/date d’entrée, état et statut initiaux, référentiels actifs ; fournisseur seulement s’il est déclaré connu ; pour I, règles de doublon/numéro de série existantes. Photos, documents et finances facultatives ne bloquent pas.

## 14. Bon d’entrée brouillon automatique

- Type existant : `ENTRY_SLIP`.
- Statut existant : `DRAFT`.
- Service réutilisable : logique de `createDocumentFromEntries()`.
- Rattachement : `AssetDocumentEntry.assetEntryId` et lignes `AssetDocumentLine.assetEntryId`.
- I : une ligne par unité créée ; Q/QI : une ligne quantitative unique pour l’entrée.
- Détection du doublon : `assertNoActiveDocumentConflict()` recherche déjà un `ENTRY_SLIP` `DRAFT` ou `VALIDATED` rattaché à l’entrée et aux unités.
- Retrouver le bon : relation `documentEntries` filtrée sur `documentType = ENTRY_SLIP` et statut actif.

Pour l’atomicité, extraire une primitive interne recevant le client transactionnel `tx`. Le service public actuel ouvre sa propre transaction et ne doit pas être appelé tel quel depuis la transaction de validation. Le bon doit rester `DRAFT` ; aucune validation automatique.

Risque principal : le garde-fou documentaire est applicatif, sans unicité DB « un bon actif par entrée ». La transition atomique unique de l’entrée limite la concurrence ; une contrainte dédiée serait complexe à cause du statut porté par une autre table. Un test concurrentiel est indispensable.

## 15. Migrations éventuellement nécessaires

**Aucune migration n’est nécessaire pour la première implémentation recommandée**, à condition qu’un brouillon soit créé seulement après saisie des champs structurellement obligatoires actuels. `DRAFT`, `updatedAt`, les relations fichiers/documents et les index essentiels existent déjà.

Rendre article, emplacement, quantité ou autres champs obligatoires nullables afin de sauvegarder une fiche presque vide exigerait une migration et augmenterait fortement les états invalides. Ce n’est pas recommandé pour la première version : conserver un premier écran minimal « Identification/Affectation », puis créer le brouillon et permettre toute la progression ultérieure.

## 16. Fichiers réellement concernés par la phase suivante

- `lib/asset-service.js`
- `lib/document-service.js`
- `app/api/asset-entries/route.js`
- `app/api/asset-entries/[id]/route.js`
- nouvelle route ciblée `app/api/asset-entries/[id]/validate/route.js`
- `app/parc/asset-park.js` ou composants de wizard extraits sous `app/parc/`
- tests ciblés brouillon/validation I-Q-QI/document/concurrence

Les schémas Prisma ne devraient pas être modifiés dans la première phase.

## 17. Découpage minimal conseillé

1. **ENTRY-WIZARD-B — Domaine et API** : création DRAFT commune, mise à jour contrôlée, validation finale transactionnelle/idempotente I/Q/QI et bon `ENTRY_SLIP` DRAFT.
2. **ENTRY-WIZARD-C — Interface progressive** : sections, sauvegarde, reprise, progression calculée et liste « Entrées en cours ».
3. **ENTRY-WIZARD-D — Recette locale puis distante séparée** : concurrence, double clic, rollback, documents, compatibilité historique et nettoyage.

## 18. Risques

### Critiques

- double validation créant deux patrimoines ou deux bons ;
- utilisation du validateur I pour Q/QI ;
- retour d’une entrée validée vers DRAFT sans annuler son patrimoine ;
- validation et document dans deux transactions laissant un état partiel.

### Importants

- divergence des champs recopiés entre entrée I et unités ;
- changement article/quantité/emplacement après validation ;
- doublon documentaire sous concurrence ;
- contrôles de doublon I devenus obsolètes après modification du brouillon ;
- audit écrit hors transaction alors que l’effet métier a échoué ou inversement.

### Mineurs

- calcul de progression incohérent entre écrans ;
- liste « Entrées en cours » non paginée à terme ;
- confusion UX entre « sauvegarder » et « valider » ;
- absence de photo principale présentée comme erreur alors qu’elle n’est qu’une recommandation.

Cette phase n’a exécuté aucun test, build, accès distant, migration, changement de données, staging, commit, push, tag ou déploiement.
