# PHASE ENTRY-WIZARD-E — AUDIT GLOBAL A→D

## 1. Statut global

**PHASE ENTRY-WIZARD-E VALIDÉE LOCALEMENT — AUDIT GLOBAL A→D RÉUSSI, PARCOURS I/Q/QI VALIDÉS DE BOUT EN BOUT, INVARIANTS DRAFT ET VALIDATION ATOMIQUE CONFIRMÉS**

Décision : **READY FOR NEXT PHASE**.

## 2. Architecture réellement observée

- `/parc` oriente vers la consultation, les brouillons et la sélection d’article ;
- `/parc/nouvelle-entree` ne crée rien à l’ouverture et appelle `/api/asset-entries/drafts` uniquement après confirmation ;
- `/parc/entrees-en-cours` sélectionne seulement `entryStatus = DRAFT` ;
- `/parc/entries/{entryId}` conserve une URL stable et sauvegarde par `PATCH /api/asset-entries/{id}` ;
- photos/documents utilisent exclusivement les routes AssetEntry/files ;
- la validation finale appelle exclusivement `POST /api/asset-entries/{id}/validate` puis `validateAssetEntryDraft` ;
- `validateAssetEntryDraft` relit le mode depuis la famille et exécute I ou Q/QI dans une transaction Prisma unique ;
- la confirmation utilise les unités ou la position réellement retournées.

## 3. Invariants vérifiés

1. Ouvrir le sélecteur ne crée aucune entrée : **PASS**.
2. Confirmer le démarrage crée exactement un DRAFT : **PASS**.
3. Un DRAFT ne crée aucune unité ni position : **PASS I/Q/QI**.
4. `entry_id` reste identique : **PASS**.
5. `entryNumber` reste identique : **PASS**.
6. Refresh/lecture ne crée aucun DRAFT : **PASS**.
7. Quitter puis reprendre ne crée aucun DRAFT : **PASS**.
8. Entrées en cours reprend la même ligne : **PASS**.
9. Une entrée VALIDATED est exclue des brouillons : **PASS**.
10. La validation passe uniquement par B : **PASS**.
11. Une seconde validation est refusée : **PASS I/Q/QI**.
12. Une erreur tardive produit un rollback complet : **PASS**.
13. I/Q/QI suivent leurs branches respectives : **PASS**.
14. Parc, fiche individuelle, stocks et ensembles restent présents : **PASS**.

## 4. Parcours I

Testé sur une copie temporaire réelle de SQLite : création DRAFT, reprise, modification des notes et finances, validation, seconde validation et modification post-validation.

- avant validation : DRAFT, 0 `AssetUnit`, 0 position ;
- après validation : VALIDATED, exactement 2 `AssetUnit` pour quantité 2 ;
- relations entrée/emplacement et valeurs financières conservées ;
- seconde validation : `ENTRY_ALREADY_VALIDATED` ;
- modification brouillon après validation : refusée.

Résultat : **PASS**.

## 5. Parcours Q

- avant validation : DRAFT, 0 unité, 0 position ;
- après validation : une position au bon lot/emplacement, quantité disponible exacte 7 ;
- 0 `AssetUnit` ;
- aucun double incrément après seconde requête.

Résultat : **PASS**.

## 6. Parcours QI

- avant validation : DRAFT, 0 unité, 0 position ;
- une photo principale et une facture de test liées au même DRAFT sur la copie temporaire ;
- après validation : une position exacte de 5, 0 `AssetUnit` initial ;
- les deux fichiers restent liés à l’entrée ;
- aucune individualisation automatique et aucun double incrément.

Résultat : **PASS**.

## 7. Interruption, reprise et brouillons fantômes

La modification conserve id/numéro. Les lectures répétées de la liste et du détail ne changent pas le nombre d’entrées. Les routes C/D ne contiennent aucun appel de création lors du refresh, de la recherche ou de la reprise. Le bouton de sélection confirmé est le seul appel UX à `/drafts`.

Résultat : **PASS**.

## 8. Double validation et atomicité

Le serveur réclame le DRAFT par `updateMany` conditionnel sur `entryStatus = DRAFT`. Une seule transaction contient la réclamation, la création patrimoniale, le statut et l’audit.

Le test transversal provoque une erreur tardive d’audit avec un utilisateur inexistant, après le point de création patrimoniale : la transaction restaure `entryStatus = DRAFT`, 0 unité et 0 position. Les tests B couvrent également le rollback FK.

Résultat : **PASS**.

## 9. Photos, documents et finances

- fichiers filtrés par `assetEntryId` et `deletedAt = null` ;
- aucun changement d’AssetEntry lors d’un upload ou d’une reprise ;
- photo principale, catégories existantes et suppression logique conservées ;
- justificatifs supportés : facture, bon de livraison, garantie, notice et autre selon l’enum existant ;
- validation patrimoniale ne copie, ne modifie ni ne supprime les fichiers ;
- fournisseur, date d’achat, prix et référence facture persistent lors de la reprise ;
- finances, photo principale et documents restent facultatifs.

Résultat : **PASS**.

## 10. Progression, navigation et confirmation

La progression est calculée par `computeAssetEntryProgress`, sans table, JSON ni statut supplémentaire. Entrées en cours utilise le même helper. Les étapes sauvegardent avant navigation et conservent la route stable.

- id inexistant : `notFound()` côté page et 404 côté API ;
- entrée validée ouverte via l’ancienne URL : confirmation en lecture seule ;
- confirmation I : vrais codes et lien réel vers l’unité lorsque unique ;
- confirmation Q/QI : quantité de la position, sans faux identifiant AssetUnit.

Résultat : **PASS**.

## 11. Régressions `/parc`, responsive et performance

- `/parc`, recherche, filtres, Voir les biens et `/parc/[id]` compilent ;
- stocks quantitatifs et ensembles installés restent accessibles dans leurs sections repliables ;
- `/referentiels` reste accessible depuis le parc ;
- sélecteur, brouillons et wizard utilisent des cartes/formulaires en colonne sous 760 px ;
- aucune donnée binaire, mouvement complet ou parc complet n’est chargé par la liste des brouillons ;
- le sélecteur charge seulement id/code/nom/famille/mode ;
- le wizard charge une seule entrée, les référentiels nécessaires et ses seuls fichiers.

La session locale protégée redirige vers `/connexion`; aucun compte ou contournement Auth n’a été utilisé. Le responsive est donc contrôlé par compilation, CSS ciblée et tests de structure.

## 12. Bugs et corrections

### Bugs produit trouvés

Aucun défaut produit A→D n’a été reproduit.

### Corrections produit effectuées

Aucune.

### Infrastructure de test ajoutée

- `scripts/workspace-alias-loader.mjs` : résolution locale de `@/` pour appeler les vrais services sans nouvelle dépendance ;
- `scripts/test-entry-wizard-e2e.mjs` : parcours I/Q/QI sur une copie temporaire, double validation, rollback, finances, fichiers et absence de brouillons fantômes.

Le premier lancement du chargeur a révélé uniquement un défaut du harnais (`EISDIR` sur un alias de dossier). La résolution fichier/dossier a été corrigée dans le chargeur ; aucun code applicatif n’était concerné.

## 13. Tests et contrôles

- tests ciblés B/C/D : **38 réussis, 0 échec** ;
- tests transversaux E réels : **6 réussis, 0 échec** ;
- total : **44 réussis, 0 échec** ;
- isolation E : copie dans `%TEMP%/immos-entry-wizard-e2e-*`, supprimée après test ;
- TypeScript : **réussi** ;
- build SQLite : **réussi** ;
- avertissement NFT Turbopack historique uniquement ;
- `git diff --check` : **réussi**, avertissements LF/CRLF uniquement ;
- aucun secret détecté dans les fichiers E.

## 14. SQLite historique

- chemin : `E:\projet_la_residence\app-inventaire-immos-avant-toute-instruction\prisma\dev.db` ;
- SHA-256 avant : `E45B2AF6733CB6D1A2194071DD6067C567014A938252D49643978134957ABD50` ;
- SHA-256 après : `E45B2AF6733CB6D1A2194071DD6067C567014A938252D49643978134957ABD50` ;
- `integrity_check` : `ok` avant/après ;
- `foreign_key_check` : 0 avant/après.

Volumes avant/après identiques :

- catégories : 3 ;
- références : 5 ;
- entrées : 10 ;
- unités : 12 ;
- positions quantitatives : 0 ;
- fichiers : 0 ;
- ensembles : 0.

## 15. Changements distants

Aucun accès ni changement Production, Recipe, Supabase, Auth, Storage ou Vercel. Aucun schéma Prisma, migration, staging, commit, push, tag ou déploiement.

## 16. Risques résiduels

- le contrôle navigateur authentifié complet nécessite ultérieurement une session de test dédiée ; les invariants métier sont toutefois exercés directement sur le vrai service et une vraie copie SQLite ;
- le numéro de série I reste fourni au moment de la validation car il appartient à `AssetUnit`, pas à `AssetEntry` ;
- le bon d’entrée automatique reste volontairement hors périmètre ;
- l’avertissement NFT Turbopack préexistant reste non bloquant.

## 17. Tableau de validation final

| Domaine | I | Q | QI | Statut |
|---------|---|---|----|--------|
| Création DRAFT | 1 DRAFT | 1 DRAFT | 1 DRAFT | PASS |
| Aucun effet avant validation | 0 unité/position | 0 position/unité | 0 position/unité | PASS |
| Sauvegarde | même id/numéro | même id/numéro | même id/numéro | PASS |
| Reprise | données conservées | données conservées | données conservées | PASS |
| Photos/documents | liés à l’entrée | liés à l’entrée | photo + facture conservées | PASS |
| Finances | persistées | persistées | persistées | PASS |
| Vérification | règles B | règles B | règles B | PASS |
| Validation atomique | unités + statut | position + statut | position + statut | PASS |
| Double validation | refusée | refusée | refusée | PASS |
| Résultat patrimonial | N unités exactes | 1 position exacte, 0 unité | 1 position exacte, 0 unité | PASS |
| Confirmation | codes unités réels | quantité réelle | quantité réelle | PASS |

## DÉCISION

**READY FOR NEXT PHASE**
