# Phase 10D-G-C1 — Détection fiable des objets SUPABASE déjà absents

## Conclusion

**Phase 10D-G-C1 réussie avec build omis de façon justifiée**

## État Git

- HEAD initial et final : `cffee3983ae8f84d02ae667571eb46cb5a7e7737`
- message : `feat: integrate private asset access in ui`
- aucun commit, push ou tag
- aucune intégration UI, route, server action, cron ou worker

## Anomalie réelle et cause racine

La Phase 10D-G-C avait supprimé manuellement un objet synthétique, puis demandé
au service de purger la ligne encore présente. Le second DELETE Storage a reçu
HTTP 400. La primitive `deleteObject` ne reconnaissait que HTTP 404 comme
absence et avait donc produit `binary_delete_failed`.

Structure non sensible observée :

- erreur du service : `AssetFilePurgeError`
- statut normalisé : `binary_delete_failed`
- cause serveur : `StorageProviderError`
- statut applicatif de la cause : 502
- statut HTTP Storage mentionné : 400
- aucune donnée machine stable n’était exposée par `deleteObject`
- aucun token, header, corps sensible ou configuration dans l’erreur

HTTP 400 n’est pas suffisamment spécifique : il peut également représenter une
requête invalide, un bucket incorrect ou une autre erreur Storage. La correction
ne traite donc jamais HTTP 400 comme une preuve d’absence.

## Stratégie de vérification exacte

Le service réutilise désormais `SupabaseStorageProvider.isObjectListed`, qui :

1. normalise la clé ;
2. sépare le dossier parent et le nom final ;
3. liste uniquement le dossier parent ;
4. pagine jusqu’à trouver le nom exact ou atteindre la fin ;
5. compare le nom avec égalité stricte ;
6. exige un identifiant d’objet non vide ;
7. ne confond plus une entrée de dossier homonyme (`id = null`) avec un fichier.

Le nouveau helper interne :

```text
checkSupabaseObjectExistence(provider, storageKey)
```

retourne uniquement :

- `exists`
- `missing`
- `unknown`

Il est server-only par son module parent, injectable, sans journalisation et
sans exposition client.

## Algorithme avant et après remove

### Contrôle initial

- `missing` : ne pas appeler DELETE ; état `binary_already_missing`
- `exists` : appeler DELETE une seule fois sur la clé exacte
- `unknown` : tenter DELETE, puis rester conservateur en cas d’erreur

### DELETE réussi

- retour `true` : `binary_deleted`
- retour historique `false` : `binary_already_missing`

### DELETE en erreur

Une seconde vérification exacte est exécutée :

- `missing` : `binary_already_missing`, suppression Prisma autorisée
- `exists` : `binary_delete_failed`, suppression Prisma interdite
- `unknown` : `binary_delete_failed`, suppression Prisma interdite

Le statut HTTP de l’erreur DELETE n’est jamais utilisé seul pour conclure.

## Gestion des courses

Les cas suivants sont couverts :

- objet supprimé entre contrôle initial et DELETE : vérification secondaire
- objet absent avant DELETE : aucun DELETE inutile
- DELETE en erreur après suppression effective : absence secondaire reconnue
- objet encore présent après erreur : Prisma bloqué
- inventaire indisponible avant DELETE : DELETE peut être tenté
- inventaire indisponible après erreur : état inconnu, Prisma bloqué

La fenêtre entre vérification et DELETE reste intrinsèque à deux systèmes sans
transaction distribuée. La règle de sûreté demeure : la ligne Prisma n’est
supprimée que si le binaire a été supprimé ou si son absence exacte est
confirmée.

## Fichiers modifiés

- `lib/storage/asset-file-deletion-plan.js`
  - helper d’existence normalisé
  - contrôle avant DELETE
  - contrôle secondaire après erreur
- `lib/storage/supabase-storage-provider.js`
  - distinction fichier/dossier lors du listing exact
- `scripts/test-asset-file-deletion-plan.mjs`
  - sept tests correctifs
- `scripts/test-file-storage-abstraction.mjs`
  - fixtures de listing munies d’identifiants d’objet
  - test explicite du dossier homonyme
- `SUPABASE_PHASE10D_G_C1_MISSING_OBJECT_DETECTION_FIX_AND_REAL_VALIDATION_REPORT.md`

Aucun schéma, migration, package, configuration, fichier LOCAL, composant ou
flux de suppression logique n’a été modifié.

## Tests correctifs

Sept nouveaux tests couvrent :

1. absence confirmée avant DELETE, sans appel DELETE ;
2. présence puis suppression exacte réussie ;
3. HTTP 400 puis absence secondaire confirmée ;
4. HTTP 400 avec objet encore présent ;
5. HTTP 400 avec vérification secondaire inconnue ;
6. vérification initiale inconnue puis DELETE réussi ;
7. erreur réseau et vérification secondaire inconnue.

Les tests historiques du provider couvrent en complément :

- même préfixe avec autre nom ;
- extension voisine ;
- dossier homonyme ;
- clé racine ;
- clé imbriquée ;
- pagination ;
- réponses d’inventaire 400, 401, 403 et invalides ;
- absence HTTP 400 confirmée par la primitive de lecture.

## Résultats des tests

### Suite historique Storage

- 75 tests
- 75 réussis
- 0 échec
- 0 ignoré

### Service de purge

- 44 tests 10D-G-B conservés
- 7 tests correctifs 10D-G-C1
- 51 réussis
- 0 échec
- 0 ignoré

Total final : **126/126 tests réussis**.

Aucun test unitaire n’a utilisé le réseau, une base protégée, un objet Storage
réel, SQLite ou les JPEG historiques.

## Revalidation réelle recette

Préconditions confirmées :

- production : 12 AssetUnit, 0 AssetFile
- recette : 253 lignes métier, 13 AssetUnit, 0 AssetFile
- FK orphelines : 0
- bucket `asset-files` privé et vide
- SQLite inchangé

Scénario :

1. création d’un PNG synthétique sous une clé UUID unique ;
2. création d’une ligne AssetFile synthétique SUPABASE, éligible depuis 31
   jours ;
3. suppression manuelle exacte de l’objet ;
4. confirmation de son absence ;
5. exécution du service sur l’ID synthétique.

Résultat :

- `status = purge_complete`
- `binaryState = binary_already_missing`
- `databaseState = database_row_deleted`
- zéro second appel DELETE par le service
- ligne synthétique supprimée
- objet toujours absent
- aucune autre ligne modifiée
- bucket toujours vide

Une AssetUnit recette existante a uniquement servi de parent relationnel sans
être modifiée. Aucun AssetUnit temporaire n’était nécessaire.

Le script temporaire de validation a été supprimé après exécution.

## Nettoyage

Le bloc `finally` ciblait exclusivement :

- l’ID AssetFile UUID synthétique ;
- la clé Storage UUID synthétique.

État final confirmé :

- aucune ligne synthétique restante
- aucun objet synthétique restant
- recette revenue à 253/13/0
- FK orphelines = 0
- bucket privé et vide

## Contrôles statiques

- syntaxe Node des quatre fichiers concernés : valide
- `git diff --check` : réussi
- scan des imports : service présent uniquement dans le module server-only
- aucun import depuis `app`, un composant client ou un barrel universel
- aucun script typecheck dédié disponible
- aucun script lint dédié disponible

## Build

Build omis de façon justifiée :

- `build:postgresql` cible la production et était interdit
- aucun build sûr supplémentaire n’apporte de validation au cas Storage ciblé
- 126 tests et une revalidation réelle recette couvrent la correction

## Scan de secrets

- aucune service role réelle
- aucune anon key réelle
- aucun JWT ou token
- aucun header Authorization
- aucune URL PostgreSQL
- aucune URL signée
- aucun contenu `.env`
- aucune valeur sensible ajoutée aux erreurs, tests ou rapport

## États protégés finaux

### SQLite

- SHA-256 :
  `8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec`
- aucune écriture

### Production — `immos`

- `asset_units = 12`
- `asset_files = 0`
- aucune écriture

### Recette — `immos_recipe_phase8`

- total métier = 253
- `asset_units = 13`
- `asset_files = 0`
- FK orphelines = 0
- aucune fixture restante

### Storage

- bucket `asset-files`
- privé
- vide
- aucune policy modifiée

### JPEG historiques

Présents et inchangés :

- `4ea6fafc0e1dfec5b1763203715f20c00b2b84720c8ff9158a47a06c440fad4a`
- `ff1a9c1a9ccf30932426389687755d2065074eacaa56948451e03903dac3bd83`
- `d360445ca40c9e7c6afc77bc7d97a2c30c9f58b766cfb5de50db422bd5d393ec`

## Confirmations finales

- HTTP 400 jamais globalement assimilé à une absence
- absence confirmée par listing exact réussi
- objet encore présent jamais classé `binary_already_missing`
- état inconnu bloquant pour Prisma après erreur DELETE
- aucune intégration UI
- aucune route, server action, cron ou worker
- aucune migration
- aucune policy modifiée
- aucun changement Auth
- aucun objet synthétique restant
- aucune ligne synthétique restante
- aucun commit
- aucun push
- aucun tag
- Phase 10D-G-D non commencée
