# Phase 10A ter — Conception du modèle `AssetFile` multi-provider

Date : 2026-07-29

## Conclusion

**Conception nécessitant décision humaine.**

Une architecture cible cohérente et portable est proposée ci-dessous. Trois décisions doivent être validées avant la Phase 10B :

1. utiliser un enum Prisma `StorageProvider` plutôt qu’une chaîne libre ;
2. ne pas persister `storedFileName`, car il est dérivable sans ambiguïté de `storageKey` ;
3. conserver temporairement la colonne physique `file_path`, puis l’exposer comme `legacyFilePath` durant la transition avant sa suppression finale.

Aucun code, schéma, provider, fichier métier ou donnée n’a été modifié. Aucune migration, transaction, commande Prisma, création Storage ou build n’a été exécuté.

## Référence et état Git initial

- Commit de départ : `4a022000c64a273d6492e58bfa5db3ce883a44a0`
- Message : `feat: validate supabase storage integration`
- HEAD conforme : oui
- Seul changement initial : rapport non suivi `SUPABASE_PHASE10A_BIS_ASSET_FILES_MODEL_VALIDATION_REPORT.md`
- Aucun fichier applicatif modifié

## État protégé initial

| Cible | Schéma | `asset_units` | `asset_files` | FK orpheline |
|---|---|---:|---:|---:|
| PostgreSQL production | `immos` | 12 | 0 | 0 |
| PostgreSQL recette | `immos_recipe_phase8` | 13 | 0 | 0 |

- SQLite SHA-256 : `8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec`
- bucket `asset-files` : privé et vide
- tous les préfixes diagnostics : vides, puisque le bucket entier est vide
- trois JPEG historiques : inchangés
- ports 3000 et 3018 : libres
- aucun processus Node, Prisma ou psql résiduel

## Modèle `AssetFile` actuel

### Forme synthétique

```text
AssetFile
  id            String, PK, cuid()
  assetUnitId   String, FK -> AssetUnit.id
  fileType      AssetFileType
  fileLabel     String?
  fileName      String
  filePath      String
  mimeType      String
  fileSize      Int
  isPrimary     Boolean, défaut false
  notes         String?
  createdById   String?
  createdAt     DateTime, défaut now()
  deletedAt     DateTime?
  assetUnit     AssetUnit, onDelete Restrict
```

### Table, clés et relation

- Modèle Prisma : `AssetFile`
- Table : `asset_files`
- PK : `id`, `String`, valeur par défaut `cuid()`
- FK Prisma : `assetUnitId`
- Colonne FK : `asset_unit_id`
- Relation : `assetUnit`
- Relation inverse : `AssetUnit.assetFiles`
- Cardinalité : N fichiers pour 1 unité
- `onDelete` : `Restrict`
- `onUpdate` réel dans les migrations : `Cascade`

### Obligations et valeurs par défaut

Champs obligatoires :

- `id`
- `assetUnitId`
- `fileType`
- `fileName`
- `filePath`
- `mimeType`
- `fileSize`
- `isPrimary`
- `createdAt`

Champs optionnels :

- `fileLabel`
- `notes`
- `createdById`
- `deletedAt`

Valeurs par défaut :

- `id = cuid()`
- `isPrimary = false`
- `createdAt = now()`

`updatedAt` est absent.

### Index et contraintes

Index Prisma communs :

- `assetUnitId`
- `fileType`
- `isPrimary`
- `deletedAt`

Le modèle Prisma ne déclare aucune contrainte unique.

PostgreSQL possède en plus :

- un index unique partiel limitant à une photo principale active par unité ;
- une contrainte imposant un MIME `image/%` à un fichier principal.

Ces deux invariants ne figurent pas dans la migration SQLite actuelle.

### Différences SQLite/PostgreSQL

- Les champs Prisma sont identiques.
- PostgreSQL utilise `Timestamptz(3)` pour `createdAt` et `deletedAt`.
- SQLite utilise `DateTime`.
- PostgreSQL porte les schémas `immos` et `immos_recipe_phase8`.
- `AssetFileType` est un enum natif PostgreSQL et une valeur textuelle gérée par Prisma/SQLite.
- Les deux contraintes PostgreSQL spécifiques aux photos principales n’existent pas en SQLite.

## Usage actuel de `filePath`

### Valeurs écrites

`saveAssetFileFromForm()` construit une clé :

```text
{assetCode}/{nom-technique-généré}
```

Il appelle ensuite le provider actif et enregistre `storedObject.databasePath` dans `filePath`.

Selon le provider :

- local : `databasePath = /uploads/assets/{storageKey}`
- Supabase : `databasePath = {storageKey}`

`filePath` contient donc une **valeur mixte** :

- une URL relative publique en mode local ;
- une clé Storage relative en mode Supabase.

Le code audité ne produit pas de chemin physique absolu dans `filePath`. Les anciennes lignes pourraient néanmoins être ambiguës, faute de provider enregistré.

### Lectures directes

| Fichier | Usage | Attente actuelle | Risque |
|---|---|---|---|
| `app/parc/[id]/asset-unit-detail.js` | `img src` et lien document | URL directement utilisable | une clé Supabase privée n’est pas une URL |
| `app/parc/asset-park.js` | vignettes et photo principale | URL directement utilisable | même risque |
| API `asset-files` | renvoie la ligne brute | `filePath` exposé tel quel | sémantique dépendante du provider |
| API unités et pages parc | incluent `assetFiles` | UI lit `filePath` | couplage à la représentation persistée |
| scripts d’audit SQLite | résolvent `file_path` vers le disque | chemin local attendu | incompatible avec une clé Supabase |

### Écritures et audits

- `lib/asset-file-service.js` écrit `filePath`.
- Les audits de création recopient `filePath` dans leur métadonnée JSON.
- La mise à jour et la suppression logique ne changent pas `filePath`.

### Autres usages

- `storageKey` est la notion native de l’abstraction Storage.
- Les providers retournent déjà `provider`, `storageKey`, `size`, `contentType`, `checksum` et `databasePath`.
- Le code ne possède actuellement ni `originalName`, ni `storageProvider`, ni `storageBucket`.
- `fileName` représente le nom original reçu.
- Le nom technique est calculé dans le service mais n’est pas stocké séparément.
- Aucun `getPublicUrl()` n’est utilisé.
- Supabase produit les URL signées à la demande.

## Modèle cible recommandé

### Forme conceptuelle

```text
enum StorageProvider {
  LOCAL
  SUPABASE
}

AssetFile
  id                String
  assetUnitId       String
  storageProvider   StorageProvider
  storageBucket     String?
  storageKey        String
  originalFileName  String
  mimeType          String
  sizeBytes         Int
  checksumSha256    String?
  fileType          AssetFileType
  fileLabel         String?
  isPrimary         Boolean
  notes             String?
  createdById       String?
  createdAt         DateTime
  updatedAt         DateTime
  deletedAt         DateTime?
  legacyFilePath    String?
```

`storedFileName`, `extension`, `metadata` et `migrationStatus` ne sont pas retenus comme colonnes initiales.

### Détail des champs

| Champ | Prisma | SQLite | PostgreSQL | Nullabilité initiale / finale | Rôle et exemples |
|---|---|---|---|---|---|
| `id` | `String @id @default(cuid())` | `TEXT` | `TEXT` | obligatoire | identité stable |
| `assetUnitId` | `String` | `TEXT` | `TEXT` | obligatoire | FK vers l’unité |
| `storageProvider` | `StorageProvider?`, puis obligatoire | `TEXT` | enum natif | nullable pendant backfill | `LOCAL` ou `SUPABASE` |
| `storageBucket` | `String?` | `TEXT` | `TEXT` | nullable | `null` en local, `asset-files` pour Supabase |
| `storageKey` | `String?`, puis obligatoire | `TEXT` | `TEXT` | nullable pendant backfill | clé relative propre au provider |
| `originalFileName` | renommage Prisma de `fileName` | colonne `file_name` | colonne `file_name` | obligatoire | nom utilisateur |
| `mimeType` | `String` | `TEXT` | `TEXT` | obligatoire | type MIME validé |
| `sizeBytes` | renommage Prisma de `fileSize` | colonne `file_size` | colonne `file_size` | obligatoire | taille binaire |
| `checksumSha256` | `String?` | `TEXT` | `TEXT` | optionnel | intégrité et déduplication future |
| `fileType` | `AssetFileType` | `TEXT` | enum natif | obligatoire | catégorie métier actuelle |
| `createdAt` | `DateTime @default(now())` | `DATETIME` | `TIMESTAMPTZ(3)` | obligatoire | création |
| `updatedAt` | `DateTime @updatedAt` | `DATETIME` | `TIMESTAMPTZ(3)` | obligatoire après ajout/backfill | évolution des métadonnées |
| `legacyFilePath` | `String? @map("file_path")` | `TEXT` | `TEXT` | temporaire | compatibilité avec l’ancienne valeur |

### Champs évalués mais non retenus initialement

- `storedFileName` : dérivable par le dernier segment de `storageKey`; le persister dupliquerait une information et créerait un risque d’incohérence.
- `extension` : dérivable du nom stocké et validée avant upload.
- `metadata Json` : aucun besoin métier actuel précis; éviter une poche non typée.
- `migrationStatus` : inutile tant que `asset_files` est vide; la nullabilité des nouveaux champs suffit à repérer une ligne legacy.

`checksumSha256` est recommandé comme champ optionnel dès la première évolution, car les providers calculent déjà le hash. Il ne doit devenir obligatoire qu’après un backfill vérifié.

## String ou enum pour le provider

### Option A — `String`

Avantages :

- migration SQL simple ;
- ajout futur d’un provider sans migration d’enum ;
- comportement identique SQLite/PostgreSQL.

Inconvénients :

- faute de frappe possible ;
- validation uniquement applicative ou par contrainte SQL spécifique ;
- types générés moins précis.

### Option B — enum Prisma

Avantages :

- valeurs fermées et lisibles ;
- types Prisma générés ;
- cohérence avec les enums métier déjà utilisés ;
- intégrité native PostgreSQL.

Inconvénients :

- enum PostgreSQL à créer et faire évoluer ;
- ajout d’un nouveau provider nécessitant une migration ;
- représentation SQLite textuelle différente physiquement.

### Recommandation

**Option B : enum Prisma `StorageProvider` avec `LOCAL` et `SUPABASE`.**

Le nombre de providers est volontairement borné et chaque nouveau provider exigera de toute façon du code, des tests de sécurité et une migration contrôlée. L’obligation de migration est donc un garde-fou acceptable.

## Sémantique des localisations

### `storageKey`

Clé relative et stable dans l’espace du provider. Elle ne contient ni racine disque, ni domaine, ni bucket.

Supabase :

```text
assets/units/{assetUnitId}/{fileId}/{fileId}.jpg
```

Local :

```text
{assetCode}/{nom-technique}
```

À terme, le local devrait converger vers la même structure déterministe `assets/units/...`, sans déplacer les fichiers existants pendant la migration de schéma.

### `storageBucket`

- Supabase : `asset-files`
- Local : `null`

Le provider local possède une racine configurée, pas un bucket distant. Ne pas enregistrer cette racine physique.

### `originalFileName`

Nom reçu de l’utilisateur, nettoyé pour l’affichage mais non utilisé pour localiser l’objet.

### `storedFileName`

Nom technique égal au dernier segment de `storageKey`.

Décision recommandée : **ne pas le persister**. Le fournir comme propriété calculée dans les DTO si l’UI ou l’audit en a besoin.

### `legacyFilePath`

Ancienne valeur brute de `filePath`, utilisée uniquement pendant la compatibilité transitoire. Elle ne doit jamais devenir la source d’une nouvelle URL signée.

## Décision concernant `filePath`

| Stratégie | Risque | Migration progressive | Clarté | Recommandation |
|---|---|---|---|---|
| suppression immédiate | élevé | mauvaise | bonne après rupture | non |
| conservation sous le même nom | faible à court terme | bonne | ambiguïté durable | non |
| renommage en `legacyFilePath` | maîtrisable | bonne si staged | excellente | oui |
| réinterprétation | élevé | ambiguë | mauvaise | non |

Recommandation : **stratégie 3, réalisée progressivement**.

1. Ajouter d’abord les nouveaux champs tout en conservant `filePath`.
2. Déployer un résolveur de téléchargement qui privilégie les nouveaux champs et utilise `filePath` seulement pour les lignes legacy.
3. Backfiller et vérifier.
4. Renommer le champ Prisma en `legacyFilePath @map("file_path")` avec mise à jour simultanée du code.
5. Supprimer la colonne physique dans une phase ultérieure seulement.

Cette approche évite une réinterprétation silencieuse de `filePath`.

## Contraintes et index recommandés

### À conserver

- FK `assetUnitId -> AssetUnit.id`
- `onDelete: Restrict`
- `onUpdate: Cascade`
- index `assetUnitId`
- index `fileType`, `isPrimary`, `deletedAt`
- invariants de photo principale

`Restrict` reste préférable à `Cascade` : supprimer une unité ne doit pas effacer implicitement la traçabilité des fichiers.

### À ajouter après backfill

- index `storageProvider`
- index `storageKey`
- index composé `[storageProvider, storageBucket, storageKey]`
- contrainte d’unicité finale adaptée au namespace

Recommandation d’unicité :

- Supabase : unique sur provider + bucket + clé ;
- local : unique sur provider + clé lorsque bucket est nul.

Comme les valeurs `NULL` n’ont pas une sémantique d’unicité identique à une valeur ordinaire, une contrainte unique composée unique ne protège pas suffisamment le cas local. Deux index uniques partiels SQL sont techniquement les plus précis, mais exigent des migrations SQL spécifiques SQLite et PostgreSQL. Alternative plus portable : rendre `storageBucket` obligatoire et utiliser une valeur logique stable, par exemple `local-assets`. Cette décision doit être prise humainement avant la migration finale.

### Longueurs et validations

Prisma `String` ne fixe pas de longueur portable. Recommandations applicatives :

- `storageKey` : maximum 1024 caractères ;
- `storageBucket` : maximum 128 caractères ;
- nom original : maximum 255 caractères ;
- SHA-256 : exactement 64 caractères hexadécimaux.

Les contraintes de format doivent être validées côté application. Les CHECK SQL multiplateformes pourront être étudiés séparément.

## Représentation locale

Le provider local actuel utilise :

- racine physique : `LOCAL_ASSET_UPLOAD_DIR` ou `public/uploads/assets` ;
- préfixe public : `/uploads/assets` ;
- `storageKey` relatif à cette racine.

Représentation cible d’une ligne :

```text
storageProvider = LOCAL
storageBucket   = null
storageKey      = LIT-KING-000002/<nom-technique>.jpg
```

Ne pas stocker :

- `public/`
- le chemin absolu du projet
- la lettre de lecteur Windows
- le préfixe URL `/uploads/assets`

Le descriptor local reconstruit l’URL historique à partir du provider et de la clé.

## Représentation Supabase

```text
storageProvider = SUPABASE
storageBucket   = asset-files
storageKey      = assets/units/{assetUnitId}/{fileId}/{fileId}.jpg
```

La base ne doit jamais stocker :

- URL signée ;
- token ;
- URL temporaire ;
- URL publique ;
- service role key ;
- endpoint Supabase complet.

Le téléchargement est résolu à la demande depuis provider + bucket + clé, avec une URL signée de 300 secondes.

## Compatibilité transitoire

Ordre de lecture recommandé :

1. si `storageProvider` et `storageKey` sont présents, utiliser le provider ;
2. sinon, utiliser `legacyFilePath` uniquement selon l’ancienne convention locale ;
3. ne jamais deviner Supabase à partir du format d’une chaîne ;
4. journaliser côté serveur les lignes legacy rencontrées, sans données sensibles ;
5. refuser une ligne incohérente plutôt que fabriquer une URL publique.

Ordre d’écriture recommandé :

- toutes les nouvelles lignes utilisent exclusivement les nouveaux champs ;
- `legacyFilePath` reste nul pour une nouvelle ligne ;
- aucune double écriture durable dans les deux représentations.

## Plan de migration SQLite

### Migration 1 — colonnes compatibles

Ajouter comme nullable :

- `storage_provider`
- `storage_bucket`
- `storage_key`
- `checksum_sha256`
- `updated_at`

Conserver `file_path`, `file_name` et `file_size`.

SQLite nécessite souvent une reconstruction de table pour rendre ensuite des colonnes obligatoires ou ajouter certaines contraintes. La migration doit préserver PK, FK et index existants.

### Migration 2 — code dual-read

- écrire les nouveaux champs ;
- lire nouveaux champs puis fallback legacy ;
- transformer `fileName` en `originalFileName` au niveau Prisma via le même `@map("file_name")` ;
- transformer `fileSize` en `sizeBytes` via `@map("file_size")`.

Ces deux renommages Prisma ne nécessitent pas de renommage physique.

### Migration 3 — backfill

Pour chaque ligne existante :

- classifier uniquement à partir d’une preuve fiable ;
- local : retirer le préfixe `/uploads/assets/` pour obtenir la clé ;
- ne jamais classifier automatiquement une valeur ambiguë comme Supabase ;
- calculer le checksum depuis le fichier seulement dans une phase explicitement autorisée.

### Migration 4 — contraintes

Après vérification :

- reconstruire la table si nécessaire ;
- rendre provider, clé et `updatedAt` obligatoires ;
- recréer FK et index ;
- ajouter les invariants multiplateformes décidés.

## Plan de migration PostgreSQL

### Migration 1

- créer l’enum `StorageProvider` ;
- ajouter les nouvelles colonnes nullable ;
- ajouter `updated_at` nullable ou avec valeur de backfill contrôlée ;
- ne pas toucher à `file_path`.

### Migration 2

- déployer le code dual-read/dual-schema ;
- écrire uniquement la nouvelle représentation.

### Migration 3

- backfill transactionnel par lots ;
- vérifier les comptes, FK, clés et doublons ;
- ne pas toucher au bucket pendant le backfill des métadonnées.

### Migration 4

- rendre les champs requis `NOT NULL` ;
- ajouter les index simples et uniques finaux ;
- conserver temporairement `file_path`.

### Migration 5 ultérieure

- exposer `file_path` comme `legacyFilePath` ;
- supprimer la colonne seulement après absence totale de fallback.

Production et recette utilisent deux schémas : les migrations ou scripts SQL devront cibler explicitement chaque schéma et vérifier `current_schema()` avant toute écriture.

## Étapes fusionnables et étapes à séparer

`asset_files` est actuellement vide dans SQLite, production et recette. Techniquement, ajout des colonnes et passage à `NOT NULL` pourraient être fusionnés.

Recommandation prudente :

- recette : migration nullable, code, validation, puis contraintes dans des sous-phases distinctes ;
- production vide : fusion possible après validation recette, mais conserver un contrôle préalable `asset_files = 0` ;
- ne jamais dépendre de l’hypothèse de table vide sans recompter immédiatement avant migration.

## Futures phases proposées

| Phase | Objectif | Backend/écritures | Critère d’arrêt | Commit |
|---|---|---|---|---|
| 10B | modifier les trois schémas Prisma et générer les migrations sans les appliquer | fichiers uniquement | diff inattendu ou migration destructive | oui après revue |
| 10C | appliquer et valider sur recette | PostgreSQL recette | P1001/P2028, schéma incorrect, résidu incohérent | non avant validation |
| 10D | transaction `AssetFile` recette avec rollback | recette temporaire | rollback incomplet ou contrainte divergente | rapport seulement |
| 10E | appliquer sur production vide et SQLite avec sauvegarde | production + SQLite | compte non nul inattendu, FK ou SHA non maîtrisé | oui après validation |
| 10F | créer un premier objet et une ligne techniques persistants, puis nettoyage contrôlé | recette + Storage | divergence objet/ligne | non avant validation |
| 10G | migrer un premier fichier métier explicitement sélectionné | recette puis production sur autorisation | hash, relation ou téléchargement non conforme | séparé |

Aucune de ces phases n’a commencé.

## Plan de rollback

### Préparation commune

- tag documentaire du commit courant, sans créer de tag Git automatiquement ;
- copie vérifiée de SQLite ;
- export logique de `asset_files` et des métadonnées FK PostgreSQL ;
- relevé des migrations appliquées ;
- inventaire et hashes du bucket ;
- conservation des fichiers locaux.

### Avant toute donnée `AssetFile`

- revenir au code Phase 9C ;
- retirer les colonnes ajoutées uniquement si la restauration a été testée ;
- sinon conserver les colonnes inutilisées et revenir au code antérieur ;
- restaurer SQLite depuis sa copie si sa structure a été migrée.

### Après création de lignes

- exporter les lignes nouvelles ;
- désactiver les écritures ;
- restaurer les colonnes legacy et relations ;
- supprimer une colonne seulement après sauvegarde des valeurs ;
- ne jamais supprimer une ligne dont l’objet associé n’a pas été identifié.

### Après upload Storage

- traiter base et Storage comme deux systèmes sans transaction distribuée ;
- inventorier ligne et objet avant compensation ;
- si la base échoue après upload, conserver l’objet en quarantaine ou le supprimer seulement avec confirmation explicite ;
- si Storage échoue après création de ligne, marquer l’incident et compenser la ligne dans une transaction dédiée ;
- vérifier hash, clé et bucket avant toute suppression ;
- ne jamais supprimer les trois JPEG historiques.

## Règles métier préservées

La future évolution ne doit pas modifier :

- la relation `AssetFile -> AssetUnit` ;
- `onDelete: Restrict` ;
- la suppression logique actuelle ;
- la gestion des unités ;
- les autres modules inventaire ;
- les règles validées des autres tables ;
- le provider local par défaut ;
- le fonctionnement SQLite local ;
- le fonctionnement PostgreSQL parallèle ;
- le caractère privé du bucket ;
- l’expiration de 300 secondes des URL signées.

Aucun nouveau module métier n’est proposé.

## Risques identifiés

- rupture UI si une clé privée remplace directement une URL dans `filePath` ;
- mauvaise classification automatique d’une valeur legacy ambiguë ;
- duplication incohérente si `storedFileName` et `storageKey` sont tous deux persistés ;
- unicité locale mal protégée si `storageBucket` reste nul ;
- différence entre contraintes SQLite et PostgreSQL ;
- migration Prisma interprétant un renommage logique comme suppression/recréation ;
- perte de traçabilité si `file_path` est supprimé trop tôt ;
- objet orphelin en l’absence de transaction distribuée ;
- ligne orpheline de Storage ;
- exposition accidentelle d’URL signée si elle est persistée ;
- application d’une migration au mauvais schéma PostgreSQL.

## État final

Identique à l’état initial :

- HEAD : `4a022000c64a273d6492e58bfa5db3ce883a44a0`
- SQLite SHA-256 inchangé
- `immos.asset_units = 12`
- `immos.asset_files = 0`
- `immos_recipe_phase8.asset_units = 13`
- `immos_recipe_phase8.asset_files = 0`
- aucune FK orpheline
- bucket `asset-files` privé et vide
- aucun objet Storage créé
- trois JPEG historiques inchangés
- aucun processus résiduel
- ports 3000 et 3018 libres
- aucun secret exposé
- aucun commit créé

L’état Git final contient uniquement les deux rapports non suivis Phase 10A bis et Phase 10A ter.
