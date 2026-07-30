# Phase 10D-G-B — Service interne d’éligibilité et de purge différée contrôlée

## Conclusion

**Phase 10D-G-B réussie avec build omis de façon justifiée**

## État Git

- HEAD initial et final : `cffee3983ae8f84d02ae667571eb46cb5a7e7737`
- commit de départ : `feat: integrate private asset access in ui`
- prévol : aucun fichier suivi modifié
- seuls les rapports historiques non suivis déjà autorisés étaient présents
- aucun commit, push ou tag créé

## Décisions validées appliquées

- suppression utilisateur existante inchangée et toujours logique via `deletedAt`
- rétention centralisée à 30 jours
- `DRY_RUN` obligatoire par défaut
- `EXECUTE` explicitement requis pour tout effet
- ordre : revalidation, références partagées, binaire exact, ligne Prisma
- toute autre ligne référençant le même binaire bloque la purge
- binaire confirmé absent traité comme déjà supprimé
- trois JPEG historiques protégés par liste exacte centralisée
- aucune intégration UI, route, server action, cron ou worker

## Fichiers créés

- `lib/storage/asset-file-deletion-plan.js`
- `scripts/test-asset-file-deletion-plan.mjs`
- `SUPABASE_PHASE10D_G_B_INTERNAL_DEFERRED_PURGE_SERVICE_REPORT.md`

Aucun fichier existant, schéma Prisma, migration, package, configuration, composant, route ou flux métier n’a été modifié.

## Architecture et API interne

Le module `asset-file-deletion-plan.js` commence par `import "server-only"` et n’est exporté par aucun barrel universel. Aucun fichier client, écran ou route ne l’importe.

API principale :

```js
processDeferredAssetFilePurge(
  { assetFileId, mode = "DRY_RUN" },
  dependenciesInjecteesPourTests
)
```

L’entrée publique refuse tout champ autre que `assetFileId` et `mode`. Elle n’accepte donc jamais un provider, bucket, `storageKey`, `filePath`, chemin, URL, durée ou booléen `force` fourni par un appelant.

Modes :

- `DRY_RUN`
- `EXECUTE`

Les dépendances Prisma, horloge, opérations LOCAL et provider SUPABASE sont injectables pour les tests, mais ne sont reliées à aucune interface applicative.

## Résultat normalisé

Le résultat sérialisable contient uniquement :

- `assetFileId`
- `mode`
- `eligible`
- `status`
- `provider`
- `deletedAt`
- `retentionDeadline`
- `sharedReferenceCount`
- `binaryState`
- `databaseState`
- `actionTaken`

Il ne contient aucun secret, client SDK, URL signée, URL PostgreSQL, chemin absolu ou clé Storage complète destinée à un client.

Les statuts couverts incluent :

- `eligible`
- `not_deleted`
- `retention_not_elapsed`
- `asset_file_not_found`
- `invalid_provider`
- `invalid_metadata`
- `protected_historical_file`
- `shared_reference_detected`
- `dry_run_complete`
- `binary_deleted`
- `binary_already_missing`
- `database_row_deleted`
- `purge_complete`
- `binary_delete_failed`
- `database_delete_failed`

## Éligibilité et rétention

La durée est définie une seule fois :

- `ASSET_FILE_RETENTION_DAYS = 30`
- éligible si `deletedAt + 30 jours <= now`

L’horloge est injectable. Sont refusés :

- ligne absente
- `deletedAt` nul
- date invalide
- rétention non écoulée
- ligne restaurée avant revalidation
- provider inconnu
- métadonnées incohérentes
- fichier historique protégé
- référence partagée

## DRY_RUN

Le mode par défaut :

- charge la ligne depuis Prisma par ID
- calcule la rétention
- valide les métadonnées
- détecte les protections et références partagées
- inspecte seulement la sûreté d’une cible LOCAL
- n’initialise pas Supabase
- n’appelle aucune suppression filesystem ou Storage
- n’exécute aucun `delete`, `update` ou autre écriture Prisma
- retourne `dry_run_complete` et `actionTaken = none` si l’élément est éligible

## EXECUTE et revalidation

Avant l’effet irréversible, le service :

1. recharge la ligne depuis Prisma ;
2. recalcule l’éligibilité ;
3. vérifie de nouveau `deletedAt` et la rétention ;
4. compare provider, bucket, clé, `filePath`, `updatedAt` et `deletedAt` avec l’état initial ;
5. recompte les références partagées ;
6. supprime le binaire exact ou confirme son absence ;
7. supprime la ligne avec un `deleteMany` restrictif portant sur l’ensemble des données sensibles relues ;
8. exige exactement une ligne supprimée.

Une restauration ou modification détectée avant l’effet bloque la purge.

## Provider LOCAL

Les anciennes lignes sans métadonnées et les nouvelles lignes `LOCAL` sont résolues avec les règles existantes.

Protections appliquées :

- clé relative normalisée
- chemins absolus et traversées refusés
- protocoles et URL refusés par la cohérence `filePath`
- cible obligatoirement sous `public/uploads/assets`
- contrôle du chemin réel
- lien symbolique refusé
- répertoire refusé
- aucune suppression récursive
- aucun nettoyage de dossier parent
- `ENOENT` traité comme `binary_already_missing`

Les tests filesystem utilisent exclusivement des dossiers temporaires hors du dépôt et hors de `public/uploads/assets`.

## Protection des JPEG historiques

Une liste centralisée contient les trois chemins relatifs exacts et leurs SHA-256 confirmés. Une correspondance exacte retourne `protected_historical_file` avant tout appel filesystem.

Empreintes finales :

- `4ea6fafc0e1dfec5b1763203715f20c00b2b84720c8ff9158a47a06c440fad4a`
- `ff1a9c1a9ccf30932426389687755d2065074eacaa56948451e03903dac3bd83`
- `d360445ca40c9e7c6afc77bc7d97a2c30c9f58b766cfb5de50db422bd5d393ec`

## Provider SUPABASE

Le service exige :

- provider explicite `SUPABASE`
- bucket non vide et identique au bucket serveur configuré
- clé relative normalisée
- absence de slash initial, backslash, `..`, protocole, URL, query string et fragment
- `filePath` cohérent avec `storageKey`

En `DRY_RUN`, aucun client privilégié n’est construit.

En `EXECUTE`, le provider server-only existant est initialisé paresseusement et reçoit une seule clé exacte. Aucun préfixe, `getPublicUrl` ou URL signée n’est utilisé.

Le booléen de `deleteObject` est interprété strictement :

- `true` : `binary_deleted`
- `false` : absence confirmée, `binary_already_missing`
- erreur réseau, autorisation, bucket, serveur ou réponse ambiguë : `binary_delete_failed`, sans suppression Prisma

## Références partagées

Les autres lignes sont comparées indépendamment de leur état :

- LOCAL : même chemin local normalisé
- SUPABASE : même couple exact bucket + clé

La ligne courante seule est exclue. Toute correspondance retourne `shared_reference_detected` avec le nombre de références, sans exposer leurs métadonnées.

## Erreurs et idempotence

- ligne déjà absente : résultat contrôlé, aucun effet binaire
- binaire déjà absent : suppression Prisma autorisée
- seconde demande après purge : `asset_file_not_found`, sans second appel binaire
- erreur filesystem ou Storage : cause conservée côté serveur, message normalisé, Prisma non appelé
- erreur Prisma après suppression binaire : cause Prisma conservée ; la ligne reste présente et une tentative future pourra terminer la purge après constat du binaire absent
- suppression Prisma conditionnelle à zéro ligne : `database_delete_failed`
- aucune tentative de recréation du binaire ni suppression d’un autre objet

## Concurrence et limites restantes

La double lecture, la double vérification des références et la condition Prisma restrictive réduisent les courses. Sans verrou distribué, transaction externe commune à PostgreSQL et Storage, version optimiste dédiée ou outbox, une modification peut encore intervenir entre la suppression binaire et le `deleteMany`. Dans ce cas, la ligne est conservée et l’erreur est explicite ; le service ne tente pas de reconstruire le binaire.

Deux exécutions parfaitement simultanées peuvent toutes deux atteindre la primitive binaire. Elles utilisent toutefois uniquement l’identité relue de la même ligne ; la suppression est idempotente et aucune clé fournie par un client n’est acceptée. Une seule suppression Prisma conditionnelle peut réussir.

La Phase 10D-G-C devra valider le comportement réel sur des données synthétiques après revue humaine, sans connecter ce service à une interface.

## Tests

### Tests historiques

Commande :

```text
npm run test:storage
```

Résultat :

- 75 tests
- 75 réussis
- 0 échec
- 0 ignoré

### Nouveaux tests 10D-G-B

Commande :

```text
node --test scripts/test-asset-file-deletion-plan.mjs
```

Résultat final :

- 44 tests
- 44 réussis
- 0 échec
- 0 ignoré

Couverture :

- éligibilité et frontière exacte des 30 jours
- DRY_RUN sans effet
- anciennes et nouvelles lignes LOCAL
- chemins dangereux, répertoires et liens symboliques
- trois JPEG protégés
- références partagées LOCAL et SUPABASE
- métadonnées SUPABASE dangereuses
- suppression exacte mockée
- objet absent confirmé
- erreurs filesystem, SDK et Prisma
- restauration et modification concurrentes
- suppression Prisma conditionnelle
- idempotence et seconde demande

Total : **119/119 tests réussis**.

Aucun test n’a utilisé de réseau réel, de base protégée, de vrai objet Storage, de `public/uploads/assets` réel ou de JPEG historique.

## Contrôles statiques et sécurité

- syntaxe Node des deux fichiers : valide
- `git diff --check` : réussi
- graphe d’import : aucun import depuis l’UI, une route, un fichier client ou un barrel partagé
- module explicitement `server-only`
- scan de secrets des fichiers créés : 0 secret réel détecté ; une chaîne factice
  `token=x`, volontairement utilisée pour tester le rejet des query strings
- aucune URL signée, clé, JWT, mot de passe, chaîne PostgreSQL ou valeur `.env` ajoutée

## Build

Build omis de façon justifiée :

- `build:postgresql` cible la production et était interdit
- aucun build LOCAL strictement nécessaire n’est documenté pour ce service interne
- les contrôles syntaxiques et 119 tests ciblent directement les changements

## États protégés finaux

### SQLite

- fichier : `prisma/dev.db`
- SHA-256 : `8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec`
- taille : 507 904 octets
- aucune écriture

### Production PostgreSQL — `immos`

Contrôle distant en lecture seule via le pooler configuré :

- schéma actif : `immos`
- `asset_units = 12`
- `asset_files = 0`
- aucune écriture ni migration

### Recette PostgreSQL — `immos_recipe_phase8`

Contrôle distant en lecture seule via le pooler configuré :

- schéma actif : `immos_recipe_phase8`
- total métier = 253
- `asset_units = 13`
- `asset_files = 0`
- FK orphelines = 0
- aucune écriture ni migration

Le port PostgreSQL direct 5432 était indisponible pendant le contrôle final. Le pooler configuré a permis de confirmer les états attendus, sans réessayer aucune commande d’écriture.

### Supabase Storage

Contrôle réseau en lecture seule :

- bucket `asset-files`
- privé
- 0 objet
- aucun upload
- aucun appel `remove` réel
- aucune policy modifiée

### JPEG historiques

- trois fichiers présents
- empreintes inchangées
- aucun fichier ouvert en écriture
- aucun test exécuté contre ces fichiers

## Confirmations finales

- aucune purge réelle
- aucun upload réel
- aucun objet Storage créé
- aucun appel Storage `remove` réel
- aucune ligne réelle supprimée
- aucune base modifiée
- aucune migration
- aucune policy modifiée
- aucun changement Auth
- aucune intégration UI
- aucune route, server action, cron ou worker créé
- aucun commit
- aucun push
- aucun tag
- Phase 10D-G-C non commencée
