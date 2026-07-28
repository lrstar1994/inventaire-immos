# Routes API

Les routes API sont creees progressivement avec chaque lot. Le Lot 11 servira a harmoniser et finaliser cette documentation.

## Lot 1

### `GET /api/health`

Verifie que l'application et la base locale repondent.

Reponse :

```json
{
  "status": "ok",
  "module": "app-inventaire-immos",
  "lot": "1",
  "database": "reachable"
}
```

### `GET /api/roles`

Liste les roles applicatifs V1.

### `GET /api/users`

Liste les utilisateurs actifs non supprimes logiquement.

### `POST /api/users`

Cree un utilisateur. Necessite un acteur Direction via l'en-tete `x-user-id`.

Corps attendu :

```json
{
  "email": "nouveau@laresidence.local",
  "name": "Nouvel utilisateur",
  "role": "BASIC_USER",
  "status": "ACTIVE"
}
```

### `GET /api/users/[id]`

Retourne le detail d'un utilisateur.

### `PATCH /api/users/[id]`

Modifie un utilisateur. Necessite un acteur Direction via l'en-tete `x-user-id`.

### `DELETE /api/users/[id]`

Desactive un utilisateur par suppression logique. Necessite un acteur Direction via l'en-tete `x-user-id`.

## Regle provisoire d'identification V1

En attendant une authentification commune, les routes protegees lisent l'en-tete `x-user-id`. Si cet en-tete est absent, le premier utilisateur Direction actif sert d'acteur local de developpement.

## Lot 2 - Referentiels communs

Les routes de lecture sont disponibles pour tous les roles actifs. Les routes de creation, modification et desactivation sont reservees a `DIRECTION` et `INVENTORY_MANAGER`.

### Fournisseurs

- `GET /api/suppliers`
- `POST /api/suppliers`
- `GET /api/suppliers/[id]`
- `PATCH /api/suppliers/[id]`
- `DELETE /api/suppliers/[id]`

Champs principaux : `name`, `code`, `supplierType`, `contactName`, `email`, `phone`, `address`, `notes`, `status`.

### Emplacements

- `GET /api/locations`
- `POST /api/locations`
- `GET /api/locations/[id]`
- `PATCH /api/locations/[id]`
- `DELETE /api/locations/[id]`

Champs principaux : `name`, `code`, `locationType`, `parentId`, `notes`, `status`.

### Categories d'immobilisations

- `GET /api/asset-categories`
- `POST /api/asset-categories`
- `GET /api/asset-categories/[id]`
- `PATCH /api/asset-categories/[id]`
- `DELETE /api/asset-categories/[id]`

Champs principaux : `name`, `code`, `description`, `parentId`, `displayOrder`, `status`.

### Articles / modeles

- `GET /api/asset-items`
- `POST /api/asset-items`
- `GET /api/asset-items/[id]`
- `PATCH /api/asset-items/[id]`
- `DELETE /api/asset-items/[id]`

Champs principaux : `name`, `code`, `description`, `unitLabel`, `categoryId`, `supplierId`, `depreciationYears`, `status`.

Important : `asset_items` contient des modeles, pas des unites physiques individuelles.

## Lot 3 - Parc physique et entrees progressives

Les routes d'ecriture sont reservees a `DIRECTION` et `INVENTORY_MANAGER`. `MAINTENANCE_MANAGER` et `BASIC_USER` restent en lecture seule.

### Options de formulaire

`GET /api/asset-options`

Retourne :

- articles/modeles actifs ;
- categories actives avec `parentId` pour alimenter les filtres arborescents ;
- emplacements actifs ;
- fournisseurs actifs ;
- etats de bien ;
- statuts de bien ;
- types d'entree ;
- statuts d'entree ;
- statuts de completude.

Les relations utilisent les `id`.

### Detection de doublons probables

`GET /api/asset-duplicate-check`

Parametres : `assetItemId`, `locationId`, `supplierId` facultatif, `serialNumber` facultatif.

Retourne :

- les biens similaires actifs avec meme article/modele et meme emplacement ;
- les doublons stricts de numero de serie si un numero est renseigne ;
- un indicateur `possibleDuplicate`.

Regles :

- un numero de serie deja utilise par un bien actif bloque la creation ;
- un bien similaire dans le meme emplacement declenche une alerte non bloquante ;
- pour continuer malgre l'alerte, `duplicateConfirmed` et `duplicateReason` sont obligatoires dans la creation ;
- la creation maintenue apres alerte est marquee par `asset_units.possible_duplicate` et journalisee dans `audit_logs`.

### Entrees de parc

- `GET /api/asset-entries`
- `POST /api/asset-entries`
- `GET /api/asset-entries/[id]`
- `PATCH /api/asset-entries/[id]`

Une entree Lot 3 est homogene : `assetItemId`, `locationId`, `quantity`, `entryType`, `entryDate`, `initialCondition`, `initialStatus`.

Une entree deja validee ne recree pas les unites si elle est appelee ou validee a nouveau.

### Biens physiques

- `GET /api/asset-units`
- `POST /api/asset-units`
- `GET /api/asset-units/[id]`
- `PATCH /api/asset-units/[id]`
- `DELETE /api/asset-units/[id]`

`POST /api/asset-units` cree une entree validee de quantite 1. `DELETE` desactive logiquement le bien.

## Lot 4 - Documents chronologiques

Les routes d'ecriture sont reservees a `DIRECTION` et `INVENTORY_MANAGER`. `MAINTENANCE_MANAGER` et `BASIC_USER` restent en lecture seule.

En Lot 4, seuls les types `ENTRY_SLIP` et `PROGRESSIVE_INVENTORY_SHEET` sont exploitables depuis l'interface. Les autres types sont prepares en constantes pour les lots suivants.

### Options de formulaire

`GET /api/document-options`

Retourne :

- types de documents ;
- types de documents actifs en Lot 4 ;
- statuts de documents ;
- entrees validees avec article, emplacement, fournisseur et biens physiques ;
- articles, emplacements et fournisseurs actifs ;
- types d'entree controles.

### Documents

- `GET /api/asset-documents`
- `POST /api/asset-documents`
- `GET /api/asset-documents/[id]`
- `PATCH /api/asset-documents/[id]`

`POST /api/asset-documents` cree un document brouillon vide uniquement pour un type actif Lot 4. `PATCH` est bloque si le document est deja `VALIDATED`.

### Creation depuis plusieurs entrees

`POST /api/asset-documents/from-entries`

Corps attendu :

```json
{
  "documentType": "ENTRY_SLIP",
  "documentDate": "2026-06-01",
  "title": "Bon d'entree du jour",
  "entryIds": ["entry_id_1", "entry_id_2"],
  "notes": "Regroupement des entrees validees"
}
```

Regles :

- un document peut regrouper plusieurs entrees ;
- les entrees sont reliees via `asset_document_entries` ;
- les lignes detaillees sont creees dans `asset_document_lines` ;
- une meme entree ne peut pas etre ajoutee deux fois dans le meme document ;
- une meme unite physique ne peut pas etre dupliquee dans les lignes du meme document ;
- une meme entree ne peut pas etre rattachee a plusieurs documents actifs du meme type ;
- une meme unite physique ne peut pas etre presente dans plusieurs bons d'entree actifs `ENTRY_SLIP` ;
- les documents `CANCELLED` restent des traces historiques et ne bloquent pas ces controles ;
- un audit `ASSET_DOCUMENT_FROM_ENTRIES_CREATED` est cree.

### Validation

`POST /api/asset-documents/[id]/validate`

Valide un document brouillon et le verrouille. Les lignes et rattachements ne sont plus modifiables ensuite.

La validation est bloquee si le document reprend une entree deja rattachee a un document actif du meme type, ou si un `ENTRY_SLIP` reprend une unite physique deja presente dans un autre `ENTRY_SLIP` actif.

### Annulation

`POST /api/asset-documents/[id]/cancel`

Corps attendu :

```json
{
  "reason": "Motif d'annulation"
}
```

Un document en brouillon peut etre annule selon les droits.

Le motif d'annulation est obligatoire et reste stocke sur le document via `cancellation_reason`, avec `cancelled_at` et `cancelled_by`. L'audit reste conserve en complement.

Un document valide ne peut pas etre annule en Lot 4. La route renvoie une erreur claire indiquant que la validation Direction par code personnel est requise mais non encore active, et journalise la tentative dans `audit_logs`.

### Validation Direction future

La table `sensitive_action_approvals` et le champ `users.direction_code_hash` preparent le futur lot securite. Aucune fausse validation par code n'est simulee en Lot 4.

## Lot 5 - Mouvements et affectations

`DIRECTION` et `INVENTORY_MANAGER` peuvent creer, modifier, valider et annuler les brouillons. `MAINTENANCE_MANAGER` peut consulter et creer des brouillons. `BASIC_USER` consulte uniquement.

### Options de formulaire

`GET /api/asset-movement-options`

Retourne :

- biens physiques actifs non sortis definitivement ;
- emplacements actifs ;
- categories actives ;
- articles/modeles actifs ;
- types de mouvements ;
- types exploites en Lot 5 ;
- statuts de mouvements.

Les types proposes en interface Lot 5 sont volontairement pratiques : `ASSIGNMENT`, `REASSIGNMENT`, `LOAN_EVENT`, `RETURN_FROM_LOAN_EVENT`, `WORKSHOP_REPAIR`, `RETURN_FROM_WORKSHOP_REPAIR`. `WORKSHOP_REPAIR` cree seulement un mouvement vers l'atelier ou le lieu de reparation ; il ne cree pas de fiche de reparation. Les sorties definitives d'inventaire restent hors Lot 5.

### Mouvements

- `GET /api/asset-movements`
- `POST /api/asset-movements`
- `GET /api/asset-movements/[id]`
- `PATCH /api/asset-movements/[id]`

`POST` cree toujours un mouvement en `DRAFT`. Chaque bien selectionne cree une ligne dans `asset_movement_lines`, avec conservation de l'emplacement de depart.

L'interface utilise ces donnees pour une selection progressive : emplacement de depart, famille/categorie, article/modele, puis biens physiques. Elle permet aussi une recherche directe par code de bien depuis les `assetUnits` retournes, sans proposer les biens supprimes logiquement ou sortis definitivement.

Le champ `reason` sert de motif court. Le champ `notes` est affiche comme explication detaillee du mouvement. Cette explication est obligatoire pour `REASSIGNMENT`, `LOAN_EVENT`, `RETURN_FROM_LOAN_EVENT`, `WORKSHOP_REPAIR` et `RETURN_FROM_WORKSHOP_REPAIR`.

Pour `RETURN_FROM_LOAN_EVENT` et `RETURN_FROM_WORKSHOP_REPAIR`, le champ optionnel `relatedMovementId` peut rattacher le retour au mouvement de depart valide correspondant. L'interface propose l'emplacement d'origine en destination quand elle retrouve ce depart.

### Validation

`POST /api/asset-movements/[id]/validate`

Regles :

- le mouvement doit etre en brouillon ;
- chaque bien doit exister, etre actif, non supprime et non `RETIRED` ;
- l'emplacement actuel du bien doit correspondre au `from_location_id` enregistre ;
- la validation est globale : si une ligne est incoherente, aucun bien n'est deplace ;
- une validation reussie met a jour `asset_units.location_id` pour chaque ligne.

Si un bien a deja change d'emplacement entre-temps, la route renvoie `409`.

### Annulation

`POST /api/asset-movements/[id]/cancel`

Un brouillon peut etre annule avec motif obligatoire. Un mouvement valide reste verrouille et son annulation renvoie `423` tant que la validation Direction par code personnel n'est pas active.

## Lot 6 - Photos et pieces jointes des biens

`DIRECTION` et `INVENTORY_MANAGER` gerent completement les fichiers. `MAINTENANCE_MANAGER` peut consulter et ajouter uniquement une photo de defaut/probleme. `BASIC_USER` consulte uniquement.

### Fichiers des biens

- `GET /api/asset-files`
- `POST /api/asset-files`
- `GET /api/asset-files/[id]`
- `PATCH /api/asset-files/[id]`
- `DELETE /api/asset-files/[id]`
- `GET /api/asset-units/[id]/files`

`POST /api/asset-files` attend un formulaire multipart avec :

- `assetUnitId`
- `fileType`
- `fileLabel` facultatif
- `notes` facultatif
- `isPrimary`
- `file`

Formats acceptes cote serveur : `.jpg`, `.jpeg`, `.png`, `.webp`, `.pdf`.

Taille maximale : 10 Mo.

Types controles :

- `MAIN_PHOTO`
- `GENERAL_VIEW`
- `DETAIL_VIEW`
- `DEFECT_PHOTO`
- `SERIAL_OR_LABEL`
- `INVOICE`
- `WARRANTY`
- `OTHER`

Regles :

- les fichiers sont rattaches a `asset_units`, pas aux modeles ;
- un seul fichier actif peut etre photo principale d'un bien ;
- definir une photo principale desactive les autres principales du meme bien ;
- `DELETE` effectue une suppression logique via `deleted_at` ;
- les fichiers supprimes n'apparaissent pas par defaut ;
- les fichiers locaux sont stockes sous `public/uploads/assets`, ignore par Git.

Actions auditees :

- `ASSET_FILE_UPLOADED`
- `ASSET_FILE_UPDATED`
- `ASSET_FILE_DELETED`
- `ASSET_FILE_SET_PRIMARY`
