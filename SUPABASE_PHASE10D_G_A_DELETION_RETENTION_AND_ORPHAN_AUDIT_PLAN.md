# Phase 10D-G-A — Audit du cycle de suppression, rétention et nettoyage Storage

## Conclusion

**Phase 10D-G-A terminée avec décisions humaines obligatoires avant implémentation**

L’application possède une suppression logique cohérente, mais aucune
restauration métier ni notion de purge. La suppression physique ne doit pas
être reliée à l’interface dans l’état actuel, notamment parce que
`getRequestUser()` choisit un utilisateur `DIRECTION` actif lorsqu’aucun
`x-user-id` n’est fourni. La stratégie recommandée est : suppression logique,
rétention décidée humainement, puis nettoyage différé idempotent, d’abord
interne et non exposé.

## État Git

- HEAD initial :
  `cffee3983ae8f84d02ae667571eb46cb5a7e7737`
- HEAD final :
  `cffee3983ae8f84d02ae667571eb46cb5a7e7737`
- message :
  `feat: integrate private asset access in ui`
- aucun fichier applicatif modifié ;
- seul le présent rapport est créé ;
- rapports historiques non suivis conservés ;
- aucun commit, push ou tag.

## Sources auditées

### Rapports

- `SUPABASE_PHASE10D_A_STORAGE_FLOW_AUDIT_AND_IMPLEMENTATION_PLAN.md`
- `SUPABASE_PHASE10D_B_LOCAL_STORAGE_METADATA_AND_COMPENSATION_REPORT.md`
- `SUPABASE_PHASE10D_C_SERVER_STORAGE_CLIENT_AND_CONFIG_REPORT.md`
- `SUPABASE_PHASE10D_D_REAL_RECIPE_UPLOAD_AND_COMPENSATION_REPORT.md`
- `SUPABASE_PHASE10D_E_PRIVATE_SIGNED_URL_RESOLUTION_REPORT.md`
- `SUPABASE_PHASE10D_F_UI_PRIVATE_ASSET_ACCESS_INTEGRATION_REPORT.md`
- `SUPABASE_PHASE10D_F_FINAL_COMMIT_REPORT.md`

### Code et schémas

- trois schémas Prisma : SQLite, PostgreSQL production et recette ;
- `lib/asset-file-service.js`
- `lib/storage/asset-storage-metadata.js`
- `lib/storage/storage-key.js`
- `lib/storage/local-file-storage-provider.js`
- `lib/storage/supabase-storage-provider.js`
- `lib/storage/types.js`
- `lib/request-user.js`
- `lib/roles.js`
- `lib/audit.js`
- routes et composants AssetFile/AssetUnit ;
- migrations initiales et migration Storage ;
- scripts d’audit et probes Storage.

## Réponses synthétiques aux quinze questions

1. La suppression actuelle renseigne `deletedAt`, force `isPrimary = false`,
   écrit `ASSET_FILE_DELETED`, puis masque la ligne des lectures normales.
2. Il s’agit d’une suppression logique ; ni ligne ni binaire ne sont supprimés.
3. Seul `deletedAt` indique la suppression. Il n’existe ni `isDeleted`,
   `status`, `archivedAt`, `purgedAt` ni état de purge.
4. Une restauration est techniquement possible par remise à null de
   `deletedAt`, mais aucune route, fonction métier ni règle de restauration
   n’existe.
5. Une ligne AssetFile ne référence qu’une AssetUnit obligatoire. Il n’existe
   pas de table de liaison vers plusieurs entités.
6. Plusieurs lignes peuvent référencer le même objet : aucune unicité sur
   `filePath`, `storageKey` ou `(storageProvider, storageBucket, storageKey)`.
7. La suppression physique n’est sûre qu’après rétention, validation stricte
   des métadonnées, preuve qu’aucune autre ligne ne référence le binaire,
   contrôle d’autorisation et ciblage d’un objet exact.
8. Si Prisma a déjà enregistré la suppression logique et Storage échoue,
   conserver le tombstone et retenter ultérieurement ; ne pas restaurer
   silencieusement la visibilité.
9. Si Storage réussit mais l’écriture d’audit/état Prisma échoue, la ligne
   désigne un binaire absent. Le retry doit traiter l’absence comme idempotente
   et réconcilier l’état, sans supprimer autre chose.
10. Vérifier toutes les lignes, actives et supprimées, partageant la référence ;
    refuser en cas de pluralité ou d’incohérence.
11. Inventorier le bucket puis joindre exactement bucket+key aux lignes
    SUPABASE ; l’outil reste en lecture seule par défaut.
12. Pour chaque ligne, valider les métadonnées puis tester l’existence exacte
    via le provider approprié.
13. La suppression logique immédiate avec rétention avant purge est compatible.
    La durée exige une décision humaine.
14. Protéger explicitement leurs trois SHA-256 et chemins ; ce sont des objets
    locaux orphelins connus, jamais candidats à une purge automatique.
15. Toute suppression physique déclenchée par navigateur, endpoint public ou
    tâche utilisant l’identité implicite doit rester désactivée avant Auth.

## Modèle de données

### AssetFile

- clé primaire : `id`, CUID ;
- relation obligatoire : `assetUnitId → AssetUnit.id` ;
- `onDelete: Restrict` ;
- PostgreSQL : FK `ON UPDATE CASCADE` dans la baseline ;
- champs fichier : `fileType`, `fileLabel`, `fileName`, `filePath`,
  `mimeType`, `fileSize`, `isPrimary`, `notes` ;
- métadonnées : `storageProvider?`, `storageBucket?`, `storageKey?` ;
- audit temporel : `createdAt`, `updatedAt`, `deletedAt?` ;
- créateur : `createdById?`, sans relation Prisma AssetFile dédiée ;
- index sur AssetUnit, type, primaire, deletedAt, provider, key et tuple
  provider/bucket/key.

Il n’existe aucune contrainte unique sur le binaire. PostgreSQL possède un
index unique partiel garantissant une seule photo principale active par
AssetUnit et une contrainte imposant qu’une primaire soit une image.

### AssetUnit

AssetUnit possède une liste `assetFiles`. La FK restrictive empêche une
suppression physique de l’AssetUnit tant que des lignes AssetFile existent.
Cependant, la route DELETE AssetUnit ne supprime pas la ligne : elle renseigne
`AssetUnit.deletedAt`. Elle ne modifie ni ses AssetFile ni leurs binaires.

### Restauration

Le modèle permet de remettre `deletedAt` à null, mais il manque :

- contrôle de présence et d’intégrité du binaire ;
- règle si l’AssetUnit est elle-même supprimée ;
- réactivation éventuelle de `isPrimary` ;
- audit `ASSET_FILE_RESTORED` ;
- autorisation métier ;
- distinction entre « supprimé mais restaurable » et « binaire purgé ».

## Sémantique actuelle de suppression

### Photo ou pièce jointe

`DELETE /api/asset-files/:id` :

1. obtient un acteur ;
2. exige `DIRECTION` ou `INVENTORY_MANAGER` ;
3. cherche une ligne active par ID ;
4. met `deletedAt` à l’heure courante et `isPrimary` à false ;
5. écrit un audit séparé `ASSET_FILE_DELETED` ;
6. retourne la ligne ;
7. l’UI recharge les données et affiche « Fichier supprimé logiquement. ».

La mise à jour et l’audit ne sont pas dans une transaction unique. Aucun appel
à `deleteObject()`, `unlink()` ou `prisma.assetFile.delete()` n’est réalisé par
ce flux.

### AssetUnit parente

La route DELETE AssetUnit renseigne uniquement `AssetUnit.deletedAt`, avec
audit `ASSET_UNIT_DISABLED`. Les AssetFile restent inchangés et la FK est
restrictive. Aucune cascade binaire ou ligne n’existe.

### Entités liées

AssetFile n’est relié qu’à AssetUnit. Les documents et mouvements ont leurs
propres relations ; ils ne partagent pas directement une ligne AssetFile.

## Références partagées

### Ce que le code rend peu probable

- les nouveaux noms LOCAL contiennent UUID et code bien ;
- les clés SUPABASE contiennent AssetUnit ID et file ID UUID ;
- l’upload utilise anti-écrasement ;
- le nom original n’est pas utilisé seul comme clé.

### Ce que le modèle autorise

- doublon exact de `filePath` ;
- doublon de `storageKey` ;
- doublon de bucket+key ;
- plusieurs lignes vers le même fichier LOCAL ;
- noms originaux identiques ;
- imports ou écritures manuelles contournant la génération normale.

Aucun hash n’est persisté dans AssetFile. Une suppression physique ne peut donc
jamais déduire l’exclusivité depuis une seule ligne ; une requête globale de
références est obligatoire.

## Audit LOCAL

### Protections réutilisables

- `normalizeStorageKey()` refuse vide, segment vide, `.`, `..`, caractère non
  autorisé et chemin absolu Windows/POSIX ;
- `resolvePath()` reconstruit depuis une racine serveur contrôlée ;
- `path.relative()` confirme que la cible reste sous cette racine ;
- `unlink()` ne supprime qu’un fichier ;
- ENOENT retourne `false`, ce qui permet une opération idempotente ;
- aucun répertoire n’est supprimé.

### Protections à ajouter avant purge

- refuser les lignes legacy sans `storageKey` pour toute purge automatique ;
- pour legacy, exiger une procédure manuelle ou une résolution contrôlée depuis
  `filePath`, sans faire confiance à une valeur client ;
- utiliser `lstat`/`realpath` pour refuser une cible ou un parent symbolique
  sortant de la racine ;
- vérifier toutes les références DB au même chemin/clé ;
- comparer chemin exact, taille et éventuellement hash avant suppression ;
- ne jamais nettoyer automatiquement un répertoire vide dans la première
  implémentation ;
- traiter Windows sans casse de manière canonique pour les comparaisons ;
- conserver une deny-list des trois chemins et une allow-list de SHA-256.

### Trois JPEG historiques

Ils ne disposent pas de ligne AssetFile validée et sont connus comme orphelins
volontaires. Un outil générique « Storage vers DB » les classera donc
orphelins, mais doit les marquer `protected_known_orphan`, jamais
`deletion_candidate`.

## Audit SUPABASE

`SupabaseStorageProvider.deleteObject(key)` :

- normalise la clé ;
- cible le bucket configuré et un objet exact ;
- utilise une requête DELETE unique ;
- ne supprime pas par préfixe ;
- retourne false sur 404 ;
- normalise 401/403, autres HTTP et erreurs réseau ;
- n’effectue aucun second DELETE automatique.

La méthode est utilisée par :

- la compensation après échec Prisma d’un upload ;
- les tests unitaires ;
- les probes réels de recette et leur `finally` ;
- les nettoyages strictement ciblés de tests.

Elle n’est pas reliée à la suppression utilisateur.

Avant une purge métier il faut en plus :

- exiger `storageProvider = SUPABASE` ;
- exiger le bucket configuré exact ;
- refuser backslash, protocole, query string et fragment ;
- recompter toutes les lignes partageant bucket+key ;
- ne jamais accepter bucket/key depuis le navigateur ;
- relire la ligne par ID dans le contexte métier ;
- journaliser sans URL, header ni service role ;
- borner les retries et distinguer « absent » de « refus de lecture ».

## Comparaison de l’ordre des opérations

### A — Storage puis Prisma

Avantage :

- aucune ligne purgée tant que la suppression distante n’a pas réussi.

Risque :

- Storage peut réussir puis Prisma/audit échouer ;
- une ligne reste restaurable en apparence mais le binaire est perdu ;
- rollback du binaire généralement impossible sans sauvegarde.

Verdict : déconseillé comme suppression utilisateur directe.

### B — Prisma puis Storage

Avantage :

- l’intention métier est durable avant l’effet externe ;
- l’échec Storage laisse un objet orphelin récupérable par retry.

Risque :

- si la ligne est physiquement supprimée, les métadonnées nécessaires au retry
  disparaissent ;
- un objet orphelin peut persister.

Verdict : acceptable uniquement si Prisma conserve un tombstone contenant les
métadonnées, pas avec `assetFile.delete()`.

### C — Suppression logique puis nettoyage différé

Étapes :

1. suppression logique transactionnelle et audit ;
2. délai de rétention ;
3. sélection interne de tombstones éligibles ;
4. validation des références et du binaire exact ;
5. suppression physique idempotente ;
6. enregistrement du résultat de purge ;
7. retry borné ou intervention.

Avantages :

- restauration avant purge ;
- échec Storage sans perte de l’intention métier ;
- audit et retry possibles ;
- séparation nette entre UI et service privilégié.

Risques :

- le modèle actuel ne distingue pas purgé/manquant/en attente ;
- nécessite décision de rétention et probablement évolution de modèle.

Verdict : stratégie recommandée.

### D — Outbox transactionnelle

Bénéfices :

- intention de purge atomique avec la DB ;
- worker idempotent, retries et observabilité.

Coûts :

- nouvelle table, migration, worker et politique opérationnelle ;
- complexité disproportionnée tant que le volume et les exigences ne sont pas
  confirmés.

Verdict : meilleure cible robuste si purge automatique/volumique, décision
humaine avant migration.

## Recommandation transactionnelle

À court terme :

- conserver `deleteAssetFile()` comme suppression logique ;
- rendre cette opération transactionnelle avec l’audit lors d’une phase
  métier ultérieure ;
- ne jamais supprimer la ligne AssetFile ;
- ajouter un service interne de prévisualisation de purge, `dryRun` par défaut ;
- sélectionner uniquement des lignes `deletedAt != null` plus anciennes que le
  seuil retenu ;
- verrouiller/revalider la ligne juste avant l’appel externe ;
- conserver les métadonnées après suppression physique ;
- traiter objet absent comme succès idempotent, mais l’indiquer distinctement.

Pour distinguer purge réussie, binaire déjà manquant et retry, une décision est
requise entre :

1. nouveaux champs `purgeStatus`, `purgedAt`, `purgeAttempts`,
   `lastPurgeErrorType` ;
2. table outbox/purge dédiée ;
3. audit log seul, moins interrogeable et moins sûr.

Le rapport recommande l’option 1 pour faible volume, ou l’outbox si le
nettoyage devient automatisé et critique.

## Compensation et retry

### Prisma logique réussi, Storage échoué

- laisser la ligne supprimée logiquement ;
- conserver le binaire inaccessible depuis les lectures normales ;
- enregistrer une erreur normalisée ;
- retry exponentiel borné ;
- après seuil, intervention humaine ;
- ne jamais remettre `deletedAt` à null automatiquement.

### Storage réussi, état Prisma échoué

- ne pas tenter de recréer un binaire ;
- au retry, vérifier l’absence exacte ;
- enregistrer la purge comme réconciliée/idempotente ;
- signaler que la restauration n’est plus possible sans sauvegarde.

### Storage absent avant purge

- ne jamais choisir une autre clé ;
- classer `already_missing` ;
- décision humaine : considérer comme purge réussie ou anomalie à investiguer.

## Rétention et restauration

### Option minimale

- suppression logique sans purge automatique ;
- restauration manuelle encadrée ;
- audit périodique des orphelins.

### Option recommandée

- rétention configurable ;
- restauration autorisée avant `purgedAt` ;
- purge différée interne ;
- tombstone conservé après purge ;
- audit complet et retry borné.

### Durées à soumettre

- 7 jours : faible fenêtre, risque élevé d’erreur irréversible ;
- 30 jours : compromis opérationnel courant ;
- 90 jours : meilleure restauration, coût Storage supérieur.

Aucune obligation légale ou métier n’est documentée. Le rapport ne fixe donc
pas la durée.

Une restauration doit :

- refuser une AssetUnit supprimée ou retirée sans décision explicite ;
- vérifier que le binaire existe et correspond aux métadonnées ;
- remettre `deletedAt` à null dans une transaction ;
- laisser `isPrimary = false` par défaut ;
- écrire `ASSET_FILE_RESTORED`.

Après purge, restauration impossible sans sauvegarde.

## Détection d’orphelins

Le futur outil doit être server-only, lecture seule par défaut, pagination
bornée, rapport déterministe et aucune action implicite.

### Base → SUPABASE

Pour chaque ligne SUPABASE :

- valider provider/bucket/key/filePath ;
- vérifier l’objet exact ;
- classer `present`, `missing`, `invalid_metadata`, `access_error` ;
- séparer lignes actives et supprimées.

### SUPABASE → base

Pour chaque objet paginé :

- rechercher le tuple exact provider+bucket+key ;
- classer `one_active_reference`, `deleted_references_only`,
  `multiple_references`, `orphan`, `invalid_key` ;
- ne jamais supprimer automatiquement.

### Base → LOCAL

Pour chaque ligne LOCAL :

- valider le chemin ;
- refuser legacy ambigu et symlink dangereux ;
- vérifier existence, type fichier, taille et éventuellement hash ;
- classer `present`, `missing`, `dangerous`, `protected`.

### LOCAL → base

L’audit existant `audit-sqlite-migration.mjs` sait déjà comparer fichiers
disque et `filePath`. Il doit être adapté au contrat provider/key, au mode
strictement read-only et à la liste des trois orphelins protégés.

## Autorisation et sécurité

### Rôles actuels

`DIRECTION` et `INVENTORY_MANAGER` peuvent supprimer logiquement. Maintenance
peut uploader certains fichiers mais pas les supprimer.

### Limite critique

`getRequestUser()` retourne le premier utilisateur DIRECTION actif si
`x-user-id` est absent. Ce comportement de développement rend toute
suppression physique exposée par route vulnérable à une invocation sans
authentification forte.

Doivent rester interdits avant Auth/autorisation renforcée :

- bouton ou endpoint de purge physique ;
- nettoyage déclenchable par navigateur ;
- endpoint acceptant bucket ou key ;
- restauration ou purge par ID sans contrôle de rattachement ;
- tâche distante utilisant une identité implicite ;
- suppression automatique d’orphelins.

Risques IDOR :

- la route actuelle accepte un ID AssetFile ;
- elle vérifie le rôle, mais pas un périmètre organisationnel ;
- aucun Supabase Auth n’atteste actuellement l’identité.

## Journalisation sûre

Peuvent être journalisés :

- AssetFile ID ;
- provider ;
- opération et statut ;
- horodatage ;
- nombre de tentative ;
- type d’erreur normalisé ;
- identifiant de tâche/audit.

À masquer ou exclure :

- service role, JWT, token, Authorization ;
- URL signée et URL PostgreSQL ;
- contenu du fichier ;
- chemin local absolu ;
- réponse SDK brute.

La clé complète facilite le diagnostic mais peut révéler AssetUnit/file IDs.
Recommandation : journaliser un hash SHA-256 de bucket+key et uniquement les
derniers caractères de la clé ; conserver la clé complète dans le tombstone,
pas dans les logs généraux.

## Idempotence

- ligne déjà supprimée logiquement : succès idempotent ou 404 métier stable,
  sans modifier `deletedAt` ;
- objet Storage absent : `already_missing`, aucune autre suppression ;
- fichier LOCAL absent : même règle ;
- double requête : une seule transition d’état via condition `deletedAt`/statut ;
- retry après compensation : vérifier la clé exacte et accepter l’absence ;
- ne jamais dériver une clé de remplacement ;
- ne jamais supprimer par préfixe.

## Concurrence

### Deux suppressions

Utiliser une mise à jour conditionnelle ou un verrou transactionnel. Une seule
demande crée l’intention ; l’autre reçoit l’état idempotent.

### Suppression pendant upload

Un nouvel AssetFile n’est visible qu’après persistance. La compensation couvre
l’échec d’upload/persistance. Le purgeur ne sélectionne que les tombstones
anciens, donc pas un upload courant.

### Suppression pendant signature/lecture

Une URL déjà signée peut rester valide jusqu’à son TTL, mais la suppression de
l’objet rendra la lecture impossible. La rétention évite la purge immédiate ;
ce comportement doit être accepté métier.

### Restauration pendant nettoyage

Revalider `deletedAt` et le statut de purge sous transaction/verrou juste avant
l’effet Storage. Sans état intermédiaire, ce scénario n’est pas sûr.

### Suppression AssetUnit

La désactivation actuelle n’entraîne aucune purge. Conserver cette règle tant
qu’une décision humaine n’est pas prise.

Protections possibles :

- `updateMany` conditionnel ;
- champ de version ou état `PURGING` ;
- transaction avec `SELECT … FOR UPDATE` ;
- identifiant de tentative unique ;
- outbox avec clé d’idempotence.

## Matrice de tests 10D-G-B

### LOCAL

- fichier temporaire exact supprimé ;
- chemin `..` refusé ;
- absolu Windows/POSIX refusé ;
- symlink hors racine refusé ;
- fichier absent idempotent ;
- référence partagée refusée ;
- ancienne ligne legacy non purgée automatiquement ;
- trois JPEG protégés par chemin et hash ;
- échec Prisma avant intention ;
- échec filesystem après intention ;
- double demande ;
- aucun répertoire supprimé.

### SUPABASE mocké

- suppression d’une clé exacte ;
- bucket configuré exact ;
- remove appelé une fois ;
- 404 idempotent ;
- erreurs 401/403/5xx/réseau normalisées ;
- bucket incohérent refusé ;
- clé vide, absolue, `..`, backslash, URL, query et fragment refusés ;
- référence partagée refusée ;
- double demande ;
- aucune suppression par préfixe ;
- aucun secret dans les logs.

### Recette réelle

- garde `immos_recipe_phase8` et refus de `immos` ;
- objet et ligne synthétiques uniquement ;
- suppression logique ;
- attente simulée ou seuil de test explicite ;
- purge exacte ;
- retry objet absent ;
- tombstone/état final conforme ;
- nettoyage complet ;
- recette revenue à 253/13/0 ;
- bucket vide ;
- production inchangée.

### UI future

- confirmation explicite ;
- succès logique distinct de purge physique ;
- erreur contrôlée ;
- déjà supprimé ;
- restauration avant purge ;
- aucune bucket/key/filePath interne dans le client ;
- aucune action physique tant qu’Auth n’est pas activée.

## Découpage recommandé

### Phase 10D-G-B — Service interne et dry-run

Objectif :

- service server-only de validation et planification d’une suppression
  physique ;
- aucune route/UI ;
- dry-run par défaut ;
- détection de références partagées ;
- providers mockés uniquement.

Fichiers exacts proposés :

- création : `lib/storage/asset-file-deletion-plan.js`
- création : `scripts/test-asset-file-deletion-plan.mjs`
- création :
  `SUPABASE_PHASE10D_G_B_INTERNAL_DELETION_SERVICE_REPORT.md`

À ce stade, ne pas modifier `lib/asset-file-service.js`, les routes ou l’UI.

### Phase 10D-G-C — Modèle de purge et recette réelle

Après décisions humaines :

- migration éventuelle de statut/outbox ;
- implémentation d’un exécuteur interne ;
- tests réels recette avec objet synthétique ;
- retries/idempotence ;
- aucune UI.

### Phase 10D-G-D — Flux métier

Après Auth renforcée :

- rendre suppression logique et audit atomiques ;
- restauration selon politique validée ;
- intégrer éventuellement la planification, pas la purge synchrone ;
- confirmation UI.

### Phase 10D-G-E — Réconciliation

- outil read-only base↔Storage et base↔LOCAL ;
- export de rapport ;
- allow-list des JPEG ;
- mode nettoyage séparé, explicitement autorisé, avec dry-run préalable.

## Décisions humaines obligatoires

1. suppression physique immédiate ou différée — recommandation : différée ;
2. durée de rétention : 7, 30 ou 90 jours, ou autre ;
3. restauration autorisée et par quels rôles ;
4. traitement des fichiers d’une AssetUnit désactivée ;
5. objet déjà manquant : purge réussie ou incident ;
6. objet partagé : blocage permanent ou procédure de dissociation ;
7. politique de retry, seuil et alerte ;
8. nouveaux champs de purge ou table outbox ;
9. conservation indéfinie ou suppression finale des tombstones ;
10. activation uniquement après Supabase Auth — fortement recommandée ;
11. protection réglementaire ou durée légale des pièces jointes ;
12. portée organisationnelle des rôles.

## États protégés finaux

### Git

- HEAD inchangé :
  `cffee3983ae8f84d02ae667571eb46cb5a7e7737`
- aucun fichier applicatif modifié ;
- seul ce rapport est nouveau.

### SQLite

- SHA-256 :
  `8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec`
- aucune écriture.

### Production — `immos`

- `asset_units = 12`
- `asset_files = 0`
- aucune écriture.

### Recette — `immos_recipe_phase8`

- total métier = 253
- `asset_units = 13`
- `asset_files = 0`
- FK orphelines = 0
- aucune écriture ou fixture.

### Supabase Storage

- bucket `asset-files` privé ;
- 0 objet ;
- aucun appel remove, upload ou signature ;
- aucune policy modifiée.

### JPEG historiques

- 2 405 379 octets —
  `4ea6fafc0e1dfec5b1763203715f20c00b2b84720c8ff9158a47a06c440fad4a`
- 2 107 645 octets —
  `ff1a9c1a9ccf30932426389687755d2065074eacaa56948451e03903dac3bd83`
- 1 501 619 octets —
  `d360445ca40c9e7c6afc77bc7d97a2c30c9f58b766cfb5de50db422bd5d393ec`

## Confirmations finales

- aucune suppression réelle exécutée ;
- aucune ligne supprimée ou modifiée ;
- aucun fichier local supprimé ;
- aucun appel Storage remove ;
- aucun upload ni URL signée réelle ;
- aucune base modifiée ;
- aucun code, schéma, migration, package, configuration, policy ou Auth modifié ;
- aucun test ni build relancé ;
- aucun commit, push ou tag ;
- Phase 10D-G-B non commencée.
