# PHASE ENTRY-WIZARD-C — RAPPORT LOCAL

## Statut

**PHASE ENTRY-WIZARD-C VALIDÉE LOCALEMENT — /PARC ALLÉGÉ, ENTRÉES EN COURS ET SÉLECTION ARTICLE OPÉRATIONNELS**

## Fichiers modifiés pour ENTRY-WIZARD-C

- `app/parc/page.js`
- `app/parc/asset-park.js`
- `app/parc/nouvelle-entree/page.js`
- `app/parc/nouvelle-entree/entry-article-picker.js`
- `app/parc/entrees-en-cours/page.js`
- `app/parc/entries/[id]/page.js`
- `app/api/asset-entries/route.js`
- `app/globals.css`
- `scripts/test-entry-wizard-parc-ux.mjs`

Les modifications non commitées d’ENTRY-WIZARD-B dans `lib/asset-service.js`, les routes brouillon/validation et leurs tests restent le socle métier utilisé, sans réécriture de leur transaction patrimoniale.

## Nouvelle organisation de `/parc`

- actions visibles : **Nouvelle entrée**, **Entrées en cours**, **Voir les biens** et **Réinitialiser** ;
- ancien formulaire complet permanent non rendu ;
- filtre famille/catégorie déplacé dans une zone secondaire repliable ;
- stocks quantitatifs et ensembles installés conservés dans des sections repliables ;
- biens individuels, fiches `/parc/[id]`, transferts Q, individualisation QI et gestion des ensembles conservés.

## Entrées en cours

- route : `/parc/entrees-en-cours` ;
- sélection exclusive de `AssetEntry.entryStatus = DRAFT` ;
- requête légère, tri par dernière modification et limite de 100 éléments ;
- cartes responsive avec numéro, article, mode, quantité, emplacement, date et progression calculée ;
- les entrées `VALIDATED` sont exclues ;
- **Continuer** ouvre le même identifiant, sans recréer d’entrée ;
- état vide avec accès Nouvelle entrée et Retour au parc.

## Sélection article / modèle

- route : `/parc/nouvelle-entree` ;
- chargement limité aux références actives liées à une famille active et aux emplacements actifs ;
- colonnes légères uniquement : id, code, nom, famille et mode ;
- recherche client adaptée au volume actuel d’environ 500 références ;
- résultats verticaux utilisables sur ordinateur et mobile ;
- aucune création lors de la simple ouverture de l’écran.

Le brouillon est créé exactement au clic **Créer le brouillon**, après choix de l’article, d’une quantité entière positive et d’un emplacement. La route B `/api/asset-entries/drafts` est utilisée. Elle produit 0 `AssetUnit` et 0 effet sur `QuantitativeStockPosition`.

Après création, la navigation conserve l’identifiant vers `/parc/entries/{entryId}`. Cette page minimale affiche le numéro stable, le statut, l’article, l’emplacement, la dernière sauvegarde et la progression. La reprise charge la même ligne par `entry_id`.

## Progression

La progression réutilise `computeAssetEntryProgress` et reste calculée depuis les données existantes : identification, affectation, nombre de fichiers, finances et disponibilité pour la future vérification. Aucune table, colonne, valeur JSON ou nouveau statut n’a été créé.

## Responsive et visuels

- desktop : sélecteur en deux colonnes, panneau de démarrage stable ;
- mobile sous 760 px : colonne unique, résultats et actions tactiles, cartes de brouillons verticales ;
- blocs secondaires repliés pour réduire la surcharge initiale ;
- aucun tableau horizontal pour les brouillons ou le sélecteur.

Les visuels ont servi de référence de hiérarchie. L’implémentation conserve le style IMMOs et ne reproduit pas le stepper complet, réservé à ENTRY-WIZARD-D. Le contrôle navigateur local a confirmé la protection de session mais a été arrêté à la redirection `/connexion`; aucun compte de test n’a été utilisé. Le responsive a donc été contrôlé par compilation, règles CSS ciblées et tests de structure.

## Tests et build

- tests ENTRY-WIZARD-C : **9 réussis** ;
- tests ciblés ENTRY-WIZARD-B rejoués avec C : **11 réussis** ;
- total ciblé : **20 réussis, 0 échec** ;
- build SQLite : **réussi** ;
- TypeScript intégré au build : **réussi** ;
- routes compilées : `/parc`, `/parc/[id]`, `/parc/nouvelle-entree`, `/parc/entrees-en-cours`, `/parc/entries/[id]` ;
- `git diff --check` : réussi, avec avertissements de normalisation LF/CRLF uniquement ;
- scan ciblé : aucun secret détecté.

## SQLite et sécurité

- SHA-256 avant/après : `E45B2AF6733CB6D1A2194071DD6067C567014A938252D49643978134957ABD50` ;
- catégories : 3 ; références : 5 ; entrées : 10 ; unités : 12 ; positions quantitatives : 0 ;
- `integrity_check` : `ok` ;
- `foreign_key_check` : 0 anomalie ;
- aucun schéma Prisma ni migration modifié ;
- aucun accès Production, Recipe, Supabase, Auth ou Storage ;
- aucun staging, commit, push, tag ou déploiement.
