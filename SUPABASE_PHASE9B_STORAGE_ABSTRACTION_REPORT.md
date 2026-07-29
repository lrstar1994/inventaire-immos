# Phase 9B — Abstraction de stockage

Date : 2026-07-29
Commit de référence : `ce4b6c223baf91d82696b3ff87ef35d0167bb8fc`

## 1. Résultat de la phase

L'abstraction serveur a été préparée avec le stockage local comme comportement par défaut.
Elle n'a effectué aucune écriture dans Supabase Storage et n'a créé aucune ligne
`asset_files`.

La phase est arrêtée sans commit après l'échec du build PostgreSQL causé par une
indisponibilité du pooler transactionnel Supabase sur le port 6543. La compilation
et la vérification TypeScript de ce build avaient réussi avant l'échec du pré-rendu.
Aucune relance n'a été effectuée.

## 2. État initial vérifié

- commit courant : `ce4b6c223baf91d82696b3ff87ef35d0167bb8fc` ;
- Git contenait uniquement le rapport Phase 9A non suivi ;
- SQLite SHA-256 :
  `8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec` ;
- `immos` : 222 lignes, `asset_files` : 0 ;
- `immos_recipe_phase8` : 253 lignes, `asset_files` : 0 ;
- bucket `asset-files` privé, vide, limite 10 485 760 octets ;
- MIME du bucket : JPEG, PNG, WEBP et PDF ;
- aucun serveur n'écoutait sur les ports 3000 ou 3018.

## 3. Cartographie avant/après

### Avant

| Besoin | Emplacement | Implémentation |
|---|---|---|
| Validation extension/MIME/taille | `lib/asset-file-service.js` | Contrôles sur les métadonnées du navigateur |
| Génération du nom | `saveAssetFileFromForm()` | code du bien + UUID + nom nettoyé |
| Création du dossier | `saveAssetFileFromForm()` | `mkdir()` direct |
| Écriture | `saveAssetFileFromForm()` | `writeFile()` direct |
| URL locale | `saveAssetFileFromForm()` | `/uploads/assets/{code}/{nom}` |
| Lecture/aperçu | UI et service statique Next.js | URL publique locale enregistrée |
| Suppression | `deleteAssetFile()` | suppression logique en base uniquement |
| Multipart | `POST /api/asset-files` | `request.formData()` |

### Après

| Besoin | Emplacement | Implémentation |
|---|---|---|
| Validation commune | `lib/storage/file-validation.js` | taille, MIME, extension, fichier vide et signature binaire |
| Résolution du provider | `lib/storage/get-file-storage-provider.js` | factory paresseuse |
| Écriture locale | `LocalFileStorageProvider.putObject()` | écriture temporaire puis lien atomique sans remplacement |
| Chemin local | `LocalFileStorageProvider` | même préfixe `/uploads/assets` |
| Future écriture Supabase | `SupabaseStorageProvider.putObject()` | REST privé, jamais appelé dans cette phase |
| Future URL signée | `SupabaseStorageProvider.createSignedDownloadUrl()` | 300 secondes par défaut |
| Clé Storage future | `buildAssetUnitStorageKey()` | chemin déterministe sans nom original |

Les routes HTTP et les réponses existantes ne sont pas modifiées. Le service
d'upload appelle désormais le provider sélectionné, mais `local` reste la valeur
par défaut. Les lectures UI continuent donc d'utiliser les mêmes URL locales.

## 4. Architecture retenue

### Contrat commun

Le contrat JSDoc `FileStorageProvider` expose seulement :

- `putObject` ;
- `getObject` ;
- `getDownloadDescriptor` ;
- `createSignedDownloadUrl` ;
- `deleteObject` ;
- `objectExists`.

Les résultats contiennent le provider, la clé relative, la taille, le MIME, le
SHA-256 lorsqu'un objet est écrit et la représentation persistable du chemin.

### Erreurs

- `StorageConfigurationError` ;
- `StorageValidationError` ;
- `StorageObjectNotFoundError` ;
- `StorageConflictError` ;
- `StorageProviderError`.

Les messages publics restent génériques. Les causes techniques sont conservées
dans `cause` côté serveur et aucune URL interne ni clé n'est ajoutée aux messages.

### LocalFileStorageProvider

- racine par défaut : `public/uploads/assets` ;
- surcharge possible avec `LOCAL_ASSET_UPLOAD_DIR` ;
- clé relative obligatoire ;
- refus des chemins absolus, de `.` et de `..` ;
- caractères des segments limités ;
- création contrôlée des répertoires ;
- écriture temporaire puis création atomique sans écrasement ;
- collision explicite ;
- lecture absente : erreur 404 ;
- suppression absente : résultat idempotent `false`.

Les trois JPEG existants n'ont été ni déplacés, ni renommés, ni supprimés.

### SupabaseStorageProvider

- module marqué `server-only` ;
- initialisation paresseuse ;
- configuration lue uniquement lors du premier appel réel ;
- service role utilisée uniquement dans les requêtes serveur ;
- bucket privé ;
- aucune utilisation de `getPublicUrl` ;
- URL signée de 300 secondes ;
- aucune requête au chargement du module.

L'implémentation utilise l'API REST Storage déjà disponible dans le projet afin de
ne pas ajouter une dépendance Supabase au mode SQLite.

## 5. Configuration

Valeurs ajoutées à `.env.example` uniquement :

```text
APP_FILE_STORAGE_PROVIDER=local
LOCAL_ASSET_UPLOAD_DIR=
```

Valeurs autorisées :

- variable absente : `local` ;
- `local` : provider filesystem ;
- `supabase` : provider Supabase ;
- autre valeur : `StorageConfigurationError`.

Les variables Supabase existantes ne sont jamais copiées dans un bundle client
par les modules de stockage.

## 6. Clés Storage

Structure préparée :

```text
assets/units/{assetUnitId}/{fileId}/{fileId}.{extension}
```

Garanties :

- identifiants obligatoires et limités à `[A-Za-z0-9_-]` ;
- aucun slash injecté ;
- extension normalisée en minuscules sans point initial ;
- extensions autorisées : jpg, jpeg, png, webp et pdf ;
- nom original absent de la clé ;
- résultat déterministe.

Ce helper n'est pas encore utilisé pour les uploads historiques ou métier. Aucun
identifiant n'a été généré pour les trois fichiers orphelins.

## 7. Validation commune

- taille strictement positive ;
- maximum 10 Mio inchangé ;
- MIME autorisé inchangé ;
- cohérence extension/MIME ;
- signature binaire vérifiée pour JPEG, PNG, WEBP et PDF ;
- nom original réduit à un nom de base, sans caractères de contrôle, limité à
  255 caractères.

Les formats et la limite métier n'ont pas été élargis.

## 8. Tests

Commande :

```text
npm.cmd run test:storage
```

Résultat : 8 tests réussis, 0 échec.

Couverture :

- provider par défaut local ;
- sélection locale et Supabase ;
- valeur inconnue rejetée ;
- aucune initialisation Supabase en mode local ;
- clé déterministe ;
- traversée, chemins absolus et slashs injectés rejetés ;
- extension normalisée et extension interdite rejetée ;
- expiration signée par défaut de 300 secondes ;
- provider Supabase serveur, paresseux, sans URL publique ni log ;
- factory sans opération Storage au chargement.

Les contrôles Supabase sont mockés ou statiques. Aucun objet réel n'a été créé.

## 9. Builds et vérifications

| Vérification | Résultat |
|---|---|
| Tests Storage | succès, 8/8 |
| `git diff --check` | succès |
| `npm.cmd run build` | succès |
| TypeScript intégré au build | succès |
| `npm.cmd run build:sqlite` | succès |
| TypeScript intégré au build SQLite | succès |
| `npm.cmd run build:postgresql` | échec de connectivité pendant le pré-rendu |

Le dépôt ne contient pas de binaire ou script `tsc` autonome. La vérification
TypeScript disponible est celle exécutée explicitement par Next.js pendant chaque
build ; elle a réussi dans les trois builds.

### Diagnostic du build PostgreSQL

- compilation : réussie ;
- TypeScript : réussi ;
- échec lors de la génération de `/` ;
- erreur Prisma : `P1001` ;
- cible masquée : pooler Supabase transaction, port 6543 ;
- aucune écriture métier ;
- aucune modification de configuration ;
- aucune relance, conformément à la consigne.

L'avertissement Turbopack NFT déjà connu reste non bloquant et hors périmètre.

## 10. Points volontairement non intégrés

- aucune route de téléchargement signé ;
- aucune conversion des `file_path` existants en clé Storage ;
- aucune suppression physique ;
- aucune purge après 30 jours ;
- aucune compensation base/Storage ;
- aucune migration des fichiers ;
- aucune création de ligne `asset_files` ;
- aucune utilisation de Storage depuis l'interface ;
- aucune modification Prisma ;
- aucune politique Storage ou RLS.

Ces éléments relèvent des phases suivantes.

## 11. Fichiers ajoutés

- `lib/storage/errors.js`
- `lib/storage/types.js`
- `lib/storage/config.js`
- `lib/storage/storage-key.js`
- `lib/storage/file-validation.js`
- `lib/storage/storage-provider-factory.js`
- `lib/storage/local-file-storage-provider.js`
- `lib/storage/supabase-storage-provider.js`
- `lib/storage/get-file-storage-provider.js`
- `lib/storage/index.js`
- `scripts/test-file-storage-abstraction.mjs`
- `SUPABASE_PHASE9B_STORAGE_ABSTRACTION_REPORT.md`

## 12. Fichiers modifiés

- `.env.example`
- `lib/asset-file-service.js`
- `package.json`

`SUPABASE_PHASE9A_STORAGE_AUDIT_REPORT.md` reste non suivi.

## 13. Contrôles de non-régression

- SQLite SHA-256 avant/après :
  `8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec` ;
- `immos` contrôlé avant et après : 222 lignes, `asset_files=0` ;
- recette contrôlée avant et après : 253 lignes, `asset_files=0` ;
- les commandes applicatives exécutées après modification sont des builds sans
  mutation ;
- bucket contrôlé avant et après : privé et vide ;
- aucun appel Storage réel par l'abstraction ;
- aucune URL signée réelle ;
- aucune politique ajoutée ;
- trois JPEG inchangés :
  - `4ea6fafc0e1dfec5b1763203715f20c00b2b84720c8ff9158a47a06c440fad4a`
  - `ff1a9c1a9ccf30932426389687755d2065074eacaa56948451e03903dac3bd83`
  - `d360445ca40c9e7c6afc77bc7d97a2c30c9f58b766cfb5de50db422bd5d393ec`
- aucun port 3000 ou 3018 en écoute à la clôture ;
- aucun secret détecté dans le diff suivi.

## 14. État Git final

Aucun commit n'a été créé. Les changements de Phase 9B et les rapports Phase 9A
et 9B restent dans l'arbre de travail pour validation humaine.
