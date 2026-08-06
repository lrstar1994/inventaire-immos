# Phase 10F-G1 — Qualification de la connexion PostgreSQL Production

## Statut

**PHASE 10F-G1 VALIDÉE — CONNEXION PRODUCTION QUALIFIÉE SUR LE PORT 6543**

Classification obligatoire : **B — Session pooler 5432 indisponible, Transaction pooler 6543 stable**.

## Résumé exécutif

La Phase 10F-G s'était arrêtée avant toute écriture parce que son diagnostic utilisait explicitement `SUPABASE_DIRECT_URL`, donc le Session pooler sur le port 5432. Ce canal est toujours inaccessible au niveau TCP depuis le réseau courant.

Le runtime applicatif Production est toutefois conçu pour utiliser `SUPABASE_DATABASE_URL`, c'est-à-dire le Transaction pooler sur le port 6543. Ce canal a réussi la connexion PostgreSQL native, les trois diagnostics Prisma isolés et trois séries successives de stabilité. Le schéma observé est toujours `immos` et `assetFile.count()` vaut toujours 0.

Aucune URL complète, valeur d'identifiant, clé ou mot de passe n'est reproduit dans ce rapport.

## État Git initial

- Branche : `master`.
- HEAD : `6244fdc58b6e908ea3a7483a9e3a0abe313aaf84`.
- Les modifications applicatives et rapports non suivis issus des phases précédentes étaient déjà présents.
- Aucun commit, push ou tag n'a été réalisé.

## Audit de la tentative 10F-G

- Rapport lu : `SUPABASE_PHASE10F_G_PRODUCTION_FINAL_VALIDATION_REPORT.md`.
- Script ayant produit P1001 : `scripts/phase10f-e1-align-production.mjs`.
- Variable utilisée : `SUPABASE_DIRECT_URL`.
- Canal : Session pooler, port 5432.
- Schéma demandé : `immos`.
- SSL : `sslmode=require` présent.
- Étape bloquante : ouverture de connexion Prisma, avant serveur Next.js, liaison Auth ou CRUD.
- La tentative n'utilisait pas le sélecteur normal du runtime Production et ne qualifiait donc pas le canal 6543 prévu pour l'application.

## Contrat statique du runtime Production

| Commande | Sélecteur | Client | URL attendue | Schéma | Paramètres |
|---|---|---|---|---|---|
| `npm run dev:postgresql` | `APP_DATABASE_PROVIDER=postgresql`, `APP_PRISMA_CLIENT=normal` | `generated/prisma-postgresql` | `SUPABASE_DATABASE_URL` | `immos` | `sslmode=require`, `pgbouncer=true`, `connection_limit=1`, `pool_timeout=60` |
| `npm run build:postgresql` | identique | identique | identique | `immos` | identiques |
| `npm run start:postgresql` | script absent de `package.json` | — | — | — | — |

`lib/prisma.js` sélectionne bien `SUPABASE_DATABASE_URL` pour le client Production normal. `SUPABASE_DIRECT_URL` reste distincte et n'est pas la connexion runtime recommandée.

## Inspection sécurisée des URL

| Variable | Protocole | Hôte | Port | Base | Utilisateur | Mot de passe | SSL | Schéma | Pooler |
|---|---|---:|---:|---|---|---|---|---|---|
| `SUPABASE_DIRECT_URL` | PostgreSQL | partiellement masqué, pooler Supabase | 5432 | présente | masqué, project-ref cohérent | présent | require | immos | Session |
| `SUPABASE_DATABASE_URL` | PostgreSQL | même hôte masqué | 6543 | même base | même utilisateur masqué | présent | require | immos | Transaction |

Les deux URL sont syntaxiquement valides, sans espace, guillemet parasite ou retour à la ligne. Le mot de passe est encodé comme composant URL. La région, le project-ref, la base et le schéma sont cohérents. Les paramètres Prisma du Transaction pooler sont ajoutés par le runtime.

## Qualification réseau et PostgreSQL

### Port 5432

- DNS : succès, trois adresses IPv4 résolues.
- TCP : échec sur les trois adresses, avec un seul cycle borné.
- PostgreSQL natif : non exécuté, conformément à l'arrêt imposé après échec TCP.
- Prisma : non exécuté, conformément à la même règle.

### Port 6543

- DNS : succès.
- TCP : succès.
- PostgreSQL natif : `SELECT 1` réussi en 2 559 ms, connexion SSL, schéma `immos`.
- Prisma isolé, processus 1 : `SELECT 1` réussi en 4 398 ms.
- Prisma isolé, processus 2 : `current_schema()` = `immos`, réussi en 2 807 ms.
- Prisma isolé, processus 3 : `assetFile.count()` = 0, réussi en 3 070 ms.

## Série minimale de stabilité 6543

Chaque série a utilisé un nouveau processus, sans parallélisme et avec un intervalle borné.

| Série | Heure UTC | Durée | SELECT 1 | Schéma | AssetFile | P1001 |
|---:|---|---:|---|---|---:|---|
| 1 | 2026-07-31T14:11:23.343Z | 5 101 ms | succès | immos | 0 | non |
| 2 | 2026-07-31T14:11:31.695Z | 5 087 ms | succès | immos | 0 | non |
| 3 | 2026-07-31T14:11:39.955Z | 4 926 ms | succès | immos | 0 | non |

Le Transaction pooler 6543 satisfait donc le seuil de qualification demandé.

## Correction et prévol Production

La sélection runtime existante était correcte ; aucune URL permanente ni credential n'a été modifié. La correction porte sur le garde-fou de démarrage :

- ajout d'un prévol Production strictement en lecture seule ;
- exécution automatique du prévol avant `dev:postgresql` et `build:postgresql` ;
- refus si provider/client/canal/schéma/SSL ne correspondent pas ;
- validation de `SELECT 1`, `current_schema() = immos`, 222 lignes métier, 12 AssetUnit, 0 AssetFile et 0 FK orpheline ;
- validation des quatre colonnes Storage et de l'enum `StorageProvider` ;
- transaction explicitement `READ ONLY` ;
- aucune possibilité de démarrer Next.js lorsque le prévol échoue.

Résultat réel du prévol : succès sur 6543, schéma `immos`, 222 / 12 / 0, 0 FK orpheline, quatre colonnes et enum conformes.

La commande de validation du branchement a utilisé l'option d'aide de Next après le prévol : elle a confirmé l'ordre prévol puis commande, sans démarrer de serveur.

## Fichiers G1 créés ou modifiés

- `scripts/inspect-supabase-alternative-urls.mjs` : sortie renforcée et masquage de l'hôte.
- `scripts/run-next-with-database.mjs` : prévol Production bloquant avant Next.js.
- `scripts/preflight-postgresql-production.mjs` : prévol lecture seule.
- `scripts/qualify-production-postgresql-native.mjs` : qualification native bornée.
- `scripts/stability-production-runtime-6543.mjs` : série Prisma isolée.
- `scripts/diagnose-phase10f-g1-final-states.mjs` : état final lecture seule.
- `scripts/test-production-connectivity-preflight.mjs` : tests ciblés.
- `SUPABASE_PHASE10F_G1_PRODUCTION_CONNECTIVITY_QUALIFICATION_REPORT.md` : présent rapport.

Les autres modifications visibles dans Git appartiennent aux phases antérieures et n'ont pas été altérées pour G1.

## Tests et contrôles statiques

- Tests du sélecteur et du prévol Production : **4/4 réussis**.
- Validation syntaxique ciblée de tous les scripts G1 : réussie.
- `git diff --check` : réussi.
- Aucun script autonome `lint` ou `typecheck` n'existe pour ces fichiers JavaScript ; aucun script artificiel n'a été créé.
- Aucun build ni serveur Next.js lancé, conformément au périmètre de qualification.

## États finaux protégés

- SQLite : SHA-256 `9645a17ea36adfba0c8964fbf536c47a323d22f606896112f4ed62334882d5ed`, inchangée.
- PostgreSQL Recipe : 253 lignes métier, 13 AssetUnit, 0 AssetFile, 0 FK orpheline.
- PostgreSQL Production : 222 lignes métier, 12 AssetUnit, 0 AssetFile, 0 FK orpheline.
- Storage : bucket `asset-files` privé et vide.
- Auth : inchangé.
- Ports 3000 et 3001 : libres ; aucun serveur Node/Next.js de cette phase.

Toutes les requêtes PostgreSQL exécutées étaient des lectures. Aucune migration, modification Prisma, écriture Storage ou modification Auth n'a eu lieu. Le scan n'a trouvé aucune valeur sensible réelle. L'unique URL avec credentials détectée est la fixture explicitement factice `example.invalid` du test de validation, non réutilisable. Aucun commit, push ou tag n'a été effectué.

## Recommandation de reprise

Reprendre la Phase 10F-G avec le runtime Production normal fondé sur `SUPABASE_DATABASE_URL`, Transaction pooler 6543, et conserver le nouveau prévol bloquant. Ne pas utiliser le Session pooler 5432 depuis le réseau actuel tant que sa connectivité TCP n'est pas rétablie.
