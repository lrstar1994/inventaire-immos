# Phase 10D-C — Client serveur Supabase Storage et validation stricte de configuration

## Conclusion

**Phase 10D-C réussie avec build omis de façon justifiée**

La configuration privilégiée Supabase Storage est désormais isolée dans un module
`server-only`, validée avant toute création de client, et consommée par un client
HTTP serveur paresseux et injectable. Aucun upload, téléchargement, delete ou
création d’URL signée réel n’a été exécuté.

## État Git initial

- HEAD : `3867520016b9a18edd6f4f7e19e767f83789627c`
- dernier commit : `feat: stabilize local asset storage metadata`
- aucun fichier suivi modifié au prévol ;
- seuls les rapports historiques déjà connus étaient non suivis.

## Audit du client Supabase existant

Le projet ne dépend pas de `@supabase/supabase-js`. Le provider existant
`lib/storage/supabase-storage-provider.js` utilise l’API HTTP Supabase Storage
avec `fetch` et était déjà marqué `server-only`.

Avant 10D-C :

- la sélection du provider utilisait `APP_FILE_STORAGE_PROVIDER` ;
- LOCAL était la valeur par défaut ;
- la configuration Supabase était chargée paresseusement par le provider ;
- `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` et
  `SUPABASE_STORAGE_BUCKET` étaient lus dans `lib/storage/config.js` ;
- la clé privilégiée servait aux en-têtes `apikey` et `Authorization` ;
- aucune utilisation de `getPublicUrl()` n’existait ;
- le provider pouvait créer des URL signées de cinq minutes, mais aucune méthode
  réelle de ce type n’a été appelée dans cette phase.

Les scripts historiques de diagnostic utilisent également ces variables, mais
ils ne sont pas importés par l’application. Aucun composant portant
`"use client"` n’importe le provider, le client administrateur ou sa
configuration.

## Architecture retenue

L’architecture existante a été étendue, sans SDK ni abstraction parallèle :

1. `lib/storage/config.js` conserve uniquement la sélection universelle du
   provider et la durée d’URL signée ;
2. `lib/storage/supabase-storage-server-config.js`, marqué `server-only`,
   centralise et valide les variables privilégiées ;
3. `lib/storage/supabase-storage-admin-client.js`, également `server-only`,
   construit le client HTTP administrateur ;
4. `lib/storage/supabase-storage-provider.js` délègue désormais la construction
   des URL, des en-têtes et les appels HTTP à ce client.

Le client est créé à la première utilisation SUPABASE. La factory mémorise une
instance par provider serveur. Ce choix évite les créations répétées tout en
permettant d’injecter une factory ou un client isolé dans chaque test.

Le projet n’utilisant pas le SDK Supabase, il n’existe aucune session à
persister, rafraîchir ou détecter dans l’URL. Le client HTTP n’implémente donc
aucun mécanisme de session.

## Fichiers créés et modifiés

### Créés

- `lib/storage/supabase-storage-server-config.js`
  - lecture serveur des trois variables ;
  - validation stricte sans journalisation des valeurs.
- `lib/storage/supabase-storage-admin-client.js`
  - garde d’environnement serveur ;
  - création paresseuse ;
  - construction centralisée des URL et en-têtes privés ;
  - injection de `fetch`, de l’environnement et du runtime pour les tests.
- `SUPABASE_PHASE10D_C_SERVER_STORAGE_CLIENT_AND_CONFIG_REPORT.md`

### Modifiés

- `lib/storage/config.js`
  - retrait de la lecture de la service role du module partageable.
- `lib/storage/supabase-storage-provider.js`
  - délégation au client administrateur ;
  - signatures publiques préservées ;
  - contrat Storage préservé.
- `scripts/test-file-storage-abstraction.mjs`
  - ajout de dix tests 10D-C.

Ni UI, ni schéma Prisma, ni migration, ni package, ni fichier `.env` n’a été
modifié.

## Variables attendues

Les noms suivants sont utilisés, sans valeur enregistrée dans le dépôt :

- `APP_FILE_STORAGE_PROVIDER`
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_STORAGE_BUCKET`

`NEXT_PUBLIC_SUPABASE_URL` reste le nom historique de l’URL publique du projet.
La service role demeure exclusivement dans le module serveur et n’utilise
aucune variable `NEXT_PUBLIC_*`.

## Validation de configuration

Pour une sélection explicite SUPABASE :

- les trois variables sont obligatoires ;
- les espaces périphériques sont supprimés ;
- l’URL doit être une URL HTTP ou HTTPS valide ;
- une URL contenant des identifiants est refusée ;
- la clé service role vide est refusée ;
- le bucket vide est refusé ;
- un slash initial, tout séparateur `/` ou `\`, `..` et les caractères hors de
  la convention du bucket sont refusés ;
- aucun bucket implicite n’est choisi ;
- les erreurs nomment la variable ou la catégorie invalide, jamais sa valeur.

## Sélection LOCAL/SUPABASE

- variable absente : LOCAL ;
- valeur `local` : LOCAL, sans validation ni initialisation Supabase ;
- valeur `supabase` : création paresseuse du client et validation complète ;
- valeur inconnue : `StorageConfigurationError` ;
- configuration SUPABASE incomplète : erreur contrôlée, sans fallback LOCAL.

Le choix du stockage reste indépendant du backend de données.

## Protection serveur et prévention des imports client

- les deux nouveaux modules commencent par `import "server-only"` ;
- le provider Supabase reste marqué `server-only` ;
- une garde runtime refuse explicitement un environnement possédant `window` ;
- les modules privilégiés ne sont pas réexportés par
  `lib/storage/index.js` ;
- aucun fichier `"use client"` ne les importe ;
- `SUPABASE_SERVICE_ROLE_KEY` n’apparaît ni dans le provider, ni dans le barrel
  partagé, ni dans une variable publique ;
- aucune clé ou configuration complète n’est retournée dans une réponse ou un
  message d’erreur.

## Client HTTP administrateur

Le client expose seulement des primitives internes :

- nom du bucket validé ;
- URL du projet normalisée ;
- construction d’une URL objet ;
- construction de l’URL d’inventaire ;
- en-têtes `apikey` et `Authorization` ;
- exécution par un `fetch` injecté.

L’initialisation ne déclenche aucune requête. Le provider conserve les
comportements existants, dont le `filePath` SUPABASE stable égal à la
`storageKey`, sans URL publique, signée ou temporaire persistée.

## Injection de test

Les tests peuvent injecter :

- un environnement factice ;
- un runtime serveur ou navigateur simulé ;
- un `fetch` factice ;
- une factory de client ;
- un client administrateur complet factice.

Cette injection reste limitée aux constructeurs serveur et n’est exportée par
aucune API navigateur.

## Tests

Commande effective :

`npm.cmd run test:storage`

La première invocation par `npm` n’a chargé aucun test : PowerShell a bloqué
`npm.ps1` avant l’exécution. L’exécutable Windows direct a donc exécuté la suite
une seule fois.

Résultats :

- tests historiques 10D-B : 45/45 réussis ;
- nouveaux tests 10D-C : 10/10 réussis ;
- total : 55/55 réussis ;
- échec : 0 ;
- aucun appel réseau Supabase ;
- aucune base utilisée ;
- aucun fichier écrit dans `public/uploads/assets` ;
- uniquement un dossier temporaire LOCAL, supprimé par le test existant ;
- aucune vraie clé : seulement des valeurs factices `example.invalid` et
  `test-service-role`.

Les nouveaux tests couvrent :

- normalisation d’une configuration valide ;
- absence individuelle de chaque variable ;
- URL invalide ;
- bucket dangereux ;
- refus du navigateur ;
- factory paresseuse et instance réutilisée ;
- construction des en-têtes et URL avec client simulé ;
- absence d’appel si la configuration est invalide ;
- provider SUPABASE avec client injecté ;
- absence d’export vers un barrel partagé/client.

## Vérifications statiques

`node --check` a réussi pour :

- `lib/storage/config.js`
- `lib/storage/supabase-storage-server-config.js`
- `lib/storage/supabase-storage-admin-client.js`
- `lib/storage/supabase-storage-provider.js`
- `scripts/test-file-storage-abstraction.mjs`

`git diff --check` est conforme.

Le projet ne définit ni script `typecheck`, ni script `lint`. Aucun script
inventé, aucun `prisma generate`, aucune migration et aucune installation de
dépendance n’ont été exécutés.

## Build

Aucun build n’a été exécuté.

- `build:postgresql` cible la production et est explicitement interdit ;
- un build SQLite n’est pas nécessaire pour valider les modules HTTP serveur et
  aurait élargi la portée au-delà des validations déjà suffisantes ;
- l’omission est conforme aux règles de la phase.

## Vérifications protégées finales

### SQLite

- SHA-256 :
  `8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec`
- aucune migration ni écriture.

### PostgreSQL production — `immos`

- `asset_units = 12`
- `asset_files = 0`
- aucune écriture effectuée.

### PostgreSQL recette — `immos_recipe_phase8`

- total métier = 253
- `asset_units = 13`
- `asset_files = 0`
- FK orphelines = 0
- baseline recette terminée ;
- migration AssetFile terminée ;
- historique inchangé.

Une première lecture distante a été bloquée par le sandbox (`P1001`) avant
connexion. Après autorisation réseau, une première requête diagnostique a
échoué en lecture seule avec `42703` à cause du nom Prisma utilisé à la place du
nom SQL mappé de la FK. La requête corrigée a confirmé tous les états ci-dessus.
Aucune écriture n’était présente dans ces diagnostics.

### Supabase Storage

- bucket `asset-files` ;
- privé (`public = false`) ;
- inventaire racine vide ;
- aucun objet créé, lu, téléchargé, supprimé ou modifié par le code testé ;
- aucune URL signée réelle ;
- aucune policy modifiée.

La vérification finale du bucket a été strictement en lecture seule.

### JPEG historiques

Les trois fichiers sont inchangés :

- 2 405 379 octets —
  `4ea6fafc0e1dfec5b1763203715f20c00b2b84720c8ff9158a47a06c440fad4a`
- 2 107 645 octets —
  `ff1a9c1a9ccf30932426389687755d2065074eacaa56948451e03903dac3bd83`
- 1 501 619 octets —
  `d360445ca40c9e7c6afc77bc7d97a2c30c9f58b766cfb5de50db422bd5d393ec`

## Risques résiduels

- le provider conserve ses méthodes réelles upload/read/delete/sign pour
  compatibilité, mais elles restent désactivées tant que LOCAL est sélectionné ;
- la valeur historique `NEXT_PUBLIC_SUPABASE_URL` est publique par convention ;
  elle ne doit jamais être confondue avec la service role ;
- la garde runtime complète le mécanisme Next.js `server-only`, mais la
  séparation d’imports devra rester vérifiée lors des futures routes ;
- aucune vérification du contenu d’un JWT service role n’est faite : la présence
  est validée sans décoder ni journaliser le secret ;
- l’atomicité Storage/PostgreSQL restera compensatoire en Phase 10D-D.

## Prérequis exacts pour la Phase 10D-D

1. revue humaine du présent diff ;
2. conserver le bucket `asset-files` privé ;
3. cibler exclusivement PostgreSQL recette ;
4. sélectionner explicitement SUPABASE dans un environnement serveur contrôlé ;
5. confirmer les trois variables serveur sans afficher leurs valeurs ;
6. injecter ou utiliser le client serveur centralisé uniquement ;
7. effectuer un premier upload technique contrôlé avec compensation ;
8. vérifier l’objet, la ligne AssetFile et le nettoyage ;
9. ne modifier ni UI, ni production, ni SQLite ;
10. traiter les URL signées dans une phase séparée.

## État de phase

- aucune base modifiée ;
- aucun objet Storage créé ;
- aucune policy modifiée ;
- aucune dépendance installée ;
- aucun build ou serveur démarré ;
- aucun commit, push ou tag ;
- Phase 10D-D non commencée.
