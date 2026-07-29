# Phase 8 undecies — Qualification contrôlée du P1001

Date : 2026-07-29
Commit créé : aucun

## Résultat

Les tests uniques `psql` Session, Prisma Session et Prisma Transaction ont
réussi. Le premier test Prisma du diagnostic avait néanmoins échoué avec P1001
alors que DNS et TCP étaient disponibles.

Conclusion : le défaut n'est pas reproductible de façon permanente et n'est pas
spécifique au Prisma Client, à sa chaîne Session ou à l'authentification. Les
résultats sont compatibles avec une interruption transitoire pendant
l'établissement d'une session Supavisor. Sans Pooler Logs, la cause serveur
précise ne peut pas être démontrée.

Aucun serveur Next.js et aucun scénario métier n'ont été lancés.

## Préservation de l'état

- port 3018 libre avant et après diagnostic ;
- aucun processus Node/Next du projet ;
- aucune migration ;
- aucun `db push` ;
- aucun Prisma Studio ;
- aucune écriture PostgreSQL ;
- aucune lecture de table métier ;
- SQLite et Storage non modifiés.

## Erreur P1001

Dernier échec qualifié :

- période : 2026-07-29, avant 08:04:07 UTC+03:00 ;
- opération : première et unique requête Prisma `SELECT 1` du diagnostic ;
- code : `PrismaClientInitializationError`, exposé fonctionnellement comme
  Prisma P1001 ;
- message masqué :
  `Can't reach database server at aws-1-eu-central-1.pooler.supabase.com:5432` ;
- client : `generated/prisma-postgresql` ;
- port : 5432 ;
- tentative suivante automatique : aucune ;
- cause interne complémentaire : aucune ;
- champ `retryable` : non renseigné.

Le rapport de la phase decies bis a été créé à 07:51:03 UTC+03:00. Pour les
Pooler Logs, consulter au minimum la fenêtre :

- 2026-07-29 07:45–08:04 UTC+03:00 ;
- soit 2026-07-29 04:45–05:04 UTC.

## Versions

- système : Windows, `win32 x64` ;
- Node.js : `v24.14.0` ;
- Prisma CLI : `6.19.3` ;
- `@prisma/client` : `6.19.3` ;
- Prisma Client recette : `6.19.3` ;
- Query Engine Node-API :
  `c2990dca591cba766e3b7ef5d9e8a84796e47ab7` ;
- psql : PostgreSQL `16.10`.

## Structure de la connexion Session

Source réellement chargée : `.env.local`, variable `SUPABASE_DIRECT_URL`.

Représentation masquée :

`postgresql://postgres.…:***@aws-1-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=require&schema=immos`

Contrôles :

- protocole PostgreSQL : conforme ;
- utilisateur au format Supavisor avec project-ref : conforme ;
- hôte pooler : conforme ;
- région : `eu-central-1` ;
- port Session : 5432 ;
- base : `postgres` ;
- SSL : `require` ;
- schéma Prisma : `immos` ;
- mot de passe présent et encodage URL analysable ;
- aucun espace ;
- aucun guillemet intégré ;
- aucun retour à la ligne ;
- aucune valeur `DATABASE_URL` utilisée pour PostgreSQL ;
- `DATABASE_URL` reste `file:./dev.db`.

L'accès au panneau Connect Supabase n'étant pas disponible, la correspondance
octet pour octet avec la chaîne officielle ne peut pas être attestée ici. La
structure locale est conforme au format attendu et avait déjà été validée lors
des phases précédentes.

## DNS et TCP

DNS réussi :

- `3.65.151.229`
- `3.71.225.44`
- `18.196.8.182`

TCP :

- port 5432 joignable ;
- adresse testée : `3.65.151.229`.

## Pooler Logs

Non disponibles depuis cet environnement. Aucun résultat n'est inventé.

Rechercher dans la fenêtre indiquée :

- `authentication failure` ;
- `connection closed during authentication` ;
- `worker_not_found` ;
- timeout Supavisor ;
- `max client connections reached` ;
- échec de liaison entre Supavisor et PostgreSQL ;
- projet/utilisateur non routable ;
- erreur SSL ou GSSAPI.

## Test psql Session

Une tentative unique, sans retry :

- `SELECT 1` : succès ;
- `current_database()` : `postgres` ;
- `current_user` : utilisateur Supavisor masqué `pos***es` ;
- `current_schema()` : `public`.

Le schéma `public` est attendu pour psql : le paramètre Prisma `schema=immos`
n'est pas interprété par libpq comme un `search_path`. Aucune table n'a été lue.

- durée : 2 661 ms ;
- SSL requis via `PGSSLMODE=require` ;
- mot de passe fourni uniquement par variable de processus ;
- aucune valeur sensible dans la commande ou les sorties.

## Test Prisma Session minimal

Autorisé après le succès psql :

- client chargé uniquement : `generated/prisma-recipe` ;
- `APP_PRISMA_CLIENT=recipe` vérifié ;
- un seul `PrismaClient` ;
- création client : 7 ms ;
- délai avant `SELECT 1` : 7 ms ;
- `SELECT 1` : succès en 4 313 ms ;
- `current_schema()` : `immos_recipe_phase8`, 450 ms ;
- fermeture propre dans `finally` ;
- aucun retry ;
- aucun module métier chargé.

Prisma utilise correctement le paramètre `schema` et le client statique recette.

## Test Prisma Transaction

La variable locale `SUPABASE_DATABASE_URL` correspond structurellement au
pooler Transaction 6543. Test diagnostique unique :

- client : `generated/prisma-recipe` ;
- port : 6543 ;
- `pgbouncer=true` ;
- `connection_limit=1` ;
- `SELECT 1` : succès ;
- durée : 3 355 ms ;
- aucune modification de la configuration applicative.

## Connexion directe

Non applicable :

- aucune URL directe distincte n'est fournie dans `.env.local` ;
- la disponibilité IPv6 n'a pas été établie ;
- aucune chaîne directe officielle du panneau Connect n'était disponible ;
- aucune URL n'a été construite ou devinée.

## Matrice comparative

| Mode | Client | Résultat | Durée |
|---|---|---|---:|
| Session 5432 | psql | succès | 2 661 ms |
| Session 5432 | Prisma recette | succès | 4 313 ms pour `SELECT 1` |
| Transaction 6543 | Prisma recette | succès | 3 355 ms |
| Direct | — | non applicable | — |
| Pooler Logs | — | indisponibles | — |

Un test Prisma Session antérieur dans cette même phase a échoué avec P1001.
Ainsi, « toutes les connexions réussissent maintenant » qualifie l'incident
comme probablement transitoire, sans être suffisant pour reprendre la recette.

## Clients et stratégie de cycle de vie

- singleton serveur distinct par provider et sélection ;
- scripts diagnostiques avec un seul client autonome ;
- fermeture de chaque client autonome dans `finally` ;
- aucun `$disconnect()` du singleton serveur ;
- aucun serveur actif pendant les tests ;
- le P1001 n'est donc pas causé par une fermeture prématurée du client serveur ;
- aucun nombre excessif de connexions n'a été créé dans ce diagnostic.

## État des données

Aucune table métier n'a été lue ou écrite dans cette phase, conformément à la
restriction.

Dernier état validé et nécessairement inchangé par ces requêtes techniques :

- `immos_recipe_phase8` : 247 lignes ;
- mouvement `VALIDATED` ;
- unité à l'emplacement final ;
- deux audits de validation ;
- `immos` : 222 lignes ;
- SQLite inchangée ;
- Storage privé et vide ;
- `asset_files=0`.

## Fichiers créés ou modifiés

- `scripts/diagnose-postgresql-connectivity-decies.mjs`
- `scripts/inspect-supabase-session-url.mjs`
- `scripts/inspect-supabase-alternative-urls.mjs`
- `scripts/test-psql-session-once.mjs`
- `scripts/test-prisma-recipe-session-once.mjs`
- `scripts/test-prisma-transaction-once.mjs`
- `SUPABASE_PHASE8_UNDECIES_CONNECTIVITY_REPORT.md`

## Confirmations

- aucun serveur lancé ;
- aucune écriture ;
- aucune migration ;
- aucun scénario métier ;
- aucun secret exposé ;
- aucun commit.
