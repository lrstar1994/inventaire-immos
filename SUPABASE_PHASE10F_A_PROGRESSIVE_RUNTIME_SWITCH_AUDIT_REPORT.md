# Phase 10F-A — Audit de préparation à la bascule progressive du runtime

## Statut

**PHASE 10F-A AUDITÉE — AUCUNE BASCULE EFFECTUÉE**

L’architecture permet déjà de sélectionner explicitement SQLite, PostgreSQL
production ou PostgreSQL Recipe. La recette est exploitable et protégée.
Toutefois, la bascule production est actuellement interdite par un écart de
schéma confirmé : `asset_files` possède les métadonnées Storage dans Recipe,
mais pas dans SQLite protégée ni dans PostgreSQL production.

## État Git

- branche : `master` ;
- HEAD initial et final : `6244fdc` ;
- message :
  `feat(auth): secure Supabase authorization and recipe validation` ;
- aucun fichier suivi modifié au début de l’audit ;
- rapports historiques 10C/10D et rapport post-commit 10E-G volontairement
  non suivis ;
- seul nouveau fichier créé par 10F-A : le présent rapport ;
- aucun commit, push ou tag ;
- aucun amendement du commit `6244fdc`.

Fichiers ignorés importants confirmés :

- `.env` ;
- `.env.local` ;
- `.next/` ;
- `generated/` ;
- `prisma/dev.db`.

## Cartographie des runtimes

| Mode | Commande | Provider | Client généré | URL logique | Schéma | Prévol | Risque d’écriture |
|---|---|---|---|---|---|---|---|
| Défaut historique | `npm run dev`, `npm run build`, `npm run start` | valeur d’environnement, SQLite par défaut dans `lib/prisma.js` | `generated/prisma-lot6` si aucune surcharge | `DATABASE_URL` | aucun | validation du provider/client au chargement | faible si l’environnement n’est pas surchargé, mais les commandes génériques dépendent de l’environnement |
| SQLite explicite | `npm run dev:sqlite`, `npm run build:sqlite` | `sqlite` | `generated/prisma-lot6` | `DATABASE_URL` commençant par `file:` | aucun | sélection forcée par `run-next-with-database.mjs` | données locales si l’application est utilisée en écriture |
| PostgreSQL production | `npm run dev:postgresql`, `npm run build:postgresql` | `postgresql` | `generated/prisma-postgresql` | `SUPABASE_DATABASE_URL`, adaptée au pooler | `immos` | contrôle du protocole et de `schema=immos` par la factory | **élevé** : aucune baseline métier comparable au prévol Recipe avant démarrage |
| PostgreSQL Recipe | `npm run dev:postgresql:recipe` | `postgresql` | `generated/prisma-recipe` | dérivée de `SUPABASE_DIRECT_URL`, sans révéler sa valeur | `immos_recipe_phase8` | port 5432, SSL, client généré, schéma, séparation production/recette, baseline 253/222 et compteurs protégés | moyen en exécution, réduit par le prévol ; les mutations restent possibles après démarrage |

Variables principales :

- `APP_DATABASE_PROVIDER` ;
- `APP_PRISMA_CLIENT` ;
- `DATABASE_URL` ;
- `SUPABASE_DATABASE_URL` ;
- `SUPABASE_DIRECT_URL` ;
- `APP_DATABASE_RECIPE_PHASE8` ;
- `RECIPE_PREFLIGHT_DEVELOPMENT` ;
- `RECIPE_SKIP_PREFLIGHT`.

`RECIPE_SKIP_PREFLIGHT` est désactivé par défaut, limité au développement et ne
peut pas constituer une validation distante.

### Comportement par environnement

- le choix effectif est réalisé au démarrage, avant la création du singleton
  Prisma ;
- le cache global Prisma est séparé par provider et sélection de client ;
- Recipe enlève le comportement pooler du runtime et impose la session 5432 ;
- le client production ajoute `pgbouncer`, `connection_limit=1` et
  `pool_timeout=60` ;
- le build SQLite force le backend local ;
- le build PostgreSQL n’est pas un mécanisme d’activation production et ne
  possède pas le prévol métier Recipe ;
- aucune bascule dynamique à chaud n’existe, ce qui réduit les mélanges dans
  un même processus.

## Inventaire des accès aux données

### Pages serveur

Les pages `app/page.js`, `app/parc/**`, `app/documents/page.js`,
`app/mouvements/page.js` et `app/referentiels/page.js` effectuent des lectures
Prisma : compteurs, listes, relations, tris et filtres `deletedAt`.

Risque :

- portable via Prisma pour les trois clients ;
- les pages Parc chargent des relations `assetFiles` et exposent donc
  immédiatement l’écart de colonnes constaté sur SQLite/production ;
- les tris sont généralement explicites, mais toute logique sans `orderBy`
  doit rester considérée comme non déterministe entre moteurs.

### Routes API

Les routes privées couvrent :

- utilisateurs et rôles ;
- référentiels ;
- entrées et unités ;
- fichiers ;
- mouvements ;
- documents ;
- options et recherches de doublons.

Lectures :

- `findMany`, `findFirst`, `findUnique`, `count`.

Écritures :

- `create`, `createMany`, `update`, `updateMany` ;
- suppression métier principalement logique ;
- transactions pour validations de documents, entrées, fichiers et mouvements.

La route `api/health` exécute une requête brute de contrôle. Les autres routes
applicatives utilisent principalement Prisma.

### Services

- `asset-service.js` : création d’entrées et d’unités, détection de doublons,
  transaction ;
- `asset-file-service.js` : upload, métadonnées, transaction, compensation ;
- `movement-service.js` : mouvements, lignes, mises à jour d’unités et audit,
  trois zones transactionnelles ;
- `document-service.js` : documents, relations et audit, transaction ;
- `audit.js` : écritures d’audit ;
- `authorization.js` : lecture `User.externalAuthId` sur le backend métier
  actif ;
- `schema-guard.js` : SQL brut PostgreSQL de contrôle de schéma.

### Authentification et autorisation

Supabase Auth fournit l’identité, mais l’autorisation est lue dans la table
`users` du backend actif. Conséquences :

- une session Auth valide n’accorde aucun accès si `externalAuthId` n’existe pas
  dans le backend actif ;
- les associations Recipe ne valent pas pour production ou SQLite ;
- une bascule doit prévoir explicitement la parité des associations
  d’autorisation, sans attribution automatique.

### Scripts

Les scripts se répartissent en quatre groupes :

1. lecture/diagnostic :
   comparaisons, stabilité, prévols, inspections ;
2. export SQLite :
   `PRAGMA query_only`, lecture des tables et création de fichiers de sortie ;
3. recette contrôlée :
   scripts avec écritures synthétiques et nettoyage ;
4. migration/administration destructive :
   création/suppression de schéma, import, réparation, nettoyage.

Les scripts d’écriture ou destructifs ne doivent jamais être inclus dans une
commande générique de bascule. Ils exigent une procédure distincte, une cible
explicite et une confirmation humaine.

### SQL brut et spécificités moteur

- `PRAGMA` apparaît uniquement dans les migrations/outils SQLite ;
- les requêtes applicatives brutes sont principalement des contrôles PostgreSQL
  (`current_schema`, métadonnées et compteurs) ;
- des scripts utilisent `$queryRawUnsafe` et `$executeRawUnsafe` avec noms de
  schémas/tables contrôlés ; ils restent à risque élevé hors procédures dédiées ;
- les modèles utilisent des CUID texte : aucune séquence PostgreSQL métier
  n’est nécessaire ;
- PostgreSQL ne possède aucune séquence dans les deux schémas inspectés ;
- les dates PostgreSQL sont `timestamptz(3)`, contre `DATETIME` SQLite ;
- les booléens SQLite sont stockés avec affinité `BOOLEAN`, PostgreSQL utilise
  `boolean` ;
- les enums sont du texte côté SQLite et des types PostgreSQL dédiés ;
- `createMany` et les transactions sont utilisés et doivent être rejoués en
  recette fonctionnelle, même si Prisma les abstrait ;
- les comparaisons de chaînes et contraintes uniques peuvent différer selon la
  collation ; aucun `mode: insensitive` n’a été relevé dans le runtime ;
- les tris métier importants sont généralement explicites.

## Gestion des fichiers

### Provider LOCAL

Racine par défaut :

`public/uploads/assets`

Fonctions :

- upload atomique avec fichier temporaire puis lien ;
- lecture des octets et métadonnées ;
- URL locale sous `/uploads/assets/...` ;
- suppression exacte par `unlink` ;
- contrôle de chemin relatif, traversée et sortie de racine ;
- protection des liens symboliques dans la purge différée.

Risques :

- stockage éphémère ou non partagé en hébergement serverless ;
- incohérence entre réplicas ;
- perte de fichiers à un redéploiement ;
- dépendance à l’exposition publique de `public/`.

### Validation

- extensions et types MIME contrôlés ;
- taille vérifiée ;
- nom utilisateur non utilisé comme clé ;
- clé déterministe et normalisée ;
- chemins absolus, protocoles et traversées refusés.

### Provider SUPABASE

- bucket `asset-files` privé ;
- clé relative validée ;
- `filePath = storageKey` ;
- `storageBucket` et `storageKey` persistés ;
- accès par URL signée temporaire côté serveur ;
- aucune URL signée persistée ;
- suppression exacte et vérification `exists/missing/unknown` ;
- compensation après échec Prisma ;
- purge différée conservatrice.

### Interface

Le serveur projette les fichiers en DTO :

- `accessUrl` locale ou signée ;
- aucune `storageKey`, `storageBucket` ou `filePath` SUPABASE brute au client ;
- états `available`, `unavailable` et `expired`.

### Trois JPEG historiques

Ils restent :

- sous `public/uploads/assets/LIT-KING-000002` ;
- exclus de toute migration ;
- protégés par chemins déterministes ;
- inchangés selon leurs trois empreintes de référence.

### Rollback fichiers

Un rollback base sans rollback Storage coordonné peut créer :

- ligne sans binaire ;
- objet orphelin ;
- référence vers un chemin local absent.

Le rollback doit donc conserver les objets Storage, ne jamais supprimer les
JPEG historiques et utiliser un inventaire base ↔ Storage en lecture seule.

## Comparaison des structures et volumes

### Volumes

| Table | SQLite | Production `immos` | Recipe |
|---|---:|---:|---:|
| users | 5 | 5 | 5 |
| suppliers | 4 | 4 | 5 |
| locations | 4 | 4 | 6 |
| asset_categories | 3 | 3 | 5 |
| asset_items | 5 | 5 | 6 |
| asset_entries | 10 | 10 | 11 |
| asset_units | 12 | 12 | 13 |
| asset_files | 0 | 0 | 0 |
| asset_movements | 11 | 11 | 12 |
| asset_movement_lines | 13 | 13 | 14 |
| asset_documents | 14 | 14 | 15 |
| asset_document_entries | 19 | 19 | 20 |
| asset_document_lines | 26 | 26 | 27 |
| sensitive_action_approvals | 2 | 2 | 2 |
| audit_logs | 94 | 94 | 112 |
| **Total métier** | **222** | **222** | **253** |

SQLite et production ont les mêmes volumes par table. Recipe contient les
fixtures contrôlées validées lors des recettes antérieures.

### Structure

- SQLite : 16 tables en comptant `_prisma_migrations`, 24 clés étrangères et
  28 index uniques observés ;
- production : 16 tables, 211 colonnes, 25 FK, 89 index ;
- Recipe : 16 tables, 215 colonnes, 25 FK, 92 index ;
- aucune séquence PostgreSQL.

### Écart bloquant `asset_files`

Colonnes présentes uniquement dans Recipe :

- `storage_provider` ;
- `storage_bucket` ;
- `storage_key` ;
- `updated_at`.

SQLite et production utilisent encore la structure antérieure. Les clients
Prisma SQLite et production ont pourtant été générés depuis des schémas qui
déclarent ces quatre colonnes.

Preuve fonctionnelle en lecture seule :

`scripts/compare-sqlite-postgresql-readonly.mjs` échoue côté SQLite avec
`P2022`, car `main.asset_files.storage_provider` est absent.

Historique :

- SQLite ne contient que les migrations jusqu’à
  `20260608100000_lot_6_asset_files` ;
- production contient une baseline unique ;
- Recipe contient sa baseline et
  `20260729120000_add_asset_file_storage_metadata`.

Cette divergence ne doit pas être corrigée dans 10F-A. Elle interdit :

- une activation PostgreSQL production avec le client actuel ;
- l’affirmation que le runtime SQLite est pleinement compatible avec les pages
  qui sélectionnent `assetFiles` ;
- un rollback aveugle vers SQLite après création de métadonnées Storage.

## Matrice des risques

| Risque | Niveau | Impact | Mitigation |
|---|---|---|---|
| Schéma `asset_files` absent de SQLite/production | **Bloquant** | erreurs Prisma P2022 en lecture/écriture | phase dédiée de réconciliation, répétée d’abord sur copie/Recipe |
| Mauvaise cible production/recette | Bloquant | écriture dans `immos` | clients séparés, garde de schéma, URL sans valeur implicite |
| Écriture accidentelle production | Élevé | corruption métier | compte lecture seule pour audits, prévol production, fenêtre contrôlée |
| Divergence de données | Élevé | résultats différents après bascule | comparaison déterministe par table et scénarios en lecture |
| Fichiers locaux absents en hébergement | Élevé | pièces jointes indisponibles | Storage privé avant activation, inventaire et rollback |
| Incohérence base/Storage | Élevé | orphelins ou binaires manquants | compensation, inventaire, purge différée désactivée pendant bascule |
| Utilisateur Auth sans profil dans le backend cible | Élevé | refus d’accès après bascule | parité explicite `externalAuthId`, refus par défaut conservé |
| Rollback vers SQLite incompatible | **Bloquant** | P2022 et métadonnées perdues | ne pas annoncer le rollback avant réconciliation du schéma local |
| Variables manquantes | Moyen | démarrage impossible | validation centralisée, échec fermé |
| PostgreSQL indisponible | Élevé | application indisponible | test TCP/prévol, fenêtre de bascule, rollback documenté |
| Pooler Supabase | Moyen | timeouts/transactions | configuration bornée et tests de charge/transaction |
| Deux backends actifs simultanément | Élevé | split-brain | gel des écritures et source de vérité unique |
| Différences dates/enums/collation | Moyen | comportement subtil | tests de lecture/écriture déterministes |
| Scripts historiques destructifs | Élevé | suppression/import non voulu | liste blanche de commandes de bascule |
| Build vert mais runtime cassé | Élevé | faux sentiment de sécurité | tests HTTP réels et requêtes représentatives |
| Storage privé mal configuré | Élevé | fuite ou indisponibilité | contrôle bucket privé et URLs signées serveur |

## Plan progressif recommandé

### 10F-B — Parité fonctionnelle en lecture sur Recipe

- aucun changement de runtime par défaut ;
- aucune écriture ;
- harnais HTTP authentifié couvrant pages et API de lecture ;
- comparaison normalisée SQLite/production historique/Recipe ;
- contrôle explicite des relations, dates, enums, tris et refus Auth ;
- inventaire des écarts attendus liés aux fixtures Recipe ;
- arrêt sur P2022, 500, différence non expliquée ou fuite de métadonnées.

Rollback : arrêt du serveur Recipe, aucun état à restaurer.

### 10F-C — Plan de réconciliation de schéma

- audit/migration technique séparée pour les quatre colonnes Storage ;
- répétition sur copie ou schéma Recipe neuf ;
- aucune application en production avant validation humaine ;
- définition d’un rollback de structure sans perte.

### 10F-D — Écritures fonctionnelles synthétiques Recipe

- créations, modifications, suppressions logiques, transactions et audit ;
- objets Storage synthétiques uniquement si requis ;
- nettoyage total et compteurs protégés.

### 10F-E — Répétition de migration complète

- export immuable SQLite ;
- import dans un nouveau schéma Recipe ;
- parité structurelle et métier ;
- comparaison des hashes et relations ;
- mesure de durée.

### 10F-F — Préparation de la fenêtre de bascule

- gel des écritures ;
- sauvegardes ;
- manifeste d’état ;
- matrice go/no-go ;
- procédure d’arrêt immédiat.

### 10F-G — Synchronisation finale contrôlée

- uniquement après autorisation humaine ;
- migration différentielle ou réimport démontré ;
- aucun double writer.

### 10F-H — Activation PostgreSQL production

- changement de configuration réversible ;
- prévol production dédié ;
- smoke tests lecture puis écriture ;
- surveillance rapprochée.

### 10F-I — Observation et rollback

- métriques d’erreur/latence ;
- inventaire Storage ;
- conservation de SQLite en lecture seule ;
- rollback uniquement si compatibilité de schéma et données démontrée.

### Phase ultérieure

Le retrait de SQLite ne doit être envisagé qu’après une période d’observation,
une sauvegarde validée et une décision humaine distincte.

## Stratégie de rollback

Avant toute future activation :

1. conserver une copie SQLite immuable et son hash ;
2. geler les écritures ;
3. enregistrer le dernier identifiant/horodatage métier ;
4. conserver les objets Storage ;
5. ne jamais rejouer les écritures simultanément sur deux backends ;
6. rétablir la configuration précédente seulement si le schéma SQLite est
   compatible avec le client déployé ;
7. sinon revenir au commit applicatif compatible avec cette SQLite ;
8. comparer les écritures intervenues pendant la fenêtre avant toute reprise.

Le rollback actuel n’est pas prêt à cause des quatre colonnes manquantes dans la
base locale protégée.

## Proposition exacte de Phase 10F-B

**Phase 10F-B — Harnais de parité fonctionnelle en lecture PostgreSQL Recipe**

Périmètre :

- créer un outil strictement lecture seule ;
- utiliser le compte Auth de recette sans conserver de liaison ;
- tester toutes les pages privées et API GET représentatives ;
- comparer des DTO normalisés et compteurs déterministes ;
- vérifier dates, enums, nullabilité, relations et tris ;
- vérifier les fichiers avec une liste vide sans créer d’objet ;
- produire un manifeste d’écarts attendus Recipe ;
- ne modifier ni runtime par défaut, ni schéma, ni données ;
- ne pas tester les écritures ;
- ne pas toucher à production autrement que par lectures de contrôle.

Critères d’acceptation :

- aucun HTTP 500 ;
- aucun P2022 ;
- tous les écarts expliqués par les fixtures Recipe ;
- refus Auth et permissions inchangés ;
- compteurs 253/13/0 et production 222/12/0 inchangés ;
- bucket privé et vide ;
- SQLite inchangée.

## Contrôles exécutés

- suite locale : **181/181 réussis**, 0 échec ;
- quatre groupes de garde-fous Recipe : réussis ;
- build SQLite : réussi ;
- TypeScript intégré au build : réussi ;
- 19 pages générées ;
- avertissement NFT/Turbopack Prisma connu ;
- comparaison read-only SQLite/PostgreSQL : interrompue par le P2022 documenté ;
- inspection structurelle PostgreSQL : réussie ;
- comparaison des volumes par table : réussie ;
- bucket `asset-files` : privé et vide ;
- scan de 263 fichiers suivis ou créés : aucune correspondance avec les
  secrets locaux actuels et aucun JWT ;
- deux URL de forme PostgreSQL sont connues : une ancienne URL documentée avec
  mot de passe masqué dans un rapport Phase 8, et une cible locale factice
  `127.0.0.1` dans un test de panne réseau ; aucune n’expose un mot de passe
  réutilisable ;
- aucun script `lint` ou `typecheck` autonome disponible.

## États finaux protégés

SQLite :

`8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec`

Production :

- total métier : 222 ;
- `asset_units` : 12 ;
- `asset_files` : 0.

Recipe :

- total métier : 253 ;
- `asset_units` : 13 ;
- `asset_files` : 0 ;
- FK orphelines : 0.

Storage :

- bucket `asset-files` privé ;
- 0 objet.

JPEG :

- trois fichiers présents ;
- trois empreintes conformes ;
- aucune écriture.

## Confirmation d’absence de mutation

- aucune donnée SQLite modifiée ;
- aucune donnée PostgreSQL modifiée ;
- aucun objet Auth ou Storage modifié ;
- aucun schéma Prisma modifié ;
- aucune migration créée ;
- runtime par défaut inchangé ;
- aucun commit, push ou tag ;
- aucune bascule effectuée.

**PHASE 10F-A AUDITÉE — AUCUNE BASCULE EFFECTUÉE**
