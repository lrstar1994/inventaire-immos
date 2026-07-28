# Schema de Base de Donnees

## Principe

La V1 utilise SQLite pour le prototype local, mais le schema reste relationnel et pense pour une migration PostgreSQL. Les noms de tables suivent les conventions communes de La Residence / SANTATRA.

## Tables Lots 1 et 2

### `users`

Utilisateurs locaux du module. Cette table pourra plus tard etre raccordee a une authentification commune.

| Colonne | Type | Description |
| --- | --- | --- |
| `id` | TEXT | Identifiant stable Prisma `cuid`. |
| `email` | TEXT | Email unique. |
| `name` | TEXT | Nom affiche. |
| `role` | TEXT | Role applicatif V1. |
| `status` | TEXT | `ACTIVE` ou `DISABLED`. |
| `auth_provider` | TEXT | Fournisseur d'authentification, `local` en V1. |
| `external_auth_id` | TEXT nullable | Identifiant futur d'une auth commune. |
| `direction_code_hash` | TEXT nullable | Champ preparatoire pour stocker plus tard le hash du code Direction personnel. Jamais de code en clair. |
| `created_at` | DATETIME | Date de creation. |
| `updated_at` | DATETIME | Date de derniere modification. |
| `created_by` | TEXT nullable | Auteur de creation. |
| `updated_by` | TEXT nullable | Auteur de derniere modification. |
| `deleted_at` | DATETIME nullable | Suppression logique/desactivation. |

Index :

- `users_email_key`
- `users_role_idx`
- `users_status_idx`
- `users_external_auth_id_idx`

### `audit_logs`

Historique technique et fonctionnel des actions importantes.

| Colonne | Type | Description |
| --- | --- | --- |
| `id` | TEXT | Identifiant stable Prisma `cuid`. |
| `action` | TEXT | Code action, par exemple `USER_CREATED`. |
| `entity_table` | TEXT | Table concernee. |
| `entity_id` | TEXT | Identifiant de l'entite concernee. |
| `summary` | TEXT nullable | Resume lisible. |
| `metadata` | TEXT nullable | JSON serialise en V1 SQLite. Migrable vers JSONB PostgreSQL. |
| `user_id` | TEXT nullable | Utilisateur auteur de l'action. |
| `created_at` | DATETIME | Date de l'action. |

Index :

- `audit_logs_entity_table_entity_id_idx`
- `audit_logs_action_idx`
- `audit_logs_user_id_idx`

### `suppliers`

Referentiel des fournisseurs et prestataires.

| Colonne | Type | Description |
| --- | --- | --- |
| `id` | TEXT | Identifiant stable. |
| `name` | TEXT | Nom du fournisseur. |
| `code` | TEXT nullable | Code unique. |
| `supplier_type` | TEXT nullable | Type de fournisseur. |
| `contact_name` | TEXT nullable | Contact principal. |
| `email` | TEXT nullable | Email. |
| `phone` | TEXT nullable | Telephone. |
| `address` | TEXT nullable | Adresse. |
| `notes` | TEXT nullable | Notes internes. |
| `status` | TEXT | `ACTIVE` ou `DISABLED`. |
| `created_at`, `updated_at` | DATETIME | Tracabilite. |
| `created_by`, `updated_by` | TEXT nullable | Auteur. |
| `deleted_at` | DATETIME nullable | Suppression logique. |

### `locations`

Referentiel hierarchique des emplacements.

| Colonne | Type | Description |
| --- | --- | --- |
| `id` | TEXT | Identifiant stable. |
| `name` | TEXT | Nom. |
| `code` | TEXT nullable | Code unique. |
| `location_type` | TEXT nullable | Site, etage, chambre, local, service. |
| `parent_id` | TEXT nullable | Emplacement parent. |
| `notes` | TEXT nullable | Notes internes. |
| `status` | TEXT | `ACTIVE` ou `DISABLED`. |
| `created_at`, `updated_at` | DATETIME | Tracabilite. |
| `created_by`, `updated_by` | TEXT nullable | Auteur. |
| `deleted_at` | DATETIME nullable | Suppression logique. |

### `asset_categories`

Referentiel hierarchique des categories d'immobilisations.

| Colonne | Type | Description |
| --- | --- | --- |
| `id` | TEXT | Identifiant stable. |
| `name` | TEXT | Nom. |
| `code` | TEXT nullable | Code unique. |
| `description` | TEXT nullable | Description. |
| `parent_id` | TEXT nullable | Categorie parente. |
| `display_order` | INTEGER | Ordre d'affichage. |
| `status` | TEXT | `ACTIVE` ou `DISABLED`. |
| `created_at`, `updated_at` | DATETIME | Tracabilite. |
| `created_by`, `updated_by` | TEXT nullable | Auteur. |
| `deleted_at` | DATETIME nullable | Suppression logique. |

Exemple seed Lot 2 : `Materiel chambres > Mobilier > Lits`.

### `asset_items`

Articles ou modeles generiques. Cette table ne contient pas encore les unites physiques individuelles.

| Colonne | Type | Description |
| --- | --- | --- |
| `id` | TEXT | Identifiant stable. |
| `name` | TEXT | Nom du modele. |
| `code` | TEXT nullable | Code unique. |
| `description` | TEXT nullable | Description ou dimensions. |
| `unit_label` | TEXT nullable | Libelle d'unite, par exemple `modele`. |
| `depreciation_years` | INTEGER nullable | Duree indicative future. |
| `category_id` | TEXT | Categorie rattachee. |
| `supplier_id` | TEXT nullable | Fournisseur par defaut. |
| `status` | TEXT | `ACTIVE` ou `DISABLED`. |
| `created_at`, `updated_at` | DATETIME | Tracabilite. |
| `created_by`, `updated_by` | TEXT nullable | Auteur. |
| `deleted_at` | DATETIME nullable | Suppression logique. |

Modeles de lits crees par le seed Lot 2 :

- Lit King size - 1,80 m x 2,00 m
- Lit Queen size - 1,60 m x 2,00 m
- Lit Standard - 1,40 m x 2,00 m
- Lit Single large - 1,00 m x 2,00 m
- Lit Single simple - 0,90 m x 2,00 m

## Tables Lot 3

### `asset_entries`

Operation homogene d'entree progressive dans le parc. En Lot 3, une entree concerne un seul article/modele, un emplacement initial et une quantite.

| Colonne | Type | Description |
| --- | --- | --- |
| `id` | TEXT | Identifiant stable. |
| `entry_number` | TEXT | Numero unique, exemple `ENT-2026-000001`. |
| `asset_item_id` | TEXT | Article/modele obligatoire. |
| `location_id` | TEXT | Emplacement initial obligatoire. |
| `supplier_id` | TEXT nullable | Fournisseur eventuel. |
| `quantity` | INTEGER | Quantite d'exemplaires. |
| `entry_type` | TEXT | Type d'entree controle. |
| `entry_date` | DATETIME | Date d'entree. |
| `initial_condition` | TEXT | Etat initial controle. |
| `initial_status` | TEXT | Statut initial controle. |
| `entry_status` | TEXT | `DRAFT`, `VALIDATED`, `CANCELLED`. |
| `information_status` | TEXT | Statut de completude. |
| `purchase_date`, `purchase_date_known` | DATETIME/BOOLEAN | Date d'achat facultative. |
| `supplier_known` | BOOLEAN | Fournisseur connu ou inconnu. |
| `unit_price`, `total_price`, `price_known` | INTEGER/BOOLEAN | Montants en Ariary entiers. |
| `invoice_available`, `invoice_reference` | BOOLEAN/TEXT | Facture eventuelle. |
| `notes` | TEXT nullable | Notes. |
| `created_at`, `updated_at` | DATETIME | Tracabilite. |
| `created_by`, `updated_by` | TEXT nullable | Auteur. |

### `asset_units`

Bien physique individuel.

| Colonne | Type | Description |
| --- | --- | --- |
| `id` | TEXT | Identifiant stable. |
| `asset_code` | TEXT | Code unique, exemple `LIT-QUEEN-000001`. |
| `asset_item_id` | TEXT | Article/modele. |
| `location_id` | TEXT | Emplacement actuel en Lot 3. |
| `supplier_id` | TEXT nullable | Fournisseur eventuel. |
| `entry_id` | TEXT nullable | Entree d'origine. |
| `serial_number` | TEXT nullable | Numero de serie. |
| `condition` | TEXT | Etat controle. |
| `status` | TEXT | Statut controle. |
| `information_status` | TEXT | `COMPLETE`, `PARTIAL`, `TO_COMPLETE`, `UNKNOWN_INFO`. |
| `purchase_date`, `purchase_date_known` | DATETIME/BOOLEAN | Date d'achat facultative. |
| `unit_price`, `price_known` | INTEGER/BOOLEAN | Prix en Ariary entier. |
| `supplier_known` | BOOLEAN | Fournisseur connu ou inconnu. |
| `invoice_available`, `invoice_reference` | BOOLEAN/TEXT | Facture eventuelle. |
| `warranty_end_date` | DATETIME nullable | Fin de garantie. |
| `possible_duplicate` | BOOLEAN | Indicateur de creation maintenue apres alerte de doublon probable. |
| `notes` | TEXT nullable | Notes. |
| `created_at`, `updated_at` | DATETIME | Tracabilite. |
| `created_by`, `updated_by` | TEXT nullable | Auteur. |
| `deleted_at` | DATETIME nullable | Desactivation logique. |

Listes controlees Lot 3 :

- `condition` : `NEW`, `VERY_GOOD`, `GOOD`, `FAIR`, `WORN`, `TO_REPAIR`, `OUT_OF_ORDER`.
- `status` : `IN_SERVICE`, `IN_STOCK`, `IN_REPAIR`, `TEMPORARILY_OUT`, `MISSING`, `RETIRED`.
- `entry_type` : `PURCHASE`, `EXISTING_STOCK`, `DONATION`, `INCOMING_TRANSFER`, `PROGRESSIVE_INVENTORY`.
- `entry_status` : `DRAFT`, `VALIDATED`, `CANCELLED`.
- `information_status` : `COMPLETE`, `PARTIAL`, `TO_COMPLETE`, `UNKNOWN_INFO`.

Generation de codes :

- code principal depuis `asset_items.code`, exemple `LIT-QUEEN-000001` ;
- fallback seulement si le code article est inexploitable : `IMMO-2026-000001` ;
- generation centralisee dans `lib/asset-codes.js`.

## Tables Lot 4

### `asset_documents`

Document chronologique structure. En Lot 4, seuls `ENTRY_SLIP` et `PROGRESSIVE_INVENTORY_SHEET` sont exploites dans l'interface.

| Colonne | Type | Description |
| --- | --- | --- |
| `id` | TEXT | Identifiant stable. |
| `document_number` | TEXT | Numero unique, exemple `BE-2026-000001`. |
| `document_type` | TEXT | Type controle. |
| `document_date` | DATETIME | Date du document. |
| `title` | TEXT | Titre lisible. |
| `status` | TEXT | `DRAFT`, `VALIDATED`, `CANCELLED`. |
| `notes` | TEXT nullable | Notes internes. |
| `created_at`, `updated_at` | DATETIME | Tracabilite. |
| `created_by`, `updated_by` | TEXT nullable | Auteur. |
| `validated_by`, `validated_at` | TEXT/DATETIME nullable | Validation du document. |
| `cancelled_at` | DATETIME nullable | Date d'annulation d'un document en brouillon. |
| `cancelled_by` | TEXT nullable | Utilisateur ayant annule le document. |
| `cancellation_reason` | TEXT nullable | Motif d'annulation visible sur la fiche document. |
| `cancellation_approval_id` | TEXT nullable | Reference future vers une validation Direction si necessaire. |

Types prevus en constantes : `PROGRESSIVE_INVENTORY_SHEET`, `ENTRY_SLIP`, `ASSIGNMENT_SLIP`, `MOVEMENT_SLIP`, `BATCH_MOVEMENT_SLIP`, `ISSUE_REPORT`, `REPAIR_SHEET`, `PERIODIC_INVENTORY_SHEET`, `DISCREPANCY_SHEET`, `REGULARIZATION_SLIP`, `TEMPORARY_EXIT_SLIP`, `RETURN_SLIP`, `FINAL_EXIT_SLIP`.

### `asset_document_entries`

Table de liaison permettant a un document de regrouper plusieurs entrees.

| Colonne | Type | Description |
| --- | --- | --- |
| `id` | TEXT | Identifiant stable. |
| `document_id` | TEXT | Document. |
| `asset_entry_id` | TEXT | Entree liee. |
| `created_at` | DATETIME | Date de liaison. |

Contrainte : une meme entree ne peut pas etre ajoutee deux fois au meme document via l'unicite `(document_id, asset_entry_id)`.

Regle applicative Lot 4 : une meme entree ne peut pas etre rattachee a plusieurs documents actifs du meme type. Les documents `CANCELLED` ne bloquent pas cette regle afin de conserver une trace historique.

### `asset_document_lines`

Lignes detaillees du document. Elles conservent la trace des biens physiques concernes.

| Colonne | Type | Description |
| --- | --- | --- |
| `id` | TEXT | Identifiant stable. |
| `document_id` | TEXT | Document. |
| `asset_entry_id` | TEXT nullable | Entree d'origine. |
| `asset_unit_id` | TEXT nullable | Bien physique concerne. |
| `asset_item_id` | TEXT nullable | Article / modele. |
| `location_id` | TEXT nullable | Emplacement. |
| `quantity` | INTEGER | Quantite de la ligne. |
| `line_label` | TEXT | Libelle conserve dans le document. |
| `line_notes` | TEXT nullable | Detail complementaire. |
| `created_at`, `updated_at` | DATETIME | Tracabilite. |

Contrainte : une meme unite physique ne peut pas etre dupliquee dans les lignes du meme document via l'unicite `(document_id, asset_unit_id)`.

Regle applicative Lot 4 : pour les bons d'entree `ENTRY_SLIP`, une meme unite physique ne peut pas etre presente dans plusieurs documents actifs du meme type. Une ligne dans un document `CANCELLED` reste autorisee comme trace historique.

### `sensitive_action_approvals`

Structure preparatoire pour les futures validations Direction par code personnel. Elle ne stocke jamais le code.

| Colonne | Type | Description |
| --- | --- | --- |
| `id` | TEXT | Identifiant stable. |
| `action` | TEXT | Action sensible concernee. |
| `entity_table` | TEXT | Table concernee. |
| `entity_id` | TEXT | Entite concernee. |
| `requested_by` | TEXT nullable | Utilisateur demandeur. |
| `approved_by` | TEXT nullable | Futur utilisateur Direction validateur. |
| `approved_at` | DATETIME nullable | Future date de validation. |
| `reason` | TEXT | Motif obligatoire. |
| `metadata` | TEXT nullable | JSON serialise en V1 SQLite. |
| `created_at` | DATETIME | Date de creation. |

En Lot 4, la vraie verification du code Direction n'est pas active. Les documents valides restent donc verrouilles et leur annulation est bloquee.

## Tables Lot 5

### `asset_movements`

Mouvement ou affectation de biens physiques. Un mouvement brouillon ne modifie pas encore l'emplacement actuel ; un mouvement valide met a jour `asset_units.location_id`.

| Colonne | Type | Description |
| --- | --- | --- |
| `id` | TEXT | Identifiant stable. |
| `movement_number` | TEXT | Numero unique, exemple `MVT-2026-000001` ou `MVT-GRP-2026-000001`. |
| `movement_type` | TEXT | Type controle. |
| `movement_status` | TEXT | `DRAFT`, `VALIDATED`, `CANCELLED`. |
| `movement_date` | DATETIME | Date du mouvement. |
| `reason` | TEXT | Motif. |
| `notes` | TEXT nullable | Explication detaillee visible dans la fiche mouvement. |
| `related_movement_id` | TEXT nullable | Mouvement de depart lie pour un retour de pret/evenement ou d'atelier/reparation. |
| `created_by`, `updated_by` | TEXT nullable | Tracabilite. |
| `validated_by`, `validated_at` | TEXT/DATETIME nullable | Validation. |
| `cancelled_at`, `cancelled_by`, `cancellation_reason` | DATETIME/TEXT nullable | Annulation d'un brouillon avec motif visible. |
| `created_at`, `updated_at` | DATETIME | Dates techniques. |

Types prepares : `ASSIGNMENT`, `LOAN_EVENT`, `RETURN_FROM_LOAN_EVENT`, `WORKSHOP_REPAIR`, `RETURN_FROM_WORKSHOP_REPAIR`, `LOCATION_CHANGE`, `ROOM_TRANSFER`, `STOCK_TRANSFER`, `TEMPORARY_EXIT`, `RETURN_FROM_TEMPORARY_EXIT`, `REGULARIZATION`.

En interface Lot 5, seuls `ASSIGNMENT`, `REASSIGNMENT`, `LOAN_EVENT`, `RETURN_FROM_LOAN_EVENT`, `WORKSHOP_REPAIR` et `RETURN_FROM_WORKSHOP_REPAIR` sont proposes avec des libelles pratiques : Affectation initiale, Reaffectation, Depart pour pret / evenement, Retour de pret / evenement, Depart vers atelier / reparation, Retour d'atelier / reparation. Le depart vers atelier ne cree pas encore de fiche de reparation.

Pour les retours, `related_movement_id` peut conserver le lien avec le dernier mouvement de depart valide correspondant, afin de retrouver l'emplacement d'origine.

### `asset_movement_lines`

Lignes d'un mouvement. Chaque bien physique a sa propre ligne, y compris dans un mouvement groupe.

| Colonne | Type | Description |
| --- | --- | --- |
| `id` | TEXT | Identifiant stable. |
| `movement_id` | TEXT | Mouvement parent. |
| `asset_unit_id` | TEXT | Bien physique concerne. |
| `from_location_id` | TEXT | Emplacement de depart conserve a la creation. |
| `to_location_id` | TEXT | Emplacement d'arrivee. |
| `line_notes` | TEXT nullable | Notes de ligne. |
| `created_at` | DATETIME | Date de creation. |

Regle de validation : l'emplacement actuel du bien doit encore correspondre a `from_location_id`. Sinon la validation est bloquee et aucun bien du mouvement n'est deplace.

## Tables Lot 6

### `asset_files`

Photos et pieces jointes rattachees aux biens physiques. Les fichiers ne sont pas stockes en base : seule leur reference locale et leurs metadonnees sont conservees.

| Colonne | Type | Description |
| --- | --- | --- |
| `id` | TEXT | Identifiant stable. |
| `asset_unit_id` | TEXT | Bien physique concerne. |
| `file_type` | TEXT | Type controle : `MAIN_PHOTO`, `GENERAL_VIEW`, `DETAIL_VIEW`, `DEFECT_PHOTO`, `SERIAL_OR_LABEL`, `INVOICE`, `WARRANTY`, `OTHER`. |
| `file_label` | TEXT nullable | Libelle utilisateur. |
| `file_name` | TEXT | Nom d'origine du fichier. |
| `file_path` | TEXT | Chemin public local, sous `/uploads/assets`. |
| `mime_type` | TEXT | Type MIME controle cote serveur. |
| `file_size` | INTEGER | Taille en octets, maximum 10 Mo. |
| `is_primary` | BOOLEAN | Photo principale active du bien. |
| `notes` | TEXT nullable | Notes utilisateur. |
| `created_by` | TEXT nullable | Auteur. |
| `created_at` | DATETIME | Date d'ajout. |
| `deleted_at` | DATETIME nullable | Suppression logique. |

Regles :

- un bien peut avoir plusieurs fichiers ;
- une seule photo principale active par bien ;
- definir une nouvelle photo principale retire automatiquement ce statut aux autres fichiers actifs du meme bien ;
- les suppressions sont logiques via `deleted_at` ;
- les fichiers supprimes n'apparaissent pas par defaut ;
- le stockage local V1 est `public/uploads/assets`, ignore par Git sauf `.gitkeep`.

## Tables prevues pour les lots suivants

Les tables suivantes ne sont pas encore codees, mais restent validees pour la V1 :

- `inventory_sessions`
- `inventory_lines`
- `asset_repairs`
- `asset_exits`

Les sorties temporaires et retours seront traites comme mouvements speciaux dans `asset_movements`. Les sorties definitives seront gerees dans `asset_exits`, avec validation Direction ou profil autorise, changement de statut, justificatif et historique complet.
