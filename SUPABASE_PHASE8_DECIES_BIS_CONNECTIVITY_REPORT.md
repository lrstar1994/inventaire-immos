# Phase 8 decies bis — Diagnostic P1001

Date : 2026-07-29
Commit créé : aucun

## Résultat

Le diagnostic préalable a échoué sur la toute première requête Prisma
`SELECT 1`. Conformément aux consignes :

- aucun serveur Next.js démarré ;
- aucune série de stabilité poursuivie ;
- aucun scénario métier exécuté ;
- aucune relance de connexion ;
- aucune écriture.

## Connexion logique et clients

### Client de contrôle `immos`

- client : `generated/prisma-postgresql` ;
- variable source : `SUPABASE_DIRECT_URL` ;
- schéma imposé par le script : `immos` ;
- mode : pooler Supabase session ;
- hôte : `aws-1-eu-central-1.pooler.supabase.com` ;
- port : 5432 ;
- base : `postgres` ;
- utilisateur masqué : `pos***ys` ;
- SSL : `sslmode=require` ;
- timeout de connexion : valeur par défaut du pilote.

### Client applicatif recette

- client : `generated/prisma-recipe` ;
- variable applicative : `SUPABASE_DATABASE_URL` ;
- pendant un démarrage recette, cette variable est injectée temporairement
  depuis `SUPABASE_DIRECT_URL` avec `schema=immos_recipe_phase8` ;
- mode : pooler session 5432 ;
- singleton applicatif :
  `__inventairePrisma_postgresql_recipe`.

### SQLite

- `DATABASE_URL` reste exclusivement `file:./dev.db` ;
- elle n'est pas utilisée par les clients PostgreSQL.

Il n'existe pas de variable générique `DIRECT_URL` utilisée par cette recette.

## Cycle de vie Prisma

- le serveur réutilise un singleton distinct pour le client normal et le client
  recette ;
- le script d'empreinte crée son propre client normal autonome ;
- ce client autonome est fermé dans un bloc `finally` ;
- il ne partage pas et ne ferme pas le singleton du serveur ;
- aucune opération `$disconnect()` n'est appelée sur le client serveur pendant
  son fonctionnement ;
- aucun pool applicatif supplémentaire n'est introduit.

Lors de ce diagnostic, aucun serveur n'était actif. Le P1001 s'est donc produit
sans concurrence entre le client serveur et le client de contrôle. Cela écarte
comme cause principale un conflit entre ces deux processus.

## Réseau

Résolution DNS :

- réussie ;
- IPv4 obtenues :
  - `3.65.151.229`
  - `3.71.225.44`
  - `18.196.8.182`

Test TCP :

- hôte : pooler Supabase masqué ci-dessus ;
- port : 5432 ;
- `TcpTestSucceeded=True` ;
- adresse testée : `3.65.151.229`.

## Test PostgreSQL minimal

Premier client testé : client normal ciblant `immos`.

- opération : `SELECT 1` ;
- résultat : échec Prisma P1001 ;
- `current_schema()` : non exécuté ;
- comptages 222/247 : non exécutés ;
- empreinte minimale : non exécutée ;
- client refermé proprement par `finally`.

Le client recette n'a pas été testé ensuite, car la première vérification avait
échoué et imposait l'arrêt.

## Cause probable

Le DNS et la connexion TCP sont disponibles, mais Prisma n'arrive pas à établir
la session PostgreSQL. La cause la plus probable est une indisponibilité ou
instabilité intermittente au niveau de l'établissement de session Supavisor
sur le pooler session 5432, après l'ouverture TCP.

Éléments concordants :

- P1001 déjà observé de manière intermittente ;
- la même configuration a réussi lors de contrôles précédents ;
- un contrôle final avait réussi après le P1001 de la phase decies ;
- le nouvel échec survient sans serveur Next.js ni second PrismaClient actif ;
- aucune erreur d'authentification, de schéma ou de conversion n'est retournée.

Une saturation de sessions côté service reste possible, mais elle n'est pas
démontrée par les informations disponibles. Aucun changement d'URL, de port,
de pooler ou de timeout n'a donc été appliqué arbitrairement.

## Script d'empreinte

- client correct : client normal statique `@@schema("immos")` ;
- URL correcte : `SUPABASE_DIRECT_URL`, schéma `immos` ;
- requêtes séquentielles, non parallèles ;
- 15 lectures de tables puis un contrôle de préfixe ;
- aucune écriture ;
- fermeture de son propre client uniquement ;
- le P1001 est survenu dès la première lecture, avant toute charge liée aux 15
  tables.

La quantité de requêtes d'empreinte n'est donc pas la cause de cet échec précis.

## Séries de stabilité

Résultats :

- série initiale : échec sur `SELECT 1` ;
- série 2 : non exécutée ;
- série 3 : non exécutée.

Aucun serveur ni scénario métier n'était autorisé après ce résultat.

## État local final

- port 3018 libre ;
- aucun processus Node/Next de ce projet détecté ;
- serveur démarré : aucun ;
- PID lancé/arrêté : sans objet ;
- SQLite SHA-256 :
  `8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec`.

État distant de référence au dernier contrôle réussi, et nécessairement
inchangé par cette phase sans écriture :

- `immos_recipe_phase8` : 247 lignes ;
- `immos` : 222 lignes ;
- `asset_files=0` ;
- Storage privé et vide.

Storage n'a pas été contacté pendant cette phase.

## Modifications

- `scripts/diagnose-postgresql-connectivity-decies.mjs`
- `SUPABASE_PHASE8_DECIES_BIS_CONNECTIVITY_REPORT.md`

Aucune configuration de connexion ni règle métier n'a été modifiée. Aucun
secret n'a été exposé ou journalisé.
