# Scenarios de Test

## Lot 1 - Socle technique

### 1. Installation locale

1. Installer les dependances.
2. Generer le client Prisma.
3. Appliquer la migration locale.
4. Lancer le seed.
5. Demarrer l'application.

Resultat attendu : la page d'accueil s'affiche et indique le Lot 1.

### 2. Verification de la base

Appeler `GET /api/health`.

Resultat attendu : `status` vaut `ok` et `database` vaut `reachable`.

### 3. Roles disponibles

Appeler `GET /api/roles`.

Resultat attendu : les quatre roles V1 sont retournes :

- Direction
- Responsable inventaire
- Responsable maintenance
- Utilisateur simple

### 4. Utilisateurs de test

Appeler `GET /api/users`.

Resultat attendu : les quatre utilisateurs du seed sont visibles.

### 5. Creation utilisateur

Appeler `POST /api/users` avec un acteur Direction.

Resultat attendu :

- l'utilisateur est cree ;
- une ligne `USER_CREATED` est ajoutee dans `audit_logs` ;
- `created_by` et `updated_by` sont renseignes.

### 6. Desactivation utilisateur

Appeler `DELETE /api/users/[id]` avec un acteur Direction.

Resultat attendu :

- l'utilisateur passe en `DISABLED` ;
- `deleted_at` est renseigne ;
- une ligne `USER_DISABLED` est ajoutee dans `audit_logs`.

### 7. Acces non autorise

Appeler une route de modification avec un acteur qui n'est pas Direction.

Resultat attendu : reponse HTTP `403`.

## Points de vigilance pour les lots suivants

- Les routes API doivent etre ajoutees avec chaque lot fonctionnel.
- Les documents chronologiques doivent etre un module structure, pas de simples pieces jointes.
- L'inventaire initial doit rester progressif et non bloquant.
- Les sorties definitives ne doivent jamais supprimer les biens.

## Lot 2 - Referentiels communs

### 1. Seed des referentiels

Lancer la migration locale puis le seed.

Resultat attendu :

- les fournisseurs de test existent ;
- les emplacements hierarchiques existent ;
- les categories `Materiel chambres > Mobilier > Lits` existent ;
- les cinq modeles de lits existent dans `asset_items` ;
- aucune unite physique n'est creee.

### 2. Consultation

Ouvrir `/referentiels`.

Resultat attendu : les quatre onglets affichent les donnees de test.

### 3. Creation fournisseur

Creer un fournisseur depuis l'interface ou via `POST /api/suppliers`.

Resultat attendu :

- fournisseur cree ;
- audit `SUPPLIERS_CREATED` cree ;
- `created_by` et `updated_by` renseignes.

### 4. Creation emplacement enfant

Creer un emplacement avec `parentId`.

Resultat attendu : l'emplacement apparait avec son parent.

### 5. Creation categorie enfant

Creer une categorie avec `parentId`.

Resultat attendu : la categorie apparait dans la hierarchie.

### 6. Creation article modele

Creer un article rattache a la categorie `Lits`.

Resultat attendu : l'article est visible dans `asset_items`, sans creation d'unite physique.

### 7. Modification

Modifier un fournisseur, un emplacement, une categorie ou un article.

Resultat attendu : l'entite est mise a jour et une ligne d'audit `UPDATED` est creee.

### 8. Desactivation

Desactiver un referentiel.

Resultat attendu : `status` passe a `DISABLED`, `deleted_at` est renseigne et aucune suppression physique n'est faite.

### 9. Droits lecture seule

Tenter une modification avec un utilisateur `MAINTENANCE_MANAGER` ou `BASIC_USER`.

Resultat attendu : reponse HTTP `403`.

## Lot 3 - Parc physique et entrees progressives

### 1. Options dynamiques

Appeler `GET /api/asset-options`.

Resultat attendu : les articles, emplacements et fournisseurs actifs du Lot 2 sont retournes avec les listes controlees.

### 2. Creation d'une entree homogene

Creer une entree validee avec un article, un emplacement, une quantite, un type d'entree, un etat et un statut.

Resultat attendu : une ligne `asset_entries` est creee et les biens physiques correspondants sont crees.

### 3. Creation groupee

Creer une entree de quantite 3 pour `Lit Queen size`.

Resultat attendu : trois lignes `asset_units` distinctes sont creees.

### 4. Codes uniques

Verifier les codes crees.

Resultat attendu : les codes utilisent le code article, par exemple `LIT-QUEEN-000001`, puis incrementent.

### 5. Fallback code

Creer un article sans code exploitable puis une entree.

Resultat attendu : le code utilise le fallback `IMMO-YYYY-000001`.

### 6. Idempotence d'une entree validee

Valider a nouveau une entree deja validee.

Resultat attendu : aucune deuxieme creation d'unites physiques.

### 7. Prix unitaire et total

Creer une entree avec `unit_price`.

Resultat attendu : `total_price` est calcule selon la quantite.

### 8. Prix inconnu

Creer une entree avec `price_known = false`.

Resultat attendu : l'entree est acceptee, `unit_price` et `total_price` restent vides.

### 9. Informations inconnues

Creer des biens avec date d'achat inconnue, fournisseur inconnu et facture absente.

Resultat attendu : l'entree n'est pas bloquee et `information_status` permet de filtrer les biens incomplets.

### 10. Droits lecture seule

Tenter une creation avec `MAINTENANCE_MANAGER` ou `BASIC_USER`.

Resultat attendu : reponse HTTP `403`.

### 11. Audit

Verifier `audit_logs`.

Resultat attendu : creation des entrees, creation groupee, modification et desactivation sont journalisees.

### 12. Detection de doublon probable

Creer un `Lit Queen size` en `Chambre 101`, puis tenter de creer un autre `Lit Queen size` dans le meme emplacement.

Resultat attendu :

- l'application affiche les biens similaires deja existants ;
- la creation n'est possible qu'apres confirmation explicite ;
- un motif de confirmation est obligatoire ;
- la creation maintenue est marquee `possible_duplicate` et journalisee dans `audit_logs`.

### 13. Doublon strict de numero de serie

Creer un bien avec un numero de serie, puis tenter de creer un autre bien actif avec le meme numero de serie.

Resultat attendu : la creation est bloquee avec une erreur claire.

### 14. Consultation progressive du parc

Ouvrir `/parc`.

Resultat attendu :

- la page affiche une synthese generale par famille au chargement, pas une grande liste de tous les biens physiques ni une longue liste complete par modeles ;
- les filtres permettent de choisir progressivement une famille/categorie, un article/modele, un emplacement, un statut et un etat ;
- l'arborescence des categories peut etre parcourue sur plusieurs niveaux ;
- la synthese affiche le total par modele et la repartition par emplacement ;
- le bouton `Voir les biens` ouvre seulement les biens physiques correspondant aux filtres ;
- chaque ligne detaillee affiche le code, l'entree d'origine, le document d'entree, le dernier mouvement et l'indicateur de doublon probable si applicable ;
- la fiche individuelle conserve la zone `Tracabilite du bien`.

### 15. Limites du lot

Verifier que le Lot 3 ne cree pas de mouvements, reparations, documents chronologiques, sorties, inventaires periodiques, exports, photos ou fichiers.

## Lot 4 - Documents chronologiques

### 1. Migration et tables

Appliquer les migrations locales.

Resultat attendu :

- `asset_documents` existe ;
- `asset_document_entries` existe ;
- `asset_document_lines` existe ;
- `sensitive_action_approvals` existe ;
- `users.direction_code_hash` existe.

### 2. Options documents

Appeler `GET /api/document-options`.

Resultat attendu : les entrees validees, fournisseurs actifs, types d'entree, statuts et types de documents sont retournes. Seuls `ENTRY_SLIP` et `PROGRESSIVE_INVENTORY_SHEET` sont marques comme exploitables en Lot 4.

### 3. Creation depuis plusieurs entrees

Creer un document via `POST /api/asset-documents/from-entries` avec plusieurs `entryIds`.

Resultat attendu :

- une ligne `asset_documents` est creee ;
- les entrees sont rattachees dans `asset_document_entries` ;
- les biens physiques sont detailles dans `asset_document_lines` ;
- l'audit `ASSET_DOCUMENT_FROM_ENTRIES_CREATED` est cree.

### 4. Anti-doublon entree

Envoyer deux fois le meme `entryId` dans la meme creation.

Resultat attendu : l'entree n'apparait qu'une seule fois dans le document.

### 5. Anti-doublon unite physique

Verifier les lignes du document cree.

Resultat attendu : une meme unite physique n'apparait qu'une seule fois dans `asset_document_lines` pour ce document.

### 6. Anti-doublon entre documents actifs

Tenter de creer un deuxieme `ENTRY_SLIP` avec une entree ou des unites physiques deja presentes dans un `ENTRY_SLIP` actif.

Resultat attendu : la creation est bloquee. Les documents `CANCELLED` ne bloquent pas cette verification.

### 7. Anti-doublon a la validation

Tenter de valider un brouillon `ENTRY_SLIP` qui reprend une entree ou des unites physiques deja presentes dans un autre `ENTRY_SLIP` actif.

Resultat attendu : la validation est bloquee avec une reponse HTTP `409`.

### 8. Validation

Valider un document brouillon avec `POST /api/asset-documents/[id]/validate`.

Resultat attendu : le statut passe a `VALIDATED`, `validated_at` est renseigne et le document devient verrouille.

### 9. Modification d'un document valide

Tenter un `PATCH /api/asset-documents/[id]` sur un document valide.

Resultat attendu : reponse HTTP `423`, aucun changement de contenu, tentative journalisee.

### 10. Annulation d'un document brouillon

Annuler un document en brouillon avec un motif.

Resultat attendu : le statut passe a `CANCELLED`, `cancelled_at`, `cancelled_by` et `cancellation_reason` sont renseignes, le motif reste visible sur la fiche document et un audit est cree.

### 11. Annulation d'un document valide

Tenter d'annuler un document valide avec un motif.

Resultat attendu : reponse HTTP `423` indiquant que la validation Direction par code personnel est requise et non encore active. Aucune fausse validation par code n'est affichee ou enregistree.

### 12. Droits lecture seule

Tenter une creation avec `MAINTENANCE_MANAGER` ou `BASIC_USER`.

Resultat attendu : reponse HTTP `403`.

### 13. Limites du lot

Verifier que le Lot 4 ne cree pas de fichiers/photos/PDF, mouvements, reparations, sorties, inventaires periodiques ou exports.

## Lot 5 - Mouvements et affectations

### 1. Creation mouvement simple

Creer un mouvement avec un seul bien, une raison pratique visible en interface et un emplacement d'arrivee.

Resultat attendu : le mouvement est cree en `DRAFT`, avec une ligne et sans modifier l'emplacement actuel du bien.

Types visibles attendus : `Affectation initiale`, `Reaffectation`, `Depart pour pret / evenement`, `Retour de pret / evenement`, `Depart vers atelier / reparation`, `Retour d'atelier / reparation`.

### 1 ter. Explication obligatoire

Creer un `Depart vers atelier / reparation` sans explication detaillee.

Resultat attendu : creation refusee.

Creer le meme mouvement avec explication detaillee.

Resultat attendu : creation autorisee, explication visible dans la fiche mouvement, puis toujours visible apres validation ou annulation du brouillon.

### 1 bis. Selection progressive des biens

Dans `/mouvements`, choisir d'abord un emplacement de depart, puis une famille/categorie, puis un article/modele.

Resultat attendu : la liste affiche seulement les biens actuellement presents dans l'emplacement choisi et correspondant aux filtres. Les categories peuvent etre parcourues sur plusieurs niveaux.

### 1 quater. Recherche directe par code

Dans `/mouvements`, saisir un code exact de bien physique dans la zone `Biens a deplacer`.

Resultat attendu :

- le bien est retrouve ;
- son emplacement actuel est affiche ;
- cet emplacement devient l'emplacement de depart ;
- le bien peut etre selectionne pour creer le mouvement.

Saisir ensuite une recherche partielle de code.

Resultat attendu : les biens correspondants sont affiches avec leur code, modele et emplacement actuel.

Saisir un code inexistant.

Resultat attendu : le message `Aucun bien trouve avec ce code.` est affiche.

### 2. Validation mouvement simple

Valider le mouvement simple.

Resultat attendu : le mouvement passe en `VALIDATED`, l'emplacement du bien est mis a jour et l'audit est cree.

### 3. Creation mouvement groupe

Creer un mouvement avec plusieurs biens.

Resultat attendu : une ligne existe pour chaque bien, avec son emplacement de depart propre.

### 4. Validation mouvement groupe

Valider le mouvement groupe.

Resultat attendu : tous les biens du mouvement sont deplaces.

### 5. Retour de pret ou evenement

Creer un `Depart pour pret / evenement` depuis `Local technique` vers `Residence principale`, puis valider le mouvement.

Creer ensuite un `Retour de pret / evenement` pour le meme bien.

Resultat attendu :

- l'emplacement de depart est l'emplacement actuel du bien ;
- l'emplacement d'arrivee propose est l'ancien emplacement de depart du pret ;
- un message indique le retour propose vers l'emplacement d'origine ;
- le retour peut etre cree en brouillon puis valide ;
- apres validation, l'emplacement actuel du bien est mis a jour dans `/parc`.

### 6. Retour atelier / reparation

Creer un `Depart vers atelier / reparation`, puis valider le mouvement.

Creer ensuite un `Retour d'atelier / reparation` pour le meme bien.

Resultat attendu : l'emplacement d'arrivee propose est l'emplacement d'origine avant le depart vers atelier. L'utilisateur peut modifier l'emplacement d'arrivee si necessaire.

### 7. Retour sans depart trouve

Creer un mouvement de retour pour un bien sans depart correspondant valide non retourne.

Resultat attendu : l'application affiche `Aucun mouvement de depart correspondant trouve. Choisissez manuellement l'emplacement d'arrivee.` sans bloquer la saisie.

### 8. Validation incoherente

Creer un mouvement brouillon, deplacer un des biens via un autre mouvement valide, puis tenter de valider le premier mouvement.

Resultat attendu : reponse HTTP `409`, aucun bien du mouvement incoherent n'est deplace.

### 9. Annulation brouillon

Annuler un mouvement brouillon avec motif.

Resultat attendu : statut `CANCELLED`, `cancelled_at`, `cancelled_by` et `cancellation_reason` renseignes.

### 10. Mouvement valide verrouille

Tenter de modifier ou annuler un mouvement valide.

Resultat attendu : modification bloquee, annulation bloquee tant que la validation Direction par code personnel n'est pas active.

### 11. Droits maintenance

Creer un mouvement brouillon avec `MAINTENANCE_MANAGER`, puis tenter de le valider.

Resultat attendu : creation autorisee, validation refusee.

### 12. Droits utilisateur simple

Tenter une creation avec `BASIC_USER`.

Resultat attendu : reponse HTTP `403`.

### 13. Limites du lot

Verifier que le Lot 5 ne cree pas de reparations, sorties definitives, fichiers/photos/PDF, exports, inventaires periodiques ou module depenses.

## Lot 6 - Photos et pieces jointes

### 1. Ajout d'une photo

Dans `/parc`, ouvrir la fiche d'un bien physique et ajouter une image `.jpg`, `.png` ou `.webp`.

Resultat attendu : le fichier est cree dans `asset_files`, stocke sous `public/uploads/assets`, visible dans la fiche bien et audite avec `ASSET_FILE_UPLOADED`.

### 2. Plusieurs photos pour un bien

Ajouter plusieurs photos au meme bien.

Resultat attendu : toutes les photos actives restent rattachees au bien.

### 3. Photo principale unique

Definir une photo comme principale, puis definir une autre photo principale.

Resultat attendu : une seule photo active du bien garde `is_primary = true` et l'action `ASSET_FILE_SET_PRIMARY` est auditee.

### 4. Photo de defaut

Ajouter une photo de type `DEFECT_PHOTO`.

Resultat attendu : la photo est rattachee au bien sans creer de fiche de reparation.

### 5. PDF facture ou garantie

Ajouter un PDF de type `INVOICE` ou `WARRANTY`.

Resultat attendu : le fichier est accepte, visible comme piece jointe, sans stockage binaire en base.

### 6. Format refuse

Tenter d'ajouter un fichier hors formats `.jpg`, `.jpeg`, `.png`, `.webp`, `.pdf`.

Resultat attendu : la route renvoie une erreur claire `Format non accepte`.

### 7. Fichier trop lourd

Tenter d'ajouter un fichier de plus de 10 Mo.

Resultat attendu : la route renvoie une erreur claire `Fichier trop lourd`.

### 8. Suppression logique

Supprimer une photo depuis la fiche bien.

Resultat attendu : `deleted_at` est renseigne, le fichier n'apparait plus par defaut et l'action `ASSET_FILE_DELETED` est auditee.

### 9. Affichage dans `/parc`

Ouvrir la vue detaillee apres `Voir les biens`.

Resultat attendu : la miniature de la photo principale s'affiche si elle existe, et la fiche individuelle affiche la zone `Photos et pieces jointes`.

### 10. Droits

Verifier les roles :

- `DIRECTION` et `INVENTORY_MANAGER` peuvent ajouter, modifier, supprimer logiquement et definir la photo principale ;
- `MAINTENANCE_MANAGER` peut seulement ajouter une photo `DEFECT_PHOTO` et consulter ;
- `BASIC_USER` ne peut que consulter.

### 11. Limites du lot

Verifier que le Lot 6 ne cree pas de reparations, sorties definitives, inventaires periodiques, exports, generation PDF, reconnaissance image, QR code, validation Direction par code personnel, migration Supabase reelle ou Lot 7.
