# Phase 10D-B — Stockage LOCAL, métadonnées et compensation

## Conclusion

**Phase 10D-B réussie avec build omis de façon justifiée**

Le flux LOCAL conserve son comportement visible, persiste désormais les métadonnées Storage et supprime le fichier nouvellement écrit si la transaction Prisma échoue. Aucun backend protégé ni objet Supabase Storage n’a été modifié.

## 1. État initial

- HEAD initial : `eb9d487d00dd52e8ea546c45b550ddc0615002a4`
- Message : `docs: close phase 10c recipe migration`
- Aucun fichier suivi modifié au prévol
- Rapports Phase 10C et rapport 10D-A présents comme fichiers non suivis autorisés
- Aucun schéma, migration, package ou fichier de configuration modifié

## 2. Fichiers existants audités

- `lib/asset-file-service.js`
- `lib/asset-file-constants.js`
- `lib/storage/index.js`
- `lib/storage/get-file-storage-provider.js`
- `lib/storage/storage-provider-factory.js`
- `lib/storage/config.js`
- `lib/storage/types.js`
- `lib/storage/errors.js`
- `lib/storage/storage-key.js`
- `lib/storage/file-validation.js`
- `lib/storage/local-file-storage-provider.js`
- `lib/storage/supabase-storage-provider.js`
- `scripts/test-file-storage-abstraction.mjs`
- `scripts/test-supabase-storage-live.mjs`
- `app/api/asset-files/route.js`
- `app/api/asset-files/[id]/route.js`

Un seul appelant métier de `putObject()` a été identifié : `saveAssetFileFromForm()` dans `lib/asset-file-service.js`. Le second appelant est le probe technique Supabase, qui continue d’utiliser les propriétés historiques `storageKey` et `checksum`.

## 3. Contrat avant modification

Le résultat d’upload contenait :

- `provider` en minuscules ;
- `storageKey` ;
- `size` ;
- `contentType` ;
- `checksum` ;
- `databasePath`.

Limites :

- aucune notion explicite de bucket ;
- aucune propriété canonique `key` ;
- aucune propriété canonique `filePath` ;
- valeur du provider incompatible directement avec l’enum Prisma ;
- le service métier ne persistait que `databasePath` dans `filePath`.

## 4. Contrat après modification

Le résultat `StoredObject` fournit désormais :

- `provider: "LOCAL" | "SUPABASE"` ;
- `bucket: string | null` ;
- `key: string` ;
- `filePath: string` ;
- `storageKey`, conservé pour compatibilité ;
- `databasePath`, conservé pour compatibilité ;
- `size` ;
- `contentType` ;
- `checksum`.

Les alias historiques évitent de casser le probe Supabase et les consommateurs existants. Aucune seconde abstraction concurrente n’a été créée.

Conversion métier centralisée :

`storedObjectToAssetFileData()` valide le résultat réel du provider et produit :

- `storageProvider` ;
- `storageBucket` ;
- `storageKey` ;
- `filePath`.

## 5. Convention LOCAL

La convention existante a été strictement conservée :

`{assetCode}/{assetCode}-{uuid}-{nom-nettoyé}{extension}`

Exemple :

`ABC/ABC-uuid-photo.jpg`

Propriétés :

- clé relative ;
- aucun slash initial ;
- aucun chemin absolu ;
- aucun `public/` ;
- aucun `..` ;
- nom technique dérivable du dernier segment ;
- protection contre collision par UUID ;
- nom original conservé séparément dans `fileName`.

Le helper existant `normalizeStorageKey()` reste la source centrale de validation et :

- normalise les séparateurs en `/` ;
- refuse les chemins absolus Windows ou POSIX ;
- refuse les segments vides, `.` et `..` ;
- refuse les caractères hors contrat ;
- ne transforme pas silencieusement un chemin dangereux.

## 6. Règle `filePath`

Pour LOCAL :

`/uploads/assets/{storageKey}`

Le provider retourne cette valeur et le service la persiste sans la recalculer.

Sont exclus :

- chemin absolu disque ;
- lettre de lecteur ;
- domaine local ;
- URL Supabase ;
- URL signée ;
- valeur temporaire.

L’interface n’a pas été modifiée et continue donc à utiliser directement `filePath`.

## 7. Fichiers modifiés

### Code

- `lib/asset-file-service.js`
  - persistance des nouveaux champs ;
  - compensation autour de la transaction Prisma.
- `lib/storage/types.js`
  - enrichissement du contrat JSDoc.
- `lib/storage/local-file-storage-provider.js`
  - résultat canonique LOCAL.
- `lib/storage/supabase-storage-provider.js`
  - alignement du seul résultat d’upload avec le contrat canonique, sans activation ni appel réel.
- `lib/storage/asset-storage-metadata.js`
  - nouveau helper pur de validation, compatibilité et compensation.

### Tests

- `scripts/test-file-storage-abstraction.mjs`
  - scénarios LOCAL, compatibilité et compensation.

### Documentation

- `SUPABASE_PHASE10D_B_LOCAL_STORAGE_METADATA_AND_COMPENSATION_REPORT.md`

Aucun composant UI, route API, schéma Prisma, migration, package ou fichier d’environnement n’a été modifié.

## 8. Persistance AssetFile

### Avant

La création persistait :

- `filePath = storedObject.databasePath` ;
- aucun `storageProvider` ;
- aucun `storageBucket` ;
- aucun `storageKey`.

### Après

Pour un upload LOCAL :

- `storageProvider = LOCAL` ;
- `storageBucket = null` ;
- `storageKey = storedObject.key` normalisé ;
- `filePath = storedObject.filePath`.

Les champs historiques restent inchangés :

- `assetUnitId` ;
- `fileType` ;
- `fileLabel` ;
- `fileName` ;
- `mimeType` ;
- `fileSize` ;
- `isPrimary` ;
- `notes` ;
- `createdById`.

L’audit `ASSET_FILE_UPLOADED` contient également les métadonnées Storage non sensibles.

Aucune ancienne ligne n’a été modifiée et aucun backfill n’a été exécuté.

## 9. Compatibilité ascendante

`resolveAssetFileStorage()` applique les règles suivantes.

### Ancien LOCAL valide

- provider null ;
- bucket null ;
- key null ;
- `filePath` sous `/uploads/assets/`.

Résultat : LOCAL historique, sans exiger un backfill.

La partie relative de `filePath` est malgré tout validée par `normalizeStorageKey()`.

### Nouveau LOCAL valide

- provider `LOCAL` ;
- bucket null ;
- key relative valide ;
- `filePath` exactement égal à `/uploads/assets/{key}`.

### SUPABASE reconnu conceptuellement

- provider `SUPABASE` ;
- bucket renseigné ;
- key valide ;
- `filePath` stable renseigné.

Aucune URL signée n’est générée dans cette phase.

### États rejetés

- provider inconnu ;
- ancien provider null avec bucket ou key ;
- ancien provider null sans chemin local valide ;
- SUPABASE sans bucket ;
- SUPABASE sans key ;
- LOCAL avec bucket ;
- LOCAL sans key ;
- incohérence entre key LOCAL et `filePath` ;
- key absolue ;
- traversal `..` ;
- `filePath` vide.

## 10. Compensation

Flux obtenu :

1. validation du fichier ;
2. écriture par le provider ;
3. validation du résultat canonique ;
4. transaction Prisma ;
5. succès : retour normal ;
6. échec Prisma : appel unique à `deleteObject(storageKey)` ;
7. relance de l’objet d’erreur Prisma original.

La clé compensée provient exclusivement du résultat du provider de la requête courante. Elle ne provient jamais du navigateur.

La suppression LOCAL :

- reconstruit le chemin depuis une racine contrôlée ;
- repasse par `normalizeStorageKey()` ;
- vérifie avec `path.relative()` que la cible reste dans la racine ;
- appelle `unlink()` sur un fichier précis ;
- retourne `false` si le fichier est déjà absent ;
- ne supprime aucun répertoire ;
- n’est pas raccordée au bouton de suppression logique.

## 11. Échec de compensation

Si la transaction Prisma et la suppression échouent :

- l’erreur Prisma reste l’erreur principale ;
- aucun retry global n’est lancé ;
- un diagnostic structuré est écrit côté serveur ;
- le diagnostic contient uniquement :
  - provider ;
  - bucket non secret ;
  - storageKey ;
  - type d’erreur de compensation.

Il ne contient :

- aucune service role key ;
- aucune URL de connexion ;
- aucun chemin absolu ;
- aucune stack envoyée au navigateur.

Risque résiduel assumé : un fichier peut rester orphelin si la compensation échoue. Sa clé est journalisée pour une réconciliation ultérieure.

## 12. Préservation de Supabase

Le provider Supabase n’a pas été activé.

Seul son résultat futur d’upload a été aligné sur le contrat :

- `provider = SUPABASE` ;
- `bucket = bucket configuré` ;
- `key = storageKey normalisée` ;
- `filePath = storageKey`.

Les propriétés historiques restent présentes.

Aucun changement n’a été apporté à :

- authentification ;
- endpoints ;
- upload ;
- suppression ;
- lecture ;
- URLs signées ;
- inventaire ;
- policies ;
- configuration.

Aucun appel réel Supabase n’a été effectué par les tests.

## 13. Tests ajoutés

Six tests ciblés ont été ajoutés :

1. conversion du résultat canonique LOCAL ;
2. upload LOCAL réel dans un répertoire temporaire système ;
3. compatibilité d’une ancienne ligne locale ;
4. rejet des métadonnées incohérentes ou dangereuses ;
5. compensation unique et conservation de l’erreur Prisma ;
6. journalisation d’un échec de compensation sans remplacement de l’erreur Prisma.

Le test d’intégration LOCAL isolé :

- utilise `mkdtemp()` dans le répertoire temporaire système ;
- n’utilise pas `public/uploads/assets` ;
- écrit un petit contenu PDF synthétique ;
- contrôle le contrat, la présence, la suppression et l’absence finale ;
- supprime récursivement son propre répertoire temporaire dans `finally`.

Il n’utilise :

- aucune base ;
- aucun JPEG ;
- aucun réseau ;
- aucun objet Supabase.

## 14. Tests exécutés

Contrôles syntaxiques :

- `node --check` sur le helper Storage ;
- `node --check` sur les deux providers ;
- `node --check` sur le service métier ;
- `node --check` sur la suite Storage.

Résultat : succès.

Suite Storage :

`npm.cmd run test:storage`

Résultat :

- 45 tests ;
- 45 réussis ;
- 0 échec ;
- 0 ignoré ;
- aucun accès à une base protégée ;
- aucun appel Supabase réel ;
- aucun fichier résiduel.

La première invocation par `npm` n’a chargé aucun test : PowerShell a bloqué `npm.ps1` au titre de sa politique d’exécution. La suite a donc été exécutée effectivement une seule fois avec l’exécutable Windows `npm.cmd`.

## 15. Tests omis

Aucun test avec base SQLite jetable n’a été ajouté.

Justification :

- la compensation est isolée derrière un helper injecté et couverte sans base ;
- le provider LOCAL est testé avec un vrai répertoire temporaire ;
- créer une fixture Prisma supplémentaire aurait élargi la phase et les fichiers modifiés ;
- aucune écriture sur le SQLite protégé n’était acceptable.

Les tests PostgreSQL et le probe Supabase ont été omis conformément au périmètre.

## 16. Build

Aucun build n’a été exécuté.

Justification :

- `build:postgresql` cible la production et est explicitement interdit ;
- les changements sont des modules JavaScript couverts par contrôle syntaxique et tests Node ;
- `build:sqlite` ouvrirait la base SQLite protégée et créerait des artefacts Next.js sans apporter de preuve supérieure au test ciblé ;
- aucun changement UI, route, schéma ou configuration ne nécessite un build pour cette phase.

## 17. États protégés finaux

### SQLite

- SHA-256 :
  `8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec`
- inchangé ;
- aucune écriture.

### PostgreSQL production — `immos`

- total global : 222 ;
- `asset_units = 12` ;
- `asset_files = 0` ;
- FK orphelines : 0 ;
- nouvelles colonnes Storage absentes ;
- historique Prisma inchangé ;
- aucune écriture.

### PostgreSQL recette — `immos_recipe_phase8`

- total global : 253 ;
- `asset_units = 13` ;
- `asset_files = 0` ;
- FK orphelines : 0 ;
- colonnes Storage présentes conformément à Phase 10C ;
- historique :
  - `00000000000001_recipe_baseline` terminée ;
  - `20260729120000_add_asset_file_storage_metadata` terminée ;
- aucune écriture.

### Supabase Storage

- bucket `asset-files` accessible ;
- privé ;
- 0 objet ;
- aucune policy modifiée ;
- aucun objet créé.

### JPEG historiques

- 2 405 379 octets :
  `4ea6fafc0e1dfec5b1763203715f20c00b2b84720c8ff9158a47a06c440fad4a`
- 2 107 645 octets :
  `ff1a9c1a9ccf30932426389687755d2065074eacaa56948451e03903dac3bd83`
- 1 501 619 octets :
  `d360445ca40c9e7c6afc77bc7d97a2c30c9f58b766cfb5de50db422bd5d393ec`

Les trois fichiers sont inchangés et n’ont été ni lus par les tests, ni déplacés, ni migrés.

## 18. Diff final

Fichiers applicatifs attendus :

- `lib/asset-file-service.js`
- `lib/storage/types.js`
- `lib/storage/local-file-storage-provider.js`
- `lib/storage/supabase-storage-provider.js`
- `lib/storage/asset-storage-metadata.js`
- `scripts/test-file-storage-abstraction.mjs`

Documentation ajoutée :

- `SUPABASE_PHASE10D_B_LOCAL_STORAGE_METADATA_AND_COMPENSATION_REPORT.md`

Rapport 10D-A conservé non suivi :

- `SUPABASE_PHASE10D_A_STORAGE_FLOW_AUDIT_AND_IMPLEMENTATION_PLAN.md`

Absents du diff :

- schémas Prisma ;
- migrations ;
- package.json ;
- package-lock.json ;
- `.env` et `.env.local` ;
- SQLite ;
- dumps et sauvegardes ;
- JPEG ;
- UI ;
- routes API ;
- clients générés.

`git diff --check` est conforme.

## 19. Risques résiduels

- l’échec simultané DB/compensation peut laisser un fichier orphelin ;
- le diagnostic de compensation n’est pas encore persisté dans une table d’audit dédiée ;
- les anciennes lignes locales restent sans `storageKey`, par choix de compatibilité ;
- le bouton de suppression reste strictement logique et conserve le binaire ;
- le provider est configuré globalement pour le processus ;
- la cohérence Supabase n’est pas encore validée dans le flux métier ;
- l’interface ne sait pas encore résoudre un objet privé.

## 20. Travaux réservés

Phases ultérieures uniquement :

- activation Supabase sur recette ;
- signed URL à la demande ;
- DTO `accessUrl` ;
- téléchargement privé ;
- stratégie de purge après suppression logique ;
- réconciliation des objets orphelins ;
- tests métier PostgreSQL/Supabase ;
- préparation production ;
- éventuel backfill des anciennes lignes.

## 21. Confirmations finales

- aucun commit créé ;
- aucun push ;
- aucun tag ;
- aucun schéma modifié ;
- aucune migration créée ou exécutée ;
- aucune base protégée modifiée ;
- aucune ligne `asset_files` créée ;
- aucun objet Supabase créé ;
- aucune policy modifiée ;
- aucune dépendance installée ;
- aucune variable d’environnement modifiée ;
- aucune service role key exposée ;
- aucune UI modifiée ;
- aucune URL signée implémentée ;
- provider SUPABASE non activé ;
- Phase 10D-C non commencée.
