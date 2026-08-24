# PHASE ENTRY-WIZARD-D — RAPPORT LOCAL

## Statut

**PHASE ENTRY-WIZARD-D VALIDÉE LOCALEMENT — WIZARD PROGRESSIF DRAFT I/Q/QI, PHOTOS/DOCUMENTS, FINANCES, VÉRIFICATION ET CONFIRMATION OPÉRATIONNELS**

## Fichiers modifiés pour D

- `app/parc/entries/[id]/page.js`
- `app/parc/entries/[id]/entry-wizard.js`
- `app/globals.css`
- `scripts/test-entry-wizard-progressive.mjs`
- adaptation contractuelle de `scripts/test-entry-wizard-parc-ux.mjs`

Les fichiers non commités B/C restent présents et sont réutilisés. Le moteur de création/validation patrimoniale B n’a pas été réécrit.

## Architecture et routes

- route stable du parcours : `/parc/entries/{entryId}` ;
- étape conservée dans l’URL par `?step=details|files|finances|review` ;
- confirmation imposée automatiquement quand l’entrée est `VALIDATED` ;
- lecture/reprise : page serveur ciblée sur un seul `entry_id` ;
- sauvegarde : `PATCH /api/asset-entries/{id}` ;
- fichiers : `GET/POST /api/asset-entries/{id}/files` et `PATCH/DELETE /api/asset-entries/{id}/files/{fileId}` ;
- validation finale : `POST /api/asset-entries/{id}/validate` ;
- aucune création de nouvelle `AssetEntry` lors d’un changement d’étape, retour, reprise ou refresh.

L’`entry_id` et l’`entryNumber` restent identiques pendant tout le parcours. La barre de progression est purement UX et ne crée aucun statut ni stockage supplémentaire.

## Fiche d’entrée

Champs Identification réellement utilisés :

- numéro d’entrée en lecture seule ;
- article/modèle et code en lecture seule ;
- mode de suivi en lecture seule ;
- quantité ;
- type et date d’entrée ;
- notes.

Champs Affectation/état réellement utilisés :

- emplacement actif ;
- état initial ;
- statut initial ;
- complétude.

Les champs marque, référence interne, service/détenteur et autres notions absentes du modèle ne sont pas inventés.

## I / Q / QI

Le mode est toujours lu depuis la famille de la référence. Le wizard ne crée aucun patrimoine. La seule action patrimoniale est la validation finale via le moteur B :

- I : création des `AssetUnit` selon les codes existants ;
- Q : création de la position quantitative, 0 `AssetUnit` ;
- QI : création de la position quantitative initiale, 0 `AssetUnit` ;
- E : reste non opérationnel en amont.

Pour I quantité 1, un numéro de série facultatif peut être transmis au moment de la validation, car ce champ appartient à `AssetUnit` et non au brouillon `AssetEntry`.

## Sauvegarde, reprise et progression

Chaque navigation explicite entre étapes sauvegarde d’abord la même ligne DRAFT. **Enregistrer et quitter** sauvegarde puis retourne vers Entrées en cours. Une entrée validée ne peut plus être modifiée par le PATCH brouillon.

La progression réutilise `computeAssetEntryProgress` : identification, affectation, nombre de fichiers, finances et préconditions de validation. Aucun `entry_steps`, JSON ou statut supplémentaire.

## Photos et documents

- chargement limité aux fichiers du DRAFT courant ;
- photos `MATERIAL_PHOTO` avec miniatures, catégorie existante facultative, photo principale et suppression logique ;
- documents `SUPPORTING_DOCUMENT` avec catégories existantes, ouverture et suppression logique ;
- upload multiple et ActionFeedback ;
- formats et taille affichés depuis la configuration réelle ;
- photo principale recommandée mais non bloquante ;
- aucun nouveau Storage ni aucune refonte documentaire.

Les fichiers restent liés à `AssetEntry` pendant et après la validation. Aucune copie ni suppression n’est déclenchée par la validation.

## Données financières

Champs réellement supportés : fournisseur connu/fournisseur, date d’achat connue/date, prix connu/prix unitaire et total en ariary, facture disponible/référence facture. Ils restent facultatifs conformément au moteur B.

Aucune devise structurée, garantie d’entrée, mode d’acquisition supplémentaire ou valeur estimée n’a été inventé.

## Vérification et validation

La vérification affiche quatre cartes légères : identification, affectation/état, fichiers et finances. Chaque carte permet de revenir à sa section. Les points bloquants restent ceux du moteur existant : article, quantité entière, type/date, emplacement, état et statut valides.

Le bouton **Valider l’entrée** :

- est le seul déclencheur patrimonial du wizard ;
- appelle exclusivement l’API B ;
- est désactivé pendant la requête ;
- conserve les protections serveur contre double validation ;
- n’affiche pas la confirmation en cas d’erreur ;
- laisse le rollback B empêcher tout patrimoine partiel.

## Confirmation et entrée validée

La confirmation n’apparaît qu’après succès réel, ou lors de la réouverture d’une entrée déjà validée. Elle utilise le vrai numéro d’entrée et les résultats réels : codes/identifiants `AssetUnit` pour I, quantité de la position pour Q/QI. Une unité I unique propose sa vraie fiche `/parc/{unitId}`.

Une URL ancienne d’une entrée `VALIDATED` ouvre la confirmation en lecture seule, jamais le formulaire DRAFT.

## Responsive et performance

- étapes horizontalement défilables sur mobile ;
- formulaires, fichiers et cartes de vérification en une colonne sous 760 px ;
- actions empilées et tactiles ;
- aucune relation globale parc/mouvements/documents chargée ;
- seule l’entrée courante, ses résultats, les emplacements/fournisseurs actifs et ses fichiers sont chargés.

La vérification navigateur locale s’arrête à la redirection Auth `/connexion`; aucun compte ni contournement n’a été utilisé. Le responsive est validé par compilation, CSS ciblée et tests de structure.

## Tests et build

- tests B : 11 réussis ;
- tests C : 9 réussis ;
- tests D : 18 réussis ;
- total ciblé : **38 réussis, 0 échec** ;
- TypeScript : réussi ;
- build SQLite : réussi ;
- avertissement NFT Turbopack historique uniquement ;
- `git diff --check` : réussi, avertissements LF/CRLF uniquement ;
- scan ciblé : aucun secret.

## SQLite et sécurité

- SHA-256 avant/après : `E45B2AF6733CB6D1A2194071DD6067C567014A938252D49643978134957ABD50` ;
- catégories : 3 ; références : 5 ; entrées : 10 ; unités : 12 ; positions quantitatives : 0 ; fichiers : 0 ;
- `PRAGMA integrity_check` : `ok` ;
- `PRAGMA foreign_key_check` : 0 anomalie ;
- aucun schéma Prisma ni migration modifié ;
- aucun accès Production, Recipe, Supabase, Auth ou Storage distant ;
- aucun staging, commit, push, tag ou déploiement.

## Écarts justifiés avec les visuels

- pas de champs marque, devise, garantie structurée, service/détenteur, mode d’acquisition additionnel ou valeur estimée : absents du modèle ;
- pas de huit statuts DB : progression calculée ;
- pas de bon d’entrée automatique : explicitement hors phase ;
- pas de duplication des photos dans les unités ;
- confirmation adaptée au résultat I ou Q/QI plutôt qu’un libellé générique « bien créé ».
