# Phase 10E-E1 — Amélioration du prévol PostgreSQL Recipe

## Résumé

Le prévol recette reste bloquant par défaut. Son diagnostic distingue désormais
clairement une indisponibilité PostgreSQL d’un problème SQLite et confirme
qu’aucune donnée n’a été modifiée.

Un contournement volontaire, `RECIPE_SKIP_PREFLIGHT=1`, est disponible
uniquement avec la commande de développement recette. Il ignore seulement les
lectures réseau et de contrôle des données. Les garde-fous statiques restent
obligatoires :

- backend PostgreSQL ;
- client Prisma `recipe` ;
- client généré limité à `immos_recipe_phase8` ;
- connexion session sur le port 5432 ;
- `sslmode=require` ;
- paramètre `schema=immos_recipe_phase8`.

La variable est absente du comportement par défaut et documentée à `0` dans
`.env.example`.

## Audit du fonctionnement initial

`scripts/run-next-with-database.mjs` construit la connexion recette depuis
`SUPABASE_DIRECT_URL`, impose le port 5432 et SSL, sélectionne le client Prisma
recipe, puis exécute `scripts/preflight-postgresql-recipe.mjs` avant Next.js.

Le prévol vérifie ensuite :

1. la configuration du provider et du client ;
2. le schéma du client Prisma généré ;
3. le schéma PostgreSQL réellement actif ;
4. les totaux attendus de recette et de production.

Avant 10E-E1, une panne réseau remontait principalement la longue erreur brute
de connexion Prisma, puis le refus générique du lanceur.

## Comportement après modification

### Mode normal

Sans `RECIPE_SKIP_PREFLIGHT=1`, aucun comportement de sécurité n’est assoupli.
Une impossibilité de joindre PostgreSQL produit un refus avec quatre informations :

- PostgreSQL Supabase est injoignable ;
- la cause probable est le réseau ou la connectivité ;
- SQLite locale n’est pas concernée ;
- aucune donnée n’a été modifiée.

### Contournement de développement

Avec `RECIPE_SKIP_PREFLIGHT=1` et uniquement lorsque le lanceur exécute
`postgresql-recipe dev` :

- les contrôles réseau, du schéma actif et des totaux sont ignorés ;
- un avertissement encadré et très visible est affiché ;
- l’application peut démarrer pour du travail ne nécessitant pas PostgreSQL ;
- les accès PostgreSQL restent susceptibles d’échouer jusqu’au retour du réseau.

Pour `build` ou `start`, le lanceur ne marque pas l’exécution comme
développement et le contournement est refusé. Une invocation directe du prévol
ne peut pas simuler ce contexte sans le marqueur interne posé par le lanceur.

## Fichiers créés

- `SUPABASE_PHASE10E_E1_RECIPE_PREFLIGHT_DEVELOPER_EXPERIENCE_REPORT.md`

## Fichiers modifiés

- `.env.example` : documentation du défaut sûr `RECIPE_SKIP_PREFLIGHT=0` ;
- `scripts/run-next-with-database.mjs` : marqueur interne limité à la commande
  `dev` ;
- `scripts/preflight-postgresql-recipe.mjs` : diagnostic réseau assaini,
  contournement explicite et avertissement ;
- `scripts/test-postgresql-recipe-guard.mjs` : tests du refus statique, du mode
  développement, du refus hors développement et du message réseau.

Les autres changements non commités présents dans le répertoire de travail
proviennent des phases 10E antérieures et n’ont pas été remaniés par 10E-E1.

## Tests et contrôles

- syntaxe ciblée des trois scripts : réussie ;
- garde incohérente `client=normal` : refusée avant connexion ;
- `RECIPE_SKIP_PREFLIGHT=1` en développement : accepté avec avertissement ;
- même variable hors développement : refusée ;
- PostgreSQL synthétiquement injoignable : échec bloquant et message complet ;
- suite applicative : **180/180 réussis, 0 échec** ;
- `git diff --check` ciblé : réussi ;
- scan de secrets : aucun secret réel détecté.

Le scan reconnaît volontairement l’URL PostgreSQL factice et locale
`127.0.0.1` du test d’indisponibilité. Elle ne contient aucun identifiant
réutilisable et ne cible aucun environnement Supabase.

## Build et TypeScript

`npm.cmd run build:sqlite` a réussi :

- compilation Next.js réussie ;
- contrôle TypeScript intégré réussi ;
- 19 pages générées ;
- avertissement NFT/Turbopack Prisma préexistant, non bloquant.

La première tentative via `npm` a été bloquée avant exécution par la politique
PowerShell visant `npm.ps1`; la même commande a ensuite été exécutée avec
`npm.cmd`.

Il n’existe aucun script autonome `typecheck` ni `lint` dans `package.json`.
Le build PostgreSQL n’a pas été exécuté : la connectivité PostgreSQL est
précisément indisponible et ce build n’est pas requis pour ce changement ciblé.

## États protégés

Avant la modification, une lecture protégée avait confirmé :

- production : `asset_units=12`, `asset_files=0` ;
- recette : 253 lignes métier, `asset_units=13`, `asset_files=0`,
  FK orphelines 0 ;
- bucket `asset-files` privé et vide.

La relecture distante finale a été empêchée par l’indisponibilité réseau
PostgreSQL qui motive cette phase. Aucune commande d’écriture PostgreSQL,
Storage ou Auth n’a été exécutée pendant 10E-E1.

Contrôles locaux finaux :

- SQLite SHA-256 :
  `8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec` ;
- trois JPEG historiques inchangés :
  - `4ea6fafc0e1dfec5b1763203715f20c00b2b84720c8ff9158a47a06c440fad4a` ;
  - `ff1a9c1a9ccf30932426389687755d2065074eacaa56948451e03903dac3bd83` ;
  - `d360445ca40c9e7c6afc77bc7d97a2c30c9f58b766cfb5de50db422bd5d393ec`.

## Confirmations

- aucune donnée SQLite, PostgreSQL, Storage ou Auth modifiée ;
- aucun schéma Prisma modifié ;
- aucune migration créée ou modifiée ;
- aucun bucket ou objet Storage modifié ;
- aucune règle métier modifiée ;
- prévol conservé et bloquant par défaut ;
- contournement désactivé par défaut et limité au développement ;
- aucun commit ;
- aucun push ;
- aucun tag.
