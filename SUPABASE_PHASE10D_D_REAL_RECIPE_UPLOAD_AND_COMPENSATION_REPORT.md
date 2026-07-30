# Phase 10D-D — Upload Supabase Storage réel sur recette avec validation et nettoyage

## Conclusion

**Phase 10D-D réussie avec build omis de façon justifiée**

L’upload réel Supabase Storage, la persistance temporaire en recette, la lecture
serveur, la compensation après erreur Prisma synthétique et le nettoyage final
ont tous été validés. La recette est revenue à 253 lignes métier, 13
`asset_units` et 0 `asset_files`. Le bucket privé `asset-files` est revenu vide.

## État Git initial

- HEAD :
  `1885b2703ffe1966a4046864b46b98d4c9ec6c1d`
- dernier commit :
  `feat: secure supabase storage server configuration`
- aucun fichier suivi modifié au prévol ;
- seuls les rapports post-commit et historiques déjà connus étaient non suivis.

## Fichiers modifiés ou créés

### Modifiés

- `lib/asset-file-service.js`
  - génération d’une clé dédiée SUPABASE sans nom original ;
  - convention LOCAL historique conservée.
- `lib/storage/supabase-storage-provider.js`
  - validation binaire et métadonnées ;
  - catégorisation sûre des erreurs d’upload et de suppression ;
  - conversion des erreurs réseau sans reprendre le message brut.
- `lib/storage/types.js`
  - contrat binaire étendu à `ArrayBuffer`.
- `scripts/test-file-storage-abstraction.mjs`
  - cinq tests mockés 10D-D.

### Créés

- `scripts/test-supabase-recipe-asset-upload.mjs`
  - probe recette réel avec garde-fous et nettoyage borné.
- `SUPABASE_PHASE10D_D_REAL_RECIPE_UPLOAD_AND_COMPENSATION_REPORT.md`

Aucun fichier UI, route, schéma Prisma, migration, package, `.env`, base,
sauvegarde ou JPEG n’a été modifié.

## Implémentation du provider SUPABASE

La méthode `putObject()` existante reste l’unique implémentation d’upload.

Elle :

1. normalise la clé avec `normalizeStorageKey()` ;
2. convertit explicitement `Buffer`, `Uint8Array` ou `ArrayBuffer` en `Buffer` ;
3. vérifie le type MIME, la taille entière positive ou nulle et l’égalité entre
   taille annoncée et octets ;
4. sélectionne le bucket validé par le client serveur ;
5. envoie le binaire par HTTP `POST` ;
6. transmet `content-type` ;
7. transmet `x-upsert: false` ;
8. retourne le contrat canonique.

Résultat :

- `provider = SUPABASE`
- `bucket = asset-files`
- `key = storageKey`
- `filePath = storageKey`
- aucun chemin local ;
- aucune URL publique, signée ou temporaire.

## Convention exacte de storageKey

Pour SUPABASE :

`assets/units/{assetUnitId}/{fileId}/{fileId}.{extension}`

- `assetUnitId` est l’identifiant technique de l’unité ;
- `fileId` est un UUID aléatoire généré avant l’upload ;
- l’extension est normalisée et validée ;
- le dernier segment permet de dériver le nom stocké ;
- aucun code métier, nom original, utilisateur, email, bucket, chemin absolu ou
  secret n’est inclus.

Le flux LOCAL conserve volontairement sa convention existante afin de ne pas
changer son comportement visible dans cette phase.

## Règle exacte de filePath

Pour SUPABASE :

`filePath = storageKey`

Les sources de vérité sont :

- `storageProvider`
- `storageBucket`
- `storageKey`

`filePath` ne contient ni domaine, ni token, ni URL publique, ni URL signée.

## Paramètres d’upload non secrets

- provider : `SUPABASE`
- bucket : `asset-files`
- méthode : `POST`
- type réel testé : `image/png`
- taille réelle testée : 68 octets
- écrasement : interdit par `x-upsert: false`
- clé : relative, normalisée et fondée sur deux identifiants techniques.

## Gestion des erreurs

Les catégories contrôlées sont :

- configuration invalide : `StorageConfigurationError` ;
- clé invalide : `StorageValidationError` ;
- contenu/taille invalide : `StorageValidationError` ;
- objet existant, HTTP 409 : `StorageConflictError` ;
- bucket inaccessible, HTTP 404 : `StorageProviderError` ;
- accès refusé, HTTP 401/403 : `StorageProviderError` ;
- autre refus HTTP : `StorageProviderError` ;
- réseau indisponible : `StorageProviderError` sans message réseau brut.

Aucune réponse brute, clé, URL complète, en-tête ou JWT n’est incorporé dans
les messages.

## Méthode remove et compensation Prisma

`deleteObject(storageKey)` :

- normalise la clé ;
- refuse vide, absolu et `..` ;
- cible une URL d’objet exacte ;
- n’accepte aucun préfixe ou répertoire ;
- retourne `false` pour HTTP 404 ;
- convertit refus et erreur réseau en erreur métier contrôlée.

Le flux métier conserve la compensation 10D-B :

1. upload ;
2. validation du résultat canonique ;
3. persistance Prisma ;
4. sur erreur Prisma, suppression unique de la clé créée ;
5. conservation de l’erreur Prisma comme erreur principale ;
6. journalisation structurée d’un éventuel échec de compensation.

Bucket et clé proviennent du résultat réel du provider ; ils ne sont pas
recalculés au moment de la persistance.

## Tests unitaires ajoutés

Cinq tests mockés ont été ajoutés :

1. upload réussi avec bucket, MIME, `x-upsert: false`, clé et `filePath` ;
2. conversion des erreurs 409, 404, 403, 500 et réseau sans secret ;
3. rejet d’une taille incohérente avant tout appel ;
4. compensation SUPABASE sur l’URL exacte, appelée une seule fois ;
5. échec de suppression sans remplacement de l’erreur Prisma.

## Résultat des tests mockés

Commande :

`npm.cmd run test:storage`

Résultats :

- tests historiques avant 10D-D : 55/55 ;
- nouveaux tests mockés 10D-D : 5/5 ;
- total unitaire : 60/60 ;
- échec : 0 ;
- aucun réseau réel ;
- aucune base ;
- aucune vraie clé ;
- aucun fichier dans `public/uploads/assets`.

## Garde-fous recette

Avant toute écriture réelle, deux niveaux de garde-fous ont confirmé :

- schéma production actif : `immos` ;
- production : 12 `asset_units`, 0 `asset_files` ;
- schéma recette actif : `immos_recipe_phase8` ;
- recette : 13 `asset_units`, 0 `asset_files`, 0 FK orpheline ;
- connexion recette directe sur port 5432 avec SSL obligatoire ;
- provider explicitement fixé à `supabase` dans le processus du probe ;
- bucket exactement `asset-files` ;
- bucket privé ;
- bucket vide.

Le script refuse `immos`, tout schéma inconnu, tout bucket différent, un
provider non explicite ou un état initial divergent.

## AssetUnit technique

Une AssetUnit temporaire a été créée uniquement dans la recette :

- identifiant technique :
  `cms7mi78u0001v5aw4xulsivl`
- code technique préfixé `PHASE10DD-` ;
- item, emplacement, état et condition repris en lecture seule d’une unité
  recette existante ;
- aucune AssetUnit production utilisée ;
- aucune unité métier existante modifiée ;
- unité temporaire supprimée après le test.

La vérification finale ne trouve plus aucune unité dont le code commence par
`PHASE10DD-`.

## Fichier synthétique

- nom original : `phase10d-d-storage-test.png`
- type : `image/png`
- contenu : PNG synthétique 1×1 pixel ;
- taille : 68 octets ;
- SHA-256 :
  `431ced6916a2a21a156e38701afe55bbd7f88969fbbfc56d7fe099d47f265460`
- dossier : répertoire temporaire système hors `public/uploads/assets` ;
- fichier supprimé dans le `finally` ;
- aucun JPEG historique utilisé.

## Upload réel validé

Clé principale :

`assets/units/cms7mi78u0001v5aw4xulsivl/62383dc7-9bcd-4e9b-8003-3f0e0d5a7416/62383dc7-9bcd-4e9b-8003-3f0e0d5a7416.png`

Ligne AssetFile temporaire :

- identifiant :
  `cms7mi8530003v5awjjzvbpck`
- `storageProvider = SUPABASE`
- `storageBucket = asset-files`
- `storageKey` conforme à la convention ;
- `filePath = storageKey`
- `fileName = phase10d-d-storage-test.png`
- `mimeType = image/png`
- `fileSize = 68`
- lien vers l’AssetUnit temporaire exact.

Lecture serveur de l’objet :

- présence confirmée ;
- taille : 68 octets ;
- MIME : `image/png` ;
- SHA-256 identique ;
- égalité octet par octet ;
- aucune URL signée créée.

## Test réel de compensation

Clé de compensation :

`assets/units/cms7mi78u0001v5aw4xulsivl/73da362a-19e0-4590-8044-307d57f7fe25/73da362a-19e0-4590-8044-307d57f7fe25.png`

Scénario :

1. upload réel réussi ;
2. erreur Prisma synthétique injectée après l’upload ;
3. erreur originale conservée par identité ;
4. suppression réelle de l’objet exécutée ;
5. absence confirmée dès la première observation list-based ;
6. aucune ligne AssetFile avec cette clé.

Aucune contrainte, migration ou donnée métier n’a été altérée pour provoquer
l’échec.

## Nettoyage

Le nettoyage nominal a supprimé dans cet ordre :

1. ligne AssetFile principale précise ;
2. objet Storage principal précis ;
3. AssetUnit temporaire précise ;
4. fichier PNG temporaire local.

Le second objet avait déjà été supprimé par la compensation.

Le bloc `finally` conservait en mémoire uniquement :

- deux clés Storage UUID ;
- un identifiant AssetFile ;
- un identifiant AssetUnit ;
- le répertoire temporaire de l’exécution.

Aucune suppression large, par préfixe ou répertoire Storage n’a été utilisée.

## État recette avant et après

Avant :

- total métier : 253
- `asset_units = 13`
- `asset_files = 0`
- FK orphelines = 0

Pendant le scénario principal :

- une AssetUnit temporaire ;
- un AssetFile temporaire ;
- un objet principal ;
- un second objet destiné à la compensation.

Après nettoyage :

- total métier : 253
- `asset_units = 13`
- `asset_files = 0`
- FK orphelines = 0
- fixture `PHASE10DD-*` : 0
- fichier `phase10d-d-storage-test.png` : 0
- historique Prisma inchangé :
  - `00000000000001_recipe_baseline` terminée ;
  - `20260729120000_add_asset_file_storage_metadata` terminée.

## État bucket avant et après

Avant :

- bucket `asset-files`
- privé
- 0 objet

Après :

- bucket `asset-files`
- privé
- 0 objet
- aucun objet de test résiduel
- aucune policy modifiée.

## État production

Schéma `immos`, lecture seule :

- `asset_units = 12`
- `asset_files = 0`
- historique Prisma inchangé :
  `00000000000000_baseline`, terminé et non annulé ;
- aucune requête d’écriture.

## État SQLite

- SHA-256 :
  `8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec`
- aucune écriture ;
- aucune migration.

## État des JPEG

Les trois JPEG historiques sont inchangés :

- 2 405 379 octets —
  `4ea6fafc0e1dfec5b1763203715f20c00b2b84720c8ff9158a47a06c440fad4a`
- 2 107 645 octets —
  `ff1a9c1a9ccf30932426389687755d2065074eacaa56948451e03903dac3bd83`
- 1 501 619 octets —
  `d360445ca40c9e7c6afc77bc7d97a2c30c9f58b766cfb5de50db422bd5d393ec`

Ils n’ont été ni copiés, ni déplacés, ni uploadés.

## Contrôles syntaxiques

`node --check` a réussi pour :

- `lib/asset-file-service.js`
- `lib/storage/types.js`
- `lib/storage/supabase-storage-provider.js`
- `scripts/test-file-storage-abstraction.mjs`
- `scripts/test-supabase-recipe-asset-upload.mjs`

`git diff --check` est conforme.

Le projet ne fournit aucun script `typecheck` ou `lint`. Aucun script n’a été
inventé.

## Build

Aucun build n’a été exécuté.

- `build:postgresql` cible la production et est interdit ;
- le build SQLite ne valide pas l’intégration recette Supabase Storage ;
- l’upload, la persistance, la lecture et la compensation ont été validés
  directement avec le provider et le client Prisma recette.

## Scan de secrets

Le scan des fichiers modifiés ou créés ne trouve :

- aucune vraie service role ;
- aucune URL PostgreSQL ;
- aucun mot de passe ou JWT ;
- aucun token ;
- aucune vraie anon key ;
- aucun contenu `.env` ;
- aucune URL signée ;
- aucun en-tête d’autorisation réel.

Les occurrences autorisées sont :

- noms de variables ;
- valeurs factices `example.invalid`, `test-only-secret`, `fake` ;
- code historique de création d’URL signée dans le provider, non appelé par
  cette phase ;
- expressions de masquage des URLs et en-têtes dans le script.

## Tests réels

- probe recette principal : réussi ;
- persistance AssetFile temporaire : réussie ;
- lecture serveur et intégrité : réussies ;
- compensation réelle : réussie ;
- nettoyage : réussi ;
- vérification indépendante après nettoyage : réussie.

## Risques résiduels

- l’interface continue d’interpréter `filePath` comme URL et ne peut donc pas
  encore afficher un objet SUPABASE privé ;
- le provider SUPABASE ne doit pas être activé globalement avant 10D-E ;
- les signed URLs devront rester des valeurs de lecture éphémères ;
- un échec simultané Prisma/compensation reste un cas de réconciliation
  manuelle, malgré la journalisation structurée ;
- le probe utilise un AssetUnit temporaire lié à des références recette
  existantes, sans les modifier.

## Prérequis pour la Phase 10D-E

1. revue humaine du diff 10D-D ;
2. conserver LOCAL comme provider global par défaut ;
3. conserver le bucket privé ;
4. créer un mécanisme serveur d’accès à partir de
   `storageProvider/storageBucket/storageKey` ;
5. générer une URL signée uniquement à la demande et de courte durée, ou
   utiliser une route proxy contrôlée ;
6. ne jamais persister l’URL résolue ;
7. projeter un DTO client distinct de la ligne AssetFile brute ;
8. tester exclusivement sur recette avant toute préparation production.

## Confirmations finales

- upload réel recette validé ;
- compensation réelle validée ;
- nettoyage complet ;
- aucune donnée métier persistante ;
- aucune migration ;
- aucune écriture production ou SQLite ;
- aucun objet Storage résiduel ;
- aucune URL signée réelle générée ;
- aucune policy modifiée ;
- aucun secret exposé ;
- aucun build ;
- aucun commit, push ou tag ;
- Phase 10D-E non commencée.
