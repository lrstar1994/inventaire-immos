# Phase 7 — Préparation du basculement contrôlé PostgreSQL

Date : 2026-07-28

## Commits

- Commit préalable phases 5 et 6 : `dcbe0ef1d0d736ce6466883993ad1c8f21c20d8a`
- Ce commit contient exclusivement les cinq scripts et rapports autorisés.

## Sélection du backend

`APP_DATABASE_PROVIDER` accepte exclusivement :

- `sqlite` : valeur par défaut, client SQLite et `DATABASE_URL`
- `postgresql` : client PostgreSQL et `SUPABASE_DATABASE_URL`

Toute autre valeur provoque une erreur explicite. La sélection est réalisée uniquement dans `lib/prisma.js`, côté serveur. `DATABASE_URL` n'est jamais remplacée par une URL Supabase.

Le client PostgreSQL vérifie `schema=immos` et construit en mémoire une URL adaptée au pooler Supabase avec `pgbouncer=true`, `connection_limit=1` et `pool_timeout=60`. La variable réelle n'est ni modifiée ni affichée. Une instance globale distincte est conservée par backend en développement.

## Commandes

- SQLite par défaut : `npm.cmd run dev`
- SQLite explicite : `npm.cmd run dev:sqlite`
- PostgreSQL explicite : `npm.cmd run dev:postgresql`
- Build SQLite explicite : `npm.cmd run build:sqlite`
- Build PostgreSQL explicite : `npm.cmd run build:postgresql`

Les commandes dédiées injectent `APP_DATABASE_PROVIDER` uniquement dans leur processus et ne modifient pas `.env.local`.

## Audit de compatibilité

Les deux clients exposent les mêmes 15 modèles, champs applicatifs, relations, enums et opérations utilisées par les pages, API et services. Les appels existants `findMany`, `findFirst`, `findUnique`, `count`, `create`, `update`, agrégations et transactions restent centralisés et inchangés.

La parité en lecture seule couvre :

- comptages des 15 tables ;
- comptages de l'accueil ;
- fournisseurs, emplacements, catégories et articles ;
- liste du parc et relations ;
- fiche du bien `cmpuprff9000pw0w02dwg0tsj` ;
- documents et lignes ;
- mouvements, lignes et relation de retour ;
- valeurs d'enums présentes ;
- dates normalisées uniquement en ISO 8601 ;
- suppressions logiques.

PostgreSQL ordonne ses enums selon leur déclaration tandis que SQLite les ordonne lexicalement. Le script trie donc uniquement les ensembles d'enums avant comparaison. Aucune autre différence métier n'est normalisée.

Les neuf sections comparées ont des empreintes SQLite/PostgreSQL identiques.

## Recette PostgreSQL en lecture seule

| Page | Résultat |
|---|---:|
| `/` | HTTP 200 |
| `/referentiels` | HTTP 200 |
| `/parc` | HTTP 200 |
| `/parc/cmpuprff9000pw0w02dwg0tsj` | HTTP 200 |
| `/documents` | HTTP 200 |
| `/mouvements` | HTTP 200 |

Aucune création, modification ou suppression n'a été exécutée.

## Builds

### SQLite

- Compilation : réussie
- TypeScript : réussi
- Pages : 21/21
- Erreur Prisma : aucune
- Connexion PostgreSQL involontaire : aucune

Le build SQLite a été exécuté avec une URL PostgreSQL volontairement invalide injectée au processus et a réussi, confirmant que le client PostgreSQL n'est pas instancié dans ce mode.

### PostgreSQL

- Compilation : réussie
- TypeScript : réussi
- Pages : 21/21
- Erreur Prisma : aucune

L'avertissement Turbopack NFT déjà connu est présent dans les deux builds et n'a pas été traité.

## Non-modification

- Empreinte SQLite avant : `8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec`
- Empreinte SQLite après : `8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec`
- Lignes PostgreSQL avant : 222
- Lignes PostgreSQL après : 222
- `asset_files` avant et après : 0
- Objets Storage avant et après : 0
- Valeurs de secrets détectées dans les sorties : aucune

La migration Storage historique est un no-op : aucune métadonnée fichier valide n'existe et les trois JPEG orphelins restent exclus, non rattachés et non téléversés.

## Fichiers Phase 7

Modifiés :

- `.env.example`
- `lib/prisma.js`
- `package.json`

Créés :

- `scripts/run-next-with-database.mjs`
- `scripts/compare-sqlite-postgresql-readonly.mjs`
- `SUPABASE_PHASE7_SWITCH_REPORT.md`
- `outputs/migration/supabase-phase-7/*` — sorties ignorées par Git

Le script partagé `scripts/supabase-env.mjs`, préparé lors de la phase 4, est une dépendance du contrôle de parité et doit être inclus dans le commit final.

Les fichiers PostgreSQL préparatoires et autres scripts Phase 4 déjà présents dans l'arbre de travail n'ont pas été modifiés pendant cette phase et ne doivent pas être inclus dans le commit Phase 7.
