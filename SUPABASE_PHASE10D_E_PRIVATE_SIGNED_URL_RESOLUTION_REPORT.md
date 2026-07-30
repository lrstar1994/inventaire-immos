# Phase 10D-E — Résolution privée et URLs signées temporaires

## Conclusion

**Phase 10D-E réussie avec build omis de façon justifiée**

La résolution LOCAL et SUPABASE est validée. Une URL signée réelle de cinq
minutes a permis de lire un PNG synthétique depuis le bucket privé, sans
service role dans la requête de lecture. L’URL n’a été ni journalisée ni
persistée. L’objet exact et le fichier temporaire ont été supprimés, la recette
reste à 253 lignes métier, 13 `asset_units` et 0 `asset_files`, et le bucket est
revenu vide.

## État Git initial

- HEAD : `6d859bcfe5696fed5532dd4030bfcbdcea724f85`
- dernier commit : `feat: validate supabase asset upload on recipe`
- aucun fichier suivi modifié au prévol ;
- seuls les rapports post-commit et historiques connus étaient non suivis.

## Audit des usages de `filePath`

Les usages applicatifs directs restent volontairement inchangés :

| Fichier | Contexte | Usage actuel | Adaptation réservée à 10D-F |
|---|---|---|---|
| `app/parc/asset-park.js` | composant client | miniatures et photo sélectionnée via `<img src={filePath}>` | recevoir une URL d’accès résolue côté serveur |
| `app/parc/[id]/asset-unit-detail.js` | composant client | photo principale et galerie via `<img src={filePath}>` | utiliser un DTO d’accès temporaire |
| `app/parc/[id]/asset-unit-detail.js` | composant client | document via `<a href={filePath}>` | utiliser une URL signée ou une route serveur |
| routes et pages d’unités | serveur | sérialisent encore les lignes `AssetFile` brutes | projeter un DTO sans exposer le client privilégié |

Le comportement LOCAL actuel reste compatible. Pour SUPABASE, `filePath`
demeure une clé stable et ne doit pas être présentée directement au navigateur.
Aucun composant React, aucune route métier et aucune interface n’ont été
modifiés dans cette phase.

## Architecture du résolveur

Nouveau module :

- `lib/storage/asset-file-access.js`

Fonction unique :

- `resolveAssetFileAccess(assetFile, options)`

Entrée minimale :

- `id`
- `storageProvider`
- `storageBucket`
- `storageKey`
- `filePath`

Résultat mémoire :

- LOCAL : `{ provider: "LOCAL", url: filePath, expiresAt: null }`
- SUPABASE :
  `{ provider: "SUPABASE", url: signedUrl, expiresAt: Date }`

Le résolveur réutilise :

- `resolveAssetFileStorage()` pour la compatibilité et la validation ;
- la factory Storage existante ;
- `SupabaseStorageProvider.createSignedDownloadUrl()` ;
- le client administrateur server-only déjà validé.

Il ne crée aucune abstraction Storage parallèle et ne retourne ni client,
configuration, header ni service role.

## Fichiers créés et modifiés

### Créés

- `lib/storage/asset-file-access.js`
- `scripts/test-supabase-recipe-signed-url.mjs`
- `SUPABASE_PHASE10D_E_PRIVATE_SIGNED_URL_RESOLUTION_REPORT.md`

### Modifiés

- `lib/storage/config.js`
  - TTL signé centralisé et borné ;
- `lib/storage/asset-storage-metadata.js`
  - validation stricte de `filePath = storageKey` et refus des backslashes pour
    SUPABASE ;
- `lib/storage/supabase-storage-provider.js`
  - exposition contrôlée du nom de bucket ;
  - conversion sûre d’une erreur réseau de signature ;
- `scripts/test-file-storage-abstraction.mjs`
  - dix tests unitaires Phase 10D-E.

Aucun fichier UI, Prisma, migration, package, `.env`, base, dump, sauvegarde,
policy, Auth ou JPEG n’a été modifié.

## Comportement LOCAL

### Anciennes lignes

Une ligne avec provider, bucket et key null, mais un `filePath` sous
`/uploads/assets/`, est résolue en LOCAL :

- URL inchangée ;
- `expiresAt = null` ;
- aucune initialisation Supabase.

### Nouvelles lignes

Une ligne `LOCAL` avec bucket null, clé relative et `filePath` cohérent est
résolue de la même manière, sans appel Storage.

Sont refusés :

- chemin vide ;
- chemin absolu ;
- `..` ;
- protocole HTTP(S) externe ;
- `javascript:` ;
- `data:` ;
- chemin ne respectant pas la racine publique locale historique.

## Comportement SUPABASE

Une ligne SUPABASE doit fournir :

- bucket non vide ;
- bucket exactement égal au bucket configuré ;
- clé relative normalisée ;
- aucun slash initial ;
- aucun `..` ;
- aucun backslash ;
- aucun protocole ;
- aucune query string ;
- aucun fragment ;
- `filePath` strictement égal à `storageKey`.

Le résolveur initialise alors paresseusement le provider SUPABASE, vérifie le
bucket, signe exactement la clé validée et retourne l’URL uniquement en mémoire.
Il n’utilise jamais `getPublicUrl()`.

## TTL et expiration

- valeur par défaut : 300 secondes ;
- minimum : 60 secondes ;
- maximum : 3 600 secondes ;
- valeur entière uniquement ;
- variable serveur facultative :
  `SUPABASE_STORAGE_SIGNED_URL_TTL_SECONDS` ;
- aucune modification de `.env` ;
- aucune durée fournie par le navigateur ;
- aucune durée ou date persistée dans `AssetFile`.

Les valeurs vides utilisent le défaut. Les valeurs non entières ou hors bornes
sont refusées par `StorageConfigurationError`, sans ajustement silencieux.

Le résolveur calcule `expiresAt` à partir de l’instant serveur et du TTL
effectivement transmis. Aucun cache global d’URL signée n’a été ajouté.

## Séparation serveur/client

- le résolveur importe `server-only` ;
- le provider et le client administrateur restent eux aussi server-only ;
- une garde runtime refuse un environnement avec `window` avant toute
  initialisation de provider ;
- le nouveau module n’est importé par aucun composant `"use client"` ;
- il n’est réexporté par aucun barrel universel ;
- son seul appelant réel est le probe serveur dédié ;
- les tests utilisent une injection de provider ;
- la service role n’est jamais lue lors d’une résolution LOCAL.

## Gestion des erreurs

Les erreurs contrôlées couvrent :

- structure AssetFile invalide ;
- provider inconnu ;
- chemin LOCAL invalide ;
- métadonnées SUPABASE incomplètes ;
- bucket incohérent ;
- clé invalide ;
- configuration Supabase absente ;
- provider ou bucket de résolution indisponible ;
- objet introuvable ;
- refus HTTP de signature ;
- erreur réseau de signature ;
- réponse signée invalide.

Aucune erreur ne reprend une URL signée, une réponse brute, un header
d’administration, un JWT, une chaîne PostgreSQL ou une configuration complète.

## Absence de persistance

Les tests utilisent une entrée `AssetFile` gelée et confirment :

- `filePath` inchangé ;
- `storageKey` inchangé ;
- aucune propriété `expiresAt` ajoutée ;
- aucune opération Prisma ;
- URL présente uniquement dans le résultat mémoire.

Le probe réel n’a créé :

- aucune ligne `AssetFile` ;
- aucune `AssetUnit` ;
- aucune transaction PostgreSQL d’écriture.

## Tests unitaires

Commande :

`npm.cmd run test:storage`

Résultat final :

- tests historiques : 60/60 ;
- nouveaux tests Phase 10D-E : 10/10 ;
- total : 70/70 ;
- échec : 0.

Les nouveaux tests couvrent :

1. TTL par défaut et bornes ;
2. ancienne ligne LOCAL ;
3. nouvelle ligne LOCAL ;
4. chemins LOCAL dangereux ;
5. signature SUPABASE avec bucket, clé et TTL exacts ;
6. métadonnées SUPABASE dangereuses ou incohérentes ;
7. bucket différent ;
8. erreur de signature sans secret ;
9. garde navigateur ;
10. absence de persistance.

Tous les clients Supabase des tests unitaires sont simulés. Aucun réseau réel,
aucune base protégée, aucun fichier historique et aucune vraie clé ne sont
utilisés.

## Validation réelle recette

Script dédié :

- `scripts/test-supabase-recipe-signed-url.mjs`

Garde-fous avant écriture :

- production ciblée en lecture seule sur `immos` : 12/0 ;
- recette ciblée en lecture seule sur `immos_recipe_phase8` :
  253 lignes métier, 13/0, 0 FK orpheline ;
- port direct 5432 et SSL requis ;
- bucket exactement `asset-files` ;
- bucket privé ;
- bucket initialement vide.

### Première tentative contrôlée

Un fichier texte synthétique a été refusé par Storage avec HTTP 400, avant
création d’objet, de manière cohérente avec les restrictions MIME du bucket.
La vérification indépendante immédiate a confirmé 0 objet. Aucun retry aveugle
n’a été effectué : le probe a été corrigé pour utiliser le type PNG déjà
autorisé et validé par l’infrastructure.

### Validation réussie

Objet synthétique :

- nom : `phase10d-e-signed-url-test.png`
- type : `image/png`
- taille : 68 octets
- SHA-256 :
  `431ced6916a2a21a156e38701afe55bbd7f88969fbbfc56d7fe099d47f265460`
- clé unique sous `diagnostics/phase10d-e/` ;
- fichier temporaire hors `public/uploads/assets`.

Résultats :

- upload réel réussi ;
- URL signée réelle générée côté serveur avec TTL 300 secondes ;
- URL jamais affichée ni journalisée ;
- lecture de l’URL sans service role : HTTP 200 ;
- MIME : `image/png` ;
- taille : 68 octets ;
- SHA-256 conforme ;
- égalité exacte des octets ;
- `filePath` et `storageKey` inchangés ;
- aucune persistance.

## Nettoyage

Le probe a supprimé uniquement :

- la clé Storage exacte créée pendant l’exécution ;
- son fichier temporaire local exact ;
- son répertoire temporaire exact.

Le bloc `finally` conservait la clé unique pour un nettoyage ciblé en cas
d’échec. Aucune suppression par préfixe ou dossier n’a été utilisée.

Après succès :

- absence de l’objet confirmée par inventaire borné ;
- bucket privé et vide ;
- aucun répertoire temporaire `phase10d-e-signed-url-*` ;
- aucune ligne PostgreSQL créée ;
- aucune AssetUnit temporaire.

## États protégés finaux

### SQLite

- SHA-256 :
  `8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec`
- aucune écriture ni migration.

### Production — `immos`

- `asset_units = 12`
- `asset_files = 0`
- FK orphelines = 0
- historique Prisma inchangé :
  `00000000000000_baseline`, terminée et non annulée.

### Recette — `immos_recipe_phase8`

- total métier = 253
- `asset_units = 13`
- `asset_files = 0`
- FK orphelines = 0
- historique Prisma inchangé :
  - `00000000000001_recipe_baseline`
  - `20260729120000_add_asset_file_storage_metadata`

### Supabase Storage

- bucket `asset-files` privé ;
- 0 objet ;
- aucun objet de test résiduel ;
- aucune policy modifiée.

### JPEG historiques

Les trois JPEG restent inchangés :

- 2 405 379 octets —
  `4ea6fafc0e1dfec5b1763203715f20c00b2b84720c8ff9158a47a06c440fad4a`
- 2 107 645 octets —
  `ff1a9c1a9ccf30932426389687755d2065074eacaa56948451e03903dac3bd83`
- 1 501 619 octets —
  `d360445ca40c9e7c6afc77bc7d97a2c30c9f58b766cfb5de50db422bd5d393ec`

## Scan de secrets

Le scan des fichiers modifiés et créés ne trouve aucune valeur réelle :

- service role ;
- URL PostgreSQL ;
- mot de passe ;
- JWT ou token ;
- clé anon ;
- contenu `.env` ;
- URL signée ;
- paramètre de signature ;
- header secret.

Les occurrences dans les tests sont exclusivement des noms de variables et
des valeurs factices explicites comme `example.invalid` et
`test-only-secret`.

## Contrôles statiques et build

`node --check` réussit pour :

- `lib/storage/config.js`
- `lib/storage/asset-storage-metadata.js`
- `lib/storage/supabase-storage-provider.js`
- `lib/storage/asset-file-access.js`
- `scripts/test-file-storage-abstraction.mjs`
- `scripts/test-supabase-recipe-signed-url.mjs`

`git diff --check` est conforme.

Le projet ne fournit aucun script `typecheck` ou `lint`. Aucun script n’a été
inventé.

Aucun build n’a été exécuté :

- `build:postgresql` cible la production et est interdit ;
- un build SQLite ne valide pas la signature privée recette ;
- les tests mockés, la syntaxe et la validation réelle couvrent directement le
  changement.

## Usages à adapter en Phase 10D-F

1. projeter les fichiers dans un DTO serveur avec URL d’accès ;
2. ne plus sérialiser `filePath` comme URL universelle ;
3. adapter miniatures, galerie et liens documentaires ;
4. définir le renouvellement après expiration ;
5. contrôler les droits avant chaque résolution ;
6. ne jamais envoyer les métadonnées privilégiées ou le client Storage au
   navigateur ;
7. conserver le comportement LOCAL sans initialisation Supabase.

## Risques résiduels

- l’UI ne consomme pas encore le résolveur et ne peut pas afficher un objet
  SUPABASE privé ;
- une URL signée transmise au navigateur reste un bearer temporaire et doit
  avoir une diffusion limitée ;
- le contrôle d’autorisation métier doit précéder la résolution dans 10D-F ;
- l’expiration exige une stratégie de renouvellement côté lecture ;
- la service role reste très privilégiée et le graphe d’import server-only doit
  être surveillé ;
- le bucket refuse `text/plain`, ce qui doit rester pris en compte par les
  probes futurs.

## Prérequis exacts pour Phase 10D-F

- revue humaine du présent diff ;
- conserver le TTL serveur de 300 secondes par défaut ;
- conserver le bucket privé ;
- définir les routes et DTO autorisés à appeler le résolveur ;
- intégrer un contrôle de droits avant signature ;
- adapter l’UI sans persister les URLs ;
- tester LOCAL et SUPABASE sur recette ;
- maintenir production, SQLite et fichiers historiques hors écriture.

## Confirmations finales

- résolution LOCAL validée ;
- résolution SUPABASE validée ;
- URL signée réelle validée ;
- accès réel au fichier validé ;
- URL non persistée et non journalisée ;
- bucket revenu vide ;
- recette revenue à 253/13/0 ;
- production inchangée ;
- SQLite inchangé ;
- JPEG inchangés ;
- aucun secret exposé ;
- aucun commit, push ou tag ;
- Phase 10D-F non commencée.
