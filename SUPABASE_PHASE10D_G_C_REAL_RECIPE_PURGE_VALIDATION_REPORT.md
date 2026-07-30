# Phase 10D-G-C — Validation réelle du service de purge différée

## Conclusion

**Phase 10D-G-C interrompue par une validation réelle**

La validation a démontré les scénarios DRY_RUN, EXECUTE, idempotence, référence
partagée et rétention. Elle a également identifié une incompatibilité réelle
sur le scénario `binary_already_missing` : après suppression confirmée de
l’objet synthétique, un second DELETE Supabase retourne HTTP 400 et non HTTP
404. La primitive `deleteObject` actuelle ne classe donc pas cette réponse
comme une absence confirmée et le service retourne `binary_delete_failed`.

Conformément à l’interdiction de modifier le service ou l’architecture pendant
cette phase, aucun correctif n’a été appliqué. Le nettoyage ciblé a supprimé la
ligne restante et tous les objets synthétiques.

## État Git

- HEAD initial : `cffee3983ae8f84d02ae667571eb46cb5a7e7737`
- HEAD final : `cffee3983ae8f84d02ae667571eb46cb5a7e7737`
- message : `feat: integrate private asset access in ui`
- aucun fichier suivi modifié
- service 10D-G-B inchangé
- aucun commit, push ou tag

## Garde-fous et environnement

La validation a utilisé :

- les clients Prisma générés production et recette
- le schéma production `immos` en lecture seule
- le schéma recette `immos_recipe_phase8`
- le bucket privé `asset-files`
- un PNG synthétique de 1 × 1 pixel
- des IDs et clés UUID uniques
- une AssetUnit recette existante comme parent, sans modification

Chaque ID et chaque clé synthétique a été mémorisé puis supprimé exactement
dans un bloc `finally`. Aucune suppression large ou par préfixe n’a été
effectuée.

Le pooler transactionnel ne stabilisant pas `current_schema()` entre requêtes,
les garde-fous effectifs ont utilisé :

- le paramètre `schema` explicite de chaque connexion Prisma
- des requêtes SQL brutes entièrement qualifiées pour les contrôles recette
- les comptes métier distinctifs 12/0 et 253/13/0

Les premières tentatives se sont arrêtées avant toute création :

1. prepared statements incompatibles avec le pooler ;
2. inventaire de tables dépendant du `search_path` ;
3. contrôle de FK utilisant initialement des noms non qualifiés ;
4. fichier texte refusé par le bucket avec HTTP 400.

Après chaque arrêt, les contrôles finaux ont confirmé recette 253/13/0 et
bucket vide. Le format a ensuite été limité au PNG synthétique déjà accepté
par l’infrastructure.

## Validation DRY_RUN

Une ligne `AssetFile` synthétique SUPABASE, marquée supprimée depuis 31 jours,
et son objet ont été créés en recette.

Résultat :

- `eligible = true`
- `status = dry_run_complete`
- compteur `remove = 0`
- objet toujours présent
- ligne toujours présente
- aucune suppression Prisma

Validation réussie.

## Validation EXECUTE

Sur la même ligne :

- `status = purge_complete`
- `binaryState = binary_deleted`
- `databaseState = database_row_deleted`
- exactement un appel de suppression Storage
- objet exact absent après exécution
- ligne exacte absente après exécution
- aucune autre ligne touchée
- aucun autre objet touché

Validation réussie.

## Validation d’idempotence

Une seconde exécution avec le même ID a retourné :

- `status = asset_file_not_found`
- aucun nouvel appel Storage
- aucune erreur fatale

Validation réussie.

## Validation des références partagées

Un objet synthétique et deux lignes `AssetFile` pointant vers le même couple
bucket + clé ont été créés.

Résultat :

- `status = shared_reference_detected`
- `sharedReferenceCount = 1`
- aucune suppression Storage
- deux lignes toujours présentes après l’appel
- objet toujours présent après l’appel

Les deux lignes et l’objet exact ont ensuite été supprimés par le nettoyage
ciblé.

Validation réussie.

## Validation de la rétention

Une ligne synthétique supprimée depuis 10 jours et son objet ont été créés.

Résultat :

- `status = retention_not_elapsed`
- aucune suppression Storage
- ligne conservée pendant le contrôle
- objet conservé pendant le contrôle

La ligne et l’objet ont ensuite été supprimés par le nettoyage ciblé.

Validation réussie.

## Validation `binary_already_missing`

Procédure :

1. création d’un objet synthétique ;
2. création d’une ligne éligible supprimée depuis 31 jours ;
3. suppression manuelle exacte de l’objet ;
4. exécution du service sur la ligne restante.

Résultat réel :

- Supabase a répondu HTTP 400 au DELETE de l’objet déjà absent
- le provider n’a pas classé cette réponse comme absence confirmée
- le service a retourné `binary_delete_failed`
- la suppression Prisma a été bloquée, comme prévu pour une erreur Storage
  non classée
- la ligne est restée présente jusqu’au nettoyage ciblé

Résultat attendu non obtenu :

- `binary_already_missing`
- suppression de la ligne

Cause isolée :

- `objectExists` sait déjà confirmer la signature HTTP 400 spécifique d’un
  objet absent
- `deleteObject` ne traite actuellement que HTTP 404 comme absence
- la validation réelle montre que l’API DELETE du projet renvoie HTTP 400 dans
  ce cas

Cette divergence nécessite une revue humaine et une phase corrective distincte
avant de reprendre G-C. Aucun changement n’a été apporté au service pendant
cette phase.

## Nettoyage

Le bloc final a supprimé exclusivement :

- les lignes synthétiques encore présentes
- les objets synthétiques encore présents

Le script temporaire de validation a ensuite été supprimé du workspace.

État confirmé après nettoyage :

- production : 12 AssetUnit, 0 AssetFile
- recette : 253 lignes métier, 13 AssetUnit, 0 AssetFile
- FK orphelines recette : 0
- bucket : privé, 0 objet

## Tests existants

### Tests Storage historiques

- commande : `npm run test:storage`
- 75 tests
- 75 réussis
- 0 échec
- 0 ignoré

### Tests du service 10D-G-B

- commande : `node --test scripts/test-asset-file-deletion-plan.mjs`
- 44 tests
- 44 réussis
- 0 échec
- 0 ignoré

Total : **119/119 tests réussis**.

Aucun nouveau test n’a été ajouté.

L’écart entre mocks et comportement réel est désormais établi : le mock
représentait l’absence par `deleteObject() => false`, tandis que le DELETE réel
renvoie une réponse HTTP 400 que la primitive transforme en erreur.

## Contrôles statiques

- syntaxe Node du service : valide
- syntaxe Node de sa suite : valide
- `git diff --check` : réussi
- aucun script `typecheck` dédié disponible dans `package.json`
- aucun script `lint` dédié disponible dans `package.json`
- aucune nouvelle commande inventée

## Build

Build omis de façon justifiée :

- `build:postgresql` cible la production et était interdit
- aucune modification fonctionnelle ou architecturale n’a été réalisée
- les 119 tests et contrôles syntaxiques ont été relancés

## Scan de secrets

- aucun secret ajouté
- aucune service role écrite dans un fichier
- aucune URL signée générée ou journalisée
- aucune URL PostgreSQL consignée
- aucun token, JWT, mot de passe ou header Authorization consigné
- le script temporaire chargeait uniquement les variables de processus via le
  mécanisme existant et a été supprimé

## États protégés finaux

### SQLite

- SHA-256 :
  `8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec`
- aucune écriture

### Production — `immos`

- `asset_units = 12`
- `asset_files = 0`
- lecture seule uniquement

### Recette — `immos_recipe_phase8`

- total métier = 253
- `asset_units = 13`
- `asset_files = 0`
- FK orphelines = 0
- aucune fixture synthétique restante

### Supabase Storage

- bucket `asset-files`
- privé
- vide
- aucun objet synthétique restant
- aucune policy modifiée

### JPEG historiques

Empreintes inchangées :

- `4ea6fafc0e1dfec5b1763203715f20c00b2b84720c8ff9158a47a06c440fad4a`
- `ff1a9c1a9ccf30932426389687755d2065074eacaa56948451e03903dac3bd83`
- `d360445ca40c9e7c6afc77bc7d97a2c30c9f58b766cfb5de50db422bd5d393ec`

## Confirmations

- aucun commit
- aucun push
- aucun tag
- aucune modification d’architecture
- aucune modification du service
- aucune modification UI
- aucune route, server action, cron ou worker
- aucune migration
- aucune modification SQLite
- aucune écriture production
- aucune fixture recette restante
- aucun objet Storage restant
- Phase 10D-G-D non commencée
