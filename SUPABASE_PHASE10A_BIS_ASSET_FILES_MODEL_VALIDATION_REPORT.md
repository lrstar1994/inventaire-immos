# Phase 10A bis — Validation métier de `asset_files`

Date : 2026-07-29

## Conclusion

**Phase 10A bis échouée avant transaction.**

L’audit structurel demandé a montré que le modèle `AssetFile` actuel ne permet pas de représenter séparément toutes les métadonnées minimales attendues pour le dual-backend :

- aucun champ de fournisseur de stockage ;
- aucun champ de bucket ;
- aucun champ dédié à la clé Storage ;
- aucun champ distinct pour le nom technique stocké ;
- aucun champ `updatedAt`.

Le champ générique `filePath` reçoit actuellement soit l’URL locale historique, soit la clé retournée par le provider Supabase, mais il ne permet pas d’identifier sans ambiguïté le provider, le bucket et la nature de cette valeur. Conformément à la règle d’arrêt de la phase, aucune transaction temporaire, aucun test d’écriture et aucun build n’ont été exécutés.

## Référence Git et état initial

- Commit de départ et HEAD : `4a022000c64a273d6492e58bfa5db3ce883a44a0`
- Message : `feat: validate supabase storage integration`
- Dépôt initial : propre
- `git diff --stat` initial : vide
- `git diff --name-status` initial : vide

Les références corrigées ont bien été utilisées :

- `immos.asset_units` : 12
- `immos_recipe_phase8.asset_units` : 13

Les valeurs historiques 222 et 253 sont des **totaux globaux de lignes des schémas**, et non des nombres de lignes de `asset_units`.

## État protégé initial

### SQLite

- SHA-256 attendu : `8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec`
- SHA-256 relevé : `8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec`
- Conforme : oui

### PostgreSQL

Contrôles effectués en lecture seule :

| Schéma | `current_schema()` | `asset_units` | `asset_files` | FK `asset_files` orpheline |
|---|---|---:|---:|---:|
| `immos` | `immos` | 12 | 0 | non applicable à une table vide |
| `immos_recipe_phase8` | `immos_recipe_phase8` | 13 | 0 | 0 |

### Storage

- Bucket : `asset-files`
- Privé : oui
- Vide : oui
- Aucun objet créé, lu ou supprimé pendant cette phase
- Aucun probe Storage exécuté
- Aucune URL signée créée
- Aucune policy modifiée

### Fichiers JPEG protégés

Les trois fichiers historiques ont uniquement été contrôlés par taille et SHA-256. Ils n’ont été ni déplacés, ni renommés, ni modifiés :

| Taille | SHA-256 |
|---:|---|
| 2 405 379 octets | `4ea6fafc0e1dfec5b1763203715f20c00b2b84720c8ff9158a47a06c440fad4a` |
| 2 107 645 octets | `ff1a9c1a9ccf30932426389687755d2065074eacaa56948451e03903dac3bd83` |
| 1 501 619 octets | `d360445ca40c9e7c6afc77bc7d97a2c30c9f58b766cfb5de50db422bd5d393ec` |

## Audit Prisma complet

### Identité et relation

- Modèle Prisma : `AssetFile`
- Table réelle : `asset_files`
- Clé primaire : `id`
- Type de clé primaire : `String`
- Valeur par défaut : `cuid()`
- Clé étrangère : `assetUnitId`, mappée sur `asset_unit_id`
- Cible : `AssetUnit.id`
- Champ relationnel : `assetUnit`
- Relation inverse : `AssetUnit.assetFiles`
- Cardinalité : plusieurs fichiers pour une unité, exactement une unité par fichier
- `onDelete` : `Restrict`
- `onUpdate` réel : `Cascade`

### Champs

| Champ Prisma | Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|---|
| `id` | `id` | `String` | oui | `cuid()` |
| `assetUnitId` | `asset_unit_id` | `String` | oui | aucun |
| `fileType` | `file_type` | `AssetFileType` | oui | aucun |
| `fileLabel` | `file_label` | `String?` | non | `null` |
| `fileName` | `file_name` | `String` | oui | aucun |
| `filePath` | `file_path` | `String` | oui | aucun |
| `mimeType` | `mime_type` | `String` | oui | aucun |
| `fileSize` | `file_size` | `Int` | oui | aucun |
| `isPrimary` | `is_primary` | `Boolean` | oui | `false` |
| `notes` | `notes` | `String?` | non | `null` |
| `createdById` | `created_by` | `String?` | non | `null` |
| `createdAt` | `created_at` | `DateTime` | oui | `now()` |
| `deletedAt` | `deleted_at` | `DateTime?` | non | `null` |

`updatedAt` n’existe pas sur ce modèle.

### Enum

`AssetFileType` contient :

- `MAIN_PHOTO`
- `GENERAL_VIEW`
- `DETAIL_VIEW`
- `DEFECT_PHOTO`
- `SERIAL_OR_LABEL`
- `INVOICE`
- `WARRANTY`
- `OTHER`

### Index et contraintes

Index Prisma communs aux trois variantes :

- `asset_unit_id`
- `file_type`
- `is_primary`
- `deleted_at`

Aucune contrainte unique n’est déclarée dans le modèle Prisma.

PostgreSQL possède en plus deux invariants spécifiques dans la baseline :

- index unique partiel `asset_files_one_active_primary_per_asset_idx`, limitant à une photo principale active par unité ;
- contrainte `asset_files_primary_must_be_image_check`, imposant un MIME `image/%` lorsqu’un fichier est principal.

Ces deux invariants PostgreSQL n’existent pas dans la migration SQLite `20260608100000_lot_6_asset_files`. Il existe donc une divergence de contraintes entre les backends, même si les champs Prisma sont alignés.

### Comparaison des backends

- SQLite, PostgreSQL normal et PostgreSQL recette exposent les mêmes champs Prisma.
- PostgreSQL utilise `Timestamptz(3)` pour les dates ; SQLite utilise `DateTime`.
- PostgreSQL rattache modèles et enum respectivement à `immos` et `immos_recipe_phase8`.
- SQLite ne porte pas les deux contraintes PostgreSQL spécifiques décrites ci-dessus.

### Couverture des métadonnées minimales demandées

| Besoin | Couverture actuelle |
|---|---|
| Fournisseur Storage | absente |
| Bucket | absente |
| Clé Storage | partielle et ambiguë via `filePath` |
| Nom original | présent via `fileName` |
| Nom technique stocké | absent comme donnée distincte |
| Type MIME | présent via `mimeType` |
| Taille | présente via `fileSize` |
| Catégorie/type métier | présent via `fileType` |
| Relation avec `AssetUnit` | présente |

Une évolution de modèle et donc une phase de migration dédiée seraient nécessaires pour représenter explicitement toutes les métadonnées requises. Aucune migration n’a été créée ou exécutée dans cette phase.

## Audit des accès applicatifs

### Routes API

- `GET /api/asset-files` : liste filtrable par unité et type, avec exclusion logique par défaut.
- `POST /api/asset-files` : création multipart via `saveAssetFileFromForm()`.
- `GET /api/asset-files/[id]` : lecture unitaire.
- `PATCH /api/asset-files/[id]` : modification du type, libellé, notes ou statut principal.
- `DELETE /api/asset-files/[id]` : suppression logique.
- `GET /api/asset-units/[id]/files` : liste des fichiers d’une unité.
- Les routes de lecture des unités et les pages du parc incluent également `assetFiles`.

Une API métier `asset_files` existe donc déjà.

### Service

`lib/asset-file-service.js` fournit :

- `assetFileInclude()` pour la relation unité/article ;
- `saveAssetFileFromForm()` pour validation, stockage, création de la ligne et audits ;
- `updateAssetFile()` pour les métadonnées modifiables et le fichier principal ;
- `deleteAssetFile()` pour la suppression logique ;
- `assetFileOptions()` pour les types, extensions et taille maximale.

### Comportement local et PostgreSQL

- Le provider local reste le défaut.
- L’écriture physique passe par l’abstraction Storage.
- `storedObject.databasePath` est enregistré dans `filePath`.
- En local, cette valeur conserve l’URL historique.
- Avec Supabase, cette valeur correspond à la clé relative retournée par le provider.
- La création en base et les audits sont transactionnels après l’écriture Storage.
- La suppression applicative est logique en base (`deletedAt`, `isPrimary=false`) et ne supprime pas physiquement l’objet.
- `deleteAssetFile()` met la ligne à jour puis écrit l’audit par un appel séparé, contrairement aux créations et mises à jour transactionnelles.

Ces observations sont documentaires ; aucun comportement n’a été modifié.

## Validation transactionnelle

Non exécutée.

Motif : incompatibilité structurelle réelle détectée pendant l’audit obligatoire, avant l’ouverture de toute transaction.

Par conséquent :

- aucune `AssetUnit` sélectionnée pour écriture ;
- aucune ligne fictive `phase10a-test.txt` créée ;
- aucun test de contrainte négatif exécuté ;
- aucun COMMIT ;
- aucun ROLLBACK nécessaire ;
- aucune donnée temporaire ou résiduelle.

## Tests et builds

Non exécutés, conformément à la règle d’arrêt avant transaction :

- aucun test automatisé ajouté ;
- `npm run build` non lancé ;
- `npm run build:sqlite` non lancé ;
- `npm run build:postgresql` non lancé.

## État final

L’état final est identique à l’état initial :

- SQLite SHA-256 inchangé ;
- `immos.asset_units` : 12 ;
- `immos.asset_files` : 0 ;
- `immos_recipe_phase8.asset_units` : 13 ;
- `immos_recipe_phase8.asset_files` : 0 ;
- violation FK recette liée à `asset_files` : 0 ;
- bucket `asset-files` privé et vide ;
- aucun objet Storage créé ;
- trois JPEG historiques inchangés ;
- aucun secret exposé ;
- aucun commit créé.

La seule modification du dépôt est ce rapport non commité.
