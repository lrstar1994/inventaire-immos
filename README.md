# Inventaire Immos

Module V1 d'inventaire des immobilisations pour La Residence / SANTATRA.

L'application est concue pour fonctionner seule en V1 tout en restant raccordable plus tard a un systeme interne centralise. Les lots 1 a 6 posent le socle technique, les utilisateurs, les referentiels communs, le parc physique, les documents chronologiques, les mouvements et les fichiers des biens.

## Stack

- Frontend : Next.js / React
- Backend : API routes Next.js
- ORM : Prisma
- Base locale V1 : SQLite
- Migration future visee : PostgreSQL ou Supabase

## Installation

```bash
npm install
npm run prisma:generate
npm run db:apply-local
npm run db:seed
npm run dev
```

L'application est ensuite disponible sur `http://localhost:3000`.

## Scripts utiles

- `npm run dev` : lance l'application en local.
- `npm run build` : verifie la compilation Next.js.
- `npm run prisma:generate` : regenere le client Prisma.
- `npm run db:migrate` : migration Prisma standard.
- `npm run db:apply-local` : applique les migrations SQLite locales dans cet environnement.
- `npm run db:seed` : cree les utilisateurs, referentiels, entrees, biens physiques et documents de test.

## Roles V1

- `DIRECTION` : Direction, profil habilite a administrer les utilisateurs et a valider les operations sensibles futures.
- `INVENTORY_MANAGER` : Responsable inventaire.
- `MAINTENANCE_MANAGER` : Responsable maintenance.
- `BASIC_USER` : Utilisateur simple.

La gestion locale des roles est volontairement simple. Elle est centralisee dans le code pour pouvoir etre remplacee plus tard par une authentification commune.

## Donnees de test

Le seed cree quatre comptes locaux :

- `direction@laresidence.local`
- `inventaire@laresidence.local`
- `maintenance@laresidence.local`
- `utilisateur@laresidence.local`

Il cree aussi les referentiels Lot 2, dont la hierarchie `Materiel chambres > Mobilier > Lits` et cinq modeles de lits.

Le Lot 3 ajoute des entrees progressives et des biens physiques de test :

- 2 lits Queen size en Chambre 101 ;
- 1 lit Single simple en Local technique ;
- 1 lit Standard avec fournisseur, prix et date inconnus.

Le Lot 4 ajoute :

- 1 bon d'entree valide regroupant plusieurs entrees ;
- 1 fiche d'inventaire progressif en brouillon ;
- des lignes documentaires detaillees rattachees aux biens physiques concernes.

Le Lot 5 ajoute :

- un mouvement simple valide ;
- un mouvement groupe en brouillon ;
- l'historique des emplacements via `asset_movements` et `asset_movement_lines`.

## Perimetre realise

Inclus :

- structure Next.js responsive ;
- Prisma et base SQLite locale ;
- migrations initiales ;
- table `users` ;
- table `audit_logs` ;
- roles V1 ;
- routes API de sante, roles et utilisateurs ;
- tables `suppliers`, `locations`, `asset_categories`, `asset_items` ;
- hierarchies `locations` et `asset_categories` via `parent_id` ;
- routes API et ecrans de gestion des referentiels ;
- tables `asset_entries` et `asset_units` ;
- creation individuelle ou groupee de biens physiques ;
- generation de codes uniques depuis le code article, avec fallback `IMMO-YYYY-000001` ;
- route `/api/asset-options` pour alimenter les menus depuis les referentiels actifs ;
- route `/api/asset-duplicate-check` pour signaler les doublons probables de biens physiques ;
- indicateur `asset_units.possible_duplicate` et audit des creations maintenues apres alerte ;
- tables `asset_documents`, `asset_document_entries`, `asset_document_lines` ;
- table preparatoire `sensitive_action_approvals` ;
- champ preparatoire `users.direction_code_hash` pour un futur code Direction personnel hashe ;
- route `/api/document-options` pour alimenter les documents depuis les entrees validees ;
- routes API de creation, validation, annulation et consultation des documents ;
- ecran `/documents` ;
- tables `asset_movements`, `asset_movement_lines` ;
- routes API de creation, validation, annulation et consultation des mouvements ;
- ecran `/mouvements` ;
- table `asset_files` ;
- routes API et interface de photos/pieces jointes des biens physiques ;
- documentation de base.

## Droits Lot 2

- `DIRECTION` : acces complet aux referentiels.
- `INVENTORY_MANAGER` : acces complet aux referentiels.
- `MAINTENANCE_MANAGER` : lecture seule.
- `BASIC_USER` : lecture seule.

## Droits Lot 3

- `DIRECTION` : lecture, creation, modification, desactivation.
- `INVENTORY_MANAGER` : lecture, creation, modification, desactivation.
- `MAINTENANCE_MANAGER` : lecture seule.
- `BASIC_USER` : lecture seule.

## Droits Lot 4

- `DIRECTION` : lecture, creation, validation et annulation des documents en brouillon.
- `INVENTORY_MANAGER` : lecture, creation, validation et annulation des documents en brouillon.
- `MAINTENANCE_MANAGER` : lecture seule.
- `BASIC_USER` : lecture seule.

Les documents valides sont verrouilles. Leur annulation est bloquee en Lot 4, car la vraie validation Direction par code personnel n'est pas encore implementee. Les documents brouillons annules conservent le motif, la date et l'utilisateur d'annulation sur la fiche document.

## Droits Lot 5

- `DIRECTION` : creation, modification, validation, annulation de brouillon, consultation.
- `INVENTORY_MANAGER` : creation, modification, validation, annulation de brouillon, consultation.
- `MAINTENANCE_MANAGER` : consultation complete et creation de mouvements en brouillon uniquement.
- `BASIC_USER` : consultation seule.

Les mouvements valides sont verrouilles. Leur annulation est bloquee tant que la vraie validation Direction par code personnel n'est pas implementee.

En interface Lot 5, les raisons proposees sont volontairement simples : Affectation initiale, Reaffectation, Depart pour pret / evenement, Retour de pret / evenement, Depart vers atelier / reparation, Retour d'atelier / reparation. Le depart vers atelier reste un mouvement d'emplacement et ne cree pas encore de fiche de reparation. La sortie definitive d'inventaire reste reservee a un lot futur avec validation Direction.

La fiche mouvement affiche le motif court et l'explication detaillee. L'explication est obligatoire pour les prets/evenements, retours, atelier/reparation et reaffectations.

Dans `/mouvements`, les biens a deplacer peuvent etre retrouves soit par selection progressive depuis l'emplacement de depart, la categorie et l'article/modele, soit par saisie directe du code du bien. Si un code exact est trouve, son emplacement actuel est utilise comme emplacement de depart.

Pour les retours de pret/evenement et les retours d'atelier/reparation, l'application recherche le dernier depart valide correspondant au bien selectionne et propose l'emplacement d'origine comme destination. L'utilisateur peut modifier cette destination si necessaire.

La vue `/parc` conserve une fiche individuelle par bien, mais affiche une synthese generale par famille au chargement pour eviter une longue liste. La consultation se fait progressivement avec des menus par famille/categorie, article/modele, emplacement, statut et etat. Apres filtrage, la synthese affiche les quantites par modele et leur repartition par emplacement ; le detail des biens et leur tracabilite restent accessibles a la demande avec le bouton `Voir les biens`.

## Droits Lot 6

- `DIRECTION` : ajout, modification, suppression logique, definition de photo principale, consultation.
- `INVENTORY_MANAGER` : ajout, modification, suppression logique, definition de photo principale, consultation.
- `MAINTENANCE_MANAGER` : consultation et ajout de photos de defaut/probleme uniquement.
- `BASIC_USER` : consultation seule.

Les fichiers des biens sont stockes localement dans `public/uploads/assets`. Le dossier conserve seulement un `.gitkeep` dans le depot ; les fichiers ajoutes localement sont ignores par Git. La base stocke les metadonnees dans `asset_files`, pas le contenu binaire.

Formats acceptes : `.jpg`, `.jpeg`, `.png`, `.webp`, `.pdf`. Taille maximale : 10 Mo par fichier. Cette structure reste compatible avec une future migration vers un stockage externe ou Supabase Storage.

## Emplacements

Le referentiel actuel des emplacements sert aux tests et au prototype local. Il n'est pas considere comme definitif : il devra pouvoir etre ajuste ou importe plus tard depuis un referentiel commun avec l'application Gestion des operations, afin d'eviter les divergences de nommage entre applications.

## Non inclus dans le Lot 6

- inventaires periodiques ;
- reparations ;
- sorties definitives ;
- exports Excel / CSV.
- generation PDF ;
- validation reelle par code Direction personnel.
- reconnaissance automatique par image ;
- QR code ;
- migration Supabase reelle ;
- Lot 7.

Ces modules seront ajoutes lot par lot, avec leurs routes API et leur documentation au fur et a mesure.
