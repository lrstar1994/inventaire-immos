# Phase 10F-B — Parité fonctionnelle strictement en lecture sur PostgreSQL Recipe

## Statut

**PHASE 10F-B VALIDÉE — PARITÉ EN LECTURE CARTOGRAPHIÉE**

La parité fonctionnelle des lectures est confirmée hors chargement implicite du
modèle `AssetFile`. Trois familles de lectures sont bloquées sur SQLite par
`P2022`, toutes localisées sur la première colonne physique manquante :
`main.asset_files.storage_provider`. PostgreSQL Recipe exécute les mêmes
lectures correctement. Aucune donnée, aucun schéma et aucun objet Storage n'ont
été modifiés.

## État initial

- HEAD : `6244fdc58b6e908ea3a7483a9e3a0abe313aaf84`
- commit : `6244fdc feat(auth): secure Supabase authorization and recipe validation`
- branche : `master`
- fichiers suivis modifiés : aucun ;
- fichiers non suivis antérieurs : rapports historiques 10C, 10D, rapport de
  checkpoint 10E-G et rapport 10F-A ;
- runtime par défaut : SQLite via `generated/prisma-lot6` ;
- SQLite : SHA-256
  `8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec` ;
- production `immos` : 222 lignes métier, 12 `asset_units`, 0 `asset_files` ;
- Recipe `immos_recipe_phase8` : 253 lignes métier, 13 `asset_units`,
  0 `asset_files`, 0 FK orpheline ;
- Storage : bucket `asset-files` privé et vide ;
- `.env.local` : ignoré par Git et non suivi ;
- aucun diff dans `prisma/`, aucune migration nouvelle.

## Dispositif strictement non destructif

Le script
`scripts/diagnose-read-only-functional-parity.mjs` est le seul diagnostic créé.
Il applique simultanément :

- ouverture SQLite avec `mode=ro` ;
- vérification SHA-256 avant et après ;
- extension Prisma locale refusant `create`, `createMany`, `update`, `upsert`,
  `delete` et leurs variantes ;
- transaction PostgreSQL Recipe avec `SET TRANSACTION READ ONLY` ;
- vérification effective `SHOW transaction_read_only = on` ;
- sortie limitée aux nombres, formes de résultats et erreurs Prisma assainies ;
- aucun appel HTTP mutateur et aucun accès Storage pendant la matrice.

Un premier contrôle d'état distant, antérieur à la matrice, n'avait pas réussi à
imposer `default_transaction_read_only` par paramètre d'URL : le serveur a
retourné `off`. Cette connexion n'a exécuté que des `SELECT` et n'a effectué
aucune mutation. Toutes les lectures fonctionnelles de la matrice et la
comparaison structurelle ont ensuite été exécutées dans une transaction
explicitement `READ ONLY`.

## Comparaison exacte de `asset_files`

Les trois schémas Prisma et les trois clients générés déclarent les quatre
champs. Seule la table physique Recipe les contient.

| Colonne physique | Champ Prisma | Type SQLite prévu | Type PostgreSQL | Nullabilité / défaut | SQLite physique | Production `immos` | Recipe | Trois schémas et clients |
|---|---|---|---|---|---:|---:|---:|---:|
| `storage_provider` | `storageProvider` | `TEXT` / enum | enum `StorageProvider` | nullable, aucun défaut | absente | absente | présente | présente |
| `storage_bucket` | `storageBucket` | `TEXT` | `text` | nullable, aucun défaut | absente | absente | présente | présente |
| `storage_key` | `storageKey` | `TEXT` | `text` | nullable, aucun défaut | absente | absente | présente | présente |
| `updated_at` | `updatedAt` | `DATETIME` | `timestamptz` | non nulle, `@updatedAt`, aucun défaut SQL dans Recipe | absente | absente | présente | présente |

Clients concernés :

- SQLite : `generated/prisma-lot6`, schéma `prisma/schema.prisma` ;
- production : `generated/prisma-postgresql`,
  `prisma/postgresql/schema.prisma` ;
- Recipe : `generated/prisma-recipe`,
  `prisma/postgresql-recipe/schema.prisma`.

Conséquence : une lecture Prisma d'un `AssetFile` sans `select` explicite
sélectionne tous les champs scalaires du modèle. SQLite échoue dès
`storage_provider`. La structure physique de production présente la même
incompatibilité avec son client généré ; cette conclusion est structurelle,
sans utilisation de production comme runtime applicatif.

## Inventaire des lectures `AssetFile`

### Lectures implicitement complètes et bloquées

| Chemin | Forme | Sélection implicite |
|---|---|---|
| `app/parc/page.js` | `assetUnit.findMany({ include: { assetFiles } })` | toutes les colonnes `AssetFile` |
| `app/api/asset-units/route.js` | relation `assetFiles` incluse | toutes |
| `app/api/asset-units/[id]/route.js` | relation `assetFiles` incluse | toutes |
| `app/api/asset-files/route.js` | `assetFile.findMany` avec `include` | toutes |
| `app/api/asset-units/[id]/files/route.js` | `assetFile.findMany` sans `select` | toutes |
| `app/api/asset-files/[id]/route.js` | `assetFile.findUnique` avec `include` | toutes |
| `lib/asset-file-service.js` | deux `assetFile.findFirst` sans `select` | toutes |

Les composants `app/parc/asset-park.js`,
`app/parc/[id]/asset-unit-detail.js` et
`app/parc/asset-file-access-view.js` consomment les DTO après ces lectures ; ils
ne déclenchent pas Prisma eux-mêmes mais leurs pages sont bloquées en amont.

Le service `lib/storage/asset-file-deletion-plan.js` utilise une sélection
explicite comprenant les métadonnées Storage. Il serait donc incompatible avec
les tables physiques SQLite/production actuelles, mais son exécution est une
mutation et reste hors périmètre de cette recette.

### Lectures compatibles

- `assetFile.count()` ;
- prédicat relationnel `assetFiles.some` dans un compteur ;
- `AssetFile.findMany` avec un `select` strictement limité aux treize colonnes
  historiques ;
- toutes les lectures testées des utilisateurs, référentiels, entrées,
  mouvements et documents qui ne matérialisent pas un `AssetFile`.

## Matrice fonctionnelle

| Zone / scénario | SQLite | Recipe | Classe |
|---|---|---|---|
| connexion et lecture de session | contrat couvert par tests mockés, sans réseau Auth réel | indépendant du backend métier | PARITÉ CONFIRMÉE |
| profil, statut et rôle applicatifs | succès, même forme | succès, même forme | PARITÉ CONFIRMÉE |
| utilisateur non autorisé / refus par défaut | couvert par tests d'autorisation | même couche serveur | PARITÉ CONFIRMÉE |
| compteurs du tableau de bord | succès | succès | PARITÉ CONFIRMÉE |
| liste d'immobilisations, recherche, filtre, tri, pagination, sans fichiers | 5 lignes échantillonnées | 5 lignes échantillonnées | PARITÉ CONFIRMÉE |
| détail d'une unité sans relation fichiers | succès | succès | PARITÉ CONFIRMÉE |
| détail/liste d'unités avec `assetFiles` implicite | `P2022` | succès | BLOQUÉ PAR P2022 |
| compteur `asset_files` | 0 | 0 | PARITÉ CONFIRMÉE |
| liste implicite `assetFile.findMany` | `P2022` | succès, 0 ligne | BLOQUÉ PAR P2022 |
| lecture implicite `findFirst`/`findUnique` | `P2022` | succès, résultat vide | BLOQUÉ PAR P2022 |
| liste avec colonnes historiques explicites | succès, 0 ligne | succès, 0 ligne | PARITÉ CONFIRMÉE |
| catégories, sites/bâtiments/pièces, fournisseurs, utilisateurs/rôles | succès, même structure | succès, même structure | PARITÉ CONFIRMÉE AVEC DIFFÉRENCE DE DONNÉES ATTENDUE |
| entrées | succès, même structure | succès, même structure | PARITÉ CONFIRMÉE AVEC DIFFÉRENCE DE DONNÉES ATTENDUE |
| mouvements | succès, même structure | succès, même structure | PARITÉ CONFIRMÉE AVEC DIFFÉRENCE DE DONNÉES ATTENDUE |
| documents | succès, même structure | succès, même structure | PARITÉ CONFIRMÉE AVEC DIFFÉRENCE DE DONNÉES ATTENDUE |
| créations, modifications, suppressions, uploads | non exécutés | non exécutés | NON TESTABLE SANS ÉCRITURE |
| composants client purs | aucune requête Prisma | aucune requête Prisma | HORS PÉRIMÈTRE |

Les différences de volume sont attendues : Recipe contient 253 lignes métier,
SQLite en contient 222. La comparaison porte sur le succès, la forme des
résultats, les relations et les contrats, jamais sur l'égalité brute des
données.

## Erreurs P2022 exactes

Trois scénarios distincts reproduisent :

- code : `P2022` ;
- type : `PrismaClientKnownRequestError` ;
- colonne : `main.asset_files.storage_provider` ;
- modèle signalé : `AssetUnit` pour l'inclusion relationnelle ;
- modèle signalé : `AssetFile` pour `findMany` et `findFirst`.

Aucune autre incompatibilité de lecture n'a été observée dans la matrice.
L'erreur s'arrête à la première colonne manquante ; elle ne prouve pas que les
trois suivantes seraient ignorées. La comparaison structurelle prouve qu'elles
sont également absentes.

## Parcours GET et lectures couverts

- `/` : compteurs ;
- `/parc` et lectures des routes `/api/asset-units` : succès hors inclusion
  fichiers, P2022 avec inclusion ;
- `/parc/[id]` et `/api/asset-units/[id]` : même résultat ;
- `/api/asset-files`, `/api/asset-files/[id]`,
  `/api/asset-units/[id]/files` : P2022 avec sélection implicite ;
- `/referentiels`, `/api/asset-options` : lectures compatibles ;
- `/documents` et routes GET documents : compatibles ;
- `/mouvements` et routes GET mouvements : compatibles ;
- utilisateurs et rôles : lectures compatibles selon les permissions ;
- `/connexion` : indépendant des données `AssetFile`, couvert par les
  181 tests Auth/autorisation existants.

Aucune requête POST, PUT, PATCH ou DELETE n'a été envoyée.

## Options de correction pour 10F-C

### Option A — Aligner SQLite et production sur Recipe

- avantages : restaure la cohérence entre schémas physiques, schémas Prisma et
  clients ; conserve l'architecture Storage déjà validée ; supprime la cause
  réelle des P2022 ;
- risques : migration SQLite et PostgreSQL à préparer, répéter et valider ;
  `updated_at` non nul exige une stratégie sûre pour les lignes existantes ;
- SQLite : migration additive, avec copie contrôlée et vérification des trois
  fichiers historiques ;
- production : migration additive ultérieure seulement après répétition ;
- Recipe : déjà alignée, sert de référence ;
- rollback : sauvegardes et migration inverse documentée, sans suppression
  précipitée des métadonnées ;
- dette : faible ;
- migration : oui.

### Option B — Retirer temporairement les quatre champs du runtime

- avantages : ferait correspondre rapidement le modèle aux tables anciennes ;
- risques : régresse les fonctions Storage, purge, URL signée et DTO déjà
  validés ; désaligne Recipe ; peut rendre des lignes SUPABASE illisibles ;
- rollback : régénération de clients et réintroduction ultérieure ;
- dette : élevée et double travail ;
- migration : probablement Recipe ou modèles, donc non neutre.

### Option C — Clients ou modèles temporaires distincts

- avantages : isole chaque état physique ;
- risques : multiplication des branches de code, contrats divergents et
  erreurs de sélection de client ; maintenance élevée ;
- rollback : suppression des clients temporaires après convergence ;
- dette : très élevée ;
- migration : pas immédiatement, mais reste nécessaire pour converger.

### Option D — `select` explicites évitant les colonnes absentes

- avantages : peut débloquer certaines lectures sans migration immédiate ;
- risques : correctif cosmétique ; les services Storage ont besoin des champs ;
  chaque nouvel accès peut réintroduire P2022 ; ne corrige ni les écritures ni
  la divergence de schéma ;
- rollback : facile ;
- dette : élevée et diffuse ;
- migration : différée, mais toujours nécessaire.

## Recommandation unique pour Phase 10F-C

Choisir l'option A, avec une **répétition additive contrôlée** :

1. créer une copie jetable de SQLite et y appliquer la migration Storage déjà
   présente, jamais la base protégée en premier ;
2. vérifier structure, données, anciennes lignes LOCAL, empreintes des trois
   JPEG et tous les parcours de lecture ;
3. répéter l'alignement PostgreSQL sur un schéma de recette recréé ou une copie
   dédiée, sans toucher à `immos` ;
4. valider `storage_provider`, `storage_bucket`, `storage_key`, `updated_at`,
   index et historique de migration ;
5. produire un plan de rollback vérifié avant toute proposition de migration
   SQLite protégée ou production.

Cette recommandation traite la cause structurelle, préserve le futur Storage et
n'utilise pas de `select` partiels comme état permanent.

## Tests et contrôles

- diagnostic de parité : 13 scénarios, 10 compatibles, 3 P2022 localisés,
  0 autre incompatibilité ;
- transaction Recipe : `transaction_read_only = on` ;
- garde Prisma mutante : active ;
- suite historique : **181/181 réussis**, 0 échec ;
- garde-fou Recipe autonome : baseline 253/222 acceptée, baseline obsolète et
  divergences refusées ;
- validation syntaxique du diagnostic : réussie ;
- `git diff --check` : réussi ;
- build SQLite : réussi ;
- TypeScript intégré au build : réussi ;
- 19 pages générées ;
- avertissement NFT/Turbopack Prisma déjà connu, non bloquant ;
- prévol PostgreSQL Recipe réel sans contournement :
  `RECIPE_PREFLIGHT_OK`.

Une tentative de lancement groupé de deux scripts de session spécialisés a été
écartée : ces scripts exigent leur environnement Recipe propre et ne font pas
partie de la suite locale. Ils ont échoué respectivement pour variable de
contexte absente et acquisition réseau dans ce mauvais contexte. Aucun test
historique n'a été masqué : la commande documentée de 181 tests et le prévol
réel ont ensuite tous deux réussi.

## Audit des secrets

- `.env.local` ignoré et non suivi ;
- aucun JWT suivi ;
- aucune valeur réelle `sb_secret_*` suivie ;
- aucune valeur secrète ou URL de connexion n'est reproduite ici ;
- les occurrences textuelles de noms de variables sont autorisées ;
- les deux URL à forme credentialisée déjà connues sont un exemple masqué dans
  un rapport historique et une URL locale factice de test ;
- aucune URL signée, aucun cookie et aucun token n'ont été générés ou persistés.

## États finaux

- Git : HEAD inchangé `6244fdc58b6e908ea3a7483a9e3a0abe313aaf84` ;
- SQLite : empreinte attendue inchangée ;
- production `immos` : 222 / 12 / 0, lecture seule ;
- Recipe `immos_recipe_phase8` : 253 / 13 / 0, 0 FK orpheline ;
- Storage : bucket privé, vide ;
- schémas Prisma : inchangés ;
- migrations : aucune créée ou modifiée ;
- runtime par défaut : SQLite inchangé ;
- fichiers sous `public/uploads/assets` : non modifiés ;
- trois JPEG historiques présents sous `LIT-KING-000002`, avec les trois
  empreintes de référence conformes ;
- Auth : non modifié ;
- aucun commit, aucun push, aucun tag.

## Fichiers créés

- `scripts/diagnose-read-only-functional-parity.mjs`
- `SUPABASE_PHASE10F_B_READ_ONLY_FUNCTIONAL_PARITY_REPORT.md`

## Confirmation d'absence de mutation

La matrice a utilisé SQLite en lecture seule et PostgreSQL Recipe dans une
transaction explicitement read-only. Les empreintes, totaux, FK et état Storage
avant/après sont identiques. Aucun changement applicatif, métier, Prisma,
migration, Auth ou Storage n'a été effectué.
