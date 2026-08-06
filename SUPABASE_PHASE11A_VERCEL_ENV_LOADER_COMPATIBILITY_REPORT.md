# Phase 11A — Compatibilité du chargeur d'environnement avec Vercel

## Statut

**PHASE 11A VALIDÉE — CHARGEUR D’ENVIRONNEMENT COMPATIBLE VERCEL**

## Cause exacte du ENOENT

`scripts/supabase-env.mjs` appelait directement `readFile()` sur `.env.local` sans vérifier l'existence du fichier et sans utiliser en priorité les variables déjà disponibles dans `process.env`.

Sur Vercel, `.env.local` n'est ni versionné ni présent dans le workspace de build. Le chargeur échouait donc avec `ENOENT` avant de pouvoir exploiter les variables injectées par la plateforme.

## Correction appliquée

Le chargeur suit désormais l'ordre explicite suivant :

1. lecture optionnelle de `.env` lorsqu'il existe ;
2. lecture optionnelle de `.env.local` lorsqu'il existe ;
3. application de `process.env` en dernier, donc avec priorité absolue ;
4. validation stricte de toutes les variables obligatoires et de leurs invariants.

Une absence de `.env` ou `.env.local` produit un objet vide et ne constitue plus une erreur. Une autre erreur de lecture reste bloquante mais est assainie : seul le nom du fichier est mentionné.

Les valeurs de `process.env`, y compris celles fournies par Vercel ou la CI, ne sont jamais remplacées par un fichier local.

## Comportement local

- `.env.local` continue d'être chargé lorsqu'il est présent ;
- `.env` peut servir de base locale optionnelle ;
- `.env.local` conserve la priorité sur `.env` ;
- `process.env` conserve la priorité sur les deux fichiers ;
- aucun fichier d'environnement n'est créé ou réécrit.

## Comportement Vercel et CI

- `.env.local` peut être totalement absent ;
- les variables sont lues directement depuis `process.env` ;
- aucun secret n'est sérialisé dans un fichier temporaire ;
- une variable obligatoire absente, notamment `SUPABASE_DATABASE_URL`, provoque toujours une erreur explicite par son nom ;
- aucune valeur sensible n'est incluse dans les erreurs.

## Validations PostgreSQL conservées

Les validations existantes restent actives :

- `DATABASE_URL=file:./dev.db` pour la compatibilité locale attendue ;
- `DATABASE_SCHEMA=immos` ;
- bucket `asset-files` ;
- `schema=immos` et `sslmode=require` dans les URL PostgreSQL ;
- Transaction pooler 6543, paramètres pgbouncer et compteurs protégés dans le prévol Production ;
- aucune tolérance ou contournement du prévol ajouté.

## Génération du client Prisma PostgreSQL

Le diagnostic Git a confirmé que `/generated/` est ignoré et que `generated/prisma-postgresql` n'est pas versionné. Le précédent `build:postgresql` supposait pourtant ce client déjà présent au moment d'importer le prévol.

Pour la commande `build:postgresql` uniquement, le runner exécute désormais avant le prévol :

`prisma generate --schema prisma/postgresql/schema.prisma`

La génération utilise le binaire Prisma déjà installé, échoue de manière bloquante si elle ne réussit pas et précède toujours le prévol Production. Les commandes `dev` et `start` ne régénèrent pas inutilement le client.

## Tests

Nouveau fichier : `scripts/test-supabase-env-loader.mjs`.

Cas couverts :

- `.env.local` présent en local ;
- `.env.local` absent avec toutes les variables dans `process.env` ;
- `.env.local` absent et variable obligatoire manquante ;
- priorité de `process.env` sur `.env.local` et `.env` ;
- absence de valeur sensible dans une erreur de validation ;
- génération du client PostgreSQL avant le prévol.

Résultats :

- tests ciblés chargeur/prévol/gardes : **11/11 réussis** ;
- suite locale complète : **213/213 réussis** ;
- échec : 0.

Les tests n'effectuent aucun appel réel Supabase et utilisent uniquement des valeurs factices `example.invalid`.

## Builds et TypeScript

### SQLite

- `npm run build:sqlite` : réussi ;
- TypeScript : réussi en 858 ms ;
- pages : 19/19 générées ;
- avertissement NFT/Turbopack Prisma historique, non bloquant.

### PostgreSQL sans `.env.local`

Un workspace temporaire isolé a été créé sans `.env`, sans `.env.local`, sans client généré et sans base SQLite. Les variables existantes ont été fournies uniquement au processus, sans être écrites dans la copie.

Résultats observés :

- `.env.local` absent : confirmé ;
- client `generated/prisma-postgresql` absent avant commande : confirmé ;
- `npm run build:postgresql` a chargé `process.env` sans ENOENT ;
- génération Prisma PostgreSQL : réussie en 730 ms ;
- client présent après génération : confirmé ;
- étape suivante atteinte : prévol Production strict.

Le build complet s'est ensuite arrêté avec P1001 car le Transaction pooler 6543 était indisponible depuis le réseau local. Un unique prévol direct de confirmation a donné le même résultat. Aucun retry supplémentaire et aucun contournement n'ont été effectués.

Cette indisponibilité réseau est distincte du défaut Vercel corrigé : le chargeur et la génération fonctionnent sans `.env.local`, et le prévol reste correctement bloquant. Le build PostgreSQL complet devra être confirmé sur Vercel ou un réseau stable.

La copie temporaire a été supprimée après le test.

## Fichiers créés ou modifiés

- modifié : `scripts/supabase-env.mjs` ;
- modifié : `scripts/run-next-with-database.mjs` ;
- créé : `scripts/test-supabase-env-loader.mjs` ;
- créé : `SUPABASE_PHASE11A_VERCEL_ENV_LOADER_COMPATIBILITY_REPORT.md`.

## Sécurité et états protégés

- aucun `.env.local` ajouté à Git ;
- aucun fichier d'environnement généré pendant le build ;
- aucune variable ou URL complète affichée dans le rapport ;
- aucun credential modifié ;
- aucune donnée SQLite ou PostgreSQL modifiée ;
- aucun objet Storage ou compte Auth modifié ;
- aucun changement Prisma ou migration ;
- aucune règle métier modifiée ;
- aucun déploiement ;
- aucun commit ;
- aucun push.

## Limite restante

Le correctif de compatibilité Vercel est validé localement et en workspace sans fichier d'environnement. La réussite complète de `build:postgresql` après le prévol dépend encore d'un canal Production 6543 disponible et doit être confirmée dans l'environnement Vercel.
