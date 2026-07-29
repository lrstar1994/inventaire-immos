# Phase 9B ter — Diagnostic séquentiel du pooler 6543

Date : 2026-07-29
Commit : `ce4b6c223baf91d82696b3ff87ef35d0167bb8fc`

## 1. Conclusion

Catégorie finale : **F — incident non conclusif**.

Les couches suivantes sont démontrées fonctionnelles sur le port 6543 :

- résolution DNS ;
- ouverture TCP ;
- négociation SSL et authentification PostgreSQL ;
- routage vers la base ;
- `SELECT 1` avec `psql` ;
- `current_schema() = immos` avec `psql`.

Le test Prisma n'a pas atteint Prisma : le code JavaScript transmis avec `node -e`
a été altéré par l'échappement PowerShell et Node a levé un `SyntaxError` avant
l'import du client. La règle d'arrêt interdisant une seconde tentative, les tests
Prisma suivants n'ont pas été exécutés.

La cause du `P1001` du build Phase 9B reste donc indéterminée. En revanche, une
défaillance permanente DNS, TCP, TLS, credentials ou routage PostgreSQL natif sur
6543 est exclue avec un niveau de certitude élevé au moment de ce diagnostic.

## 2. Configuration masquée de `build:postgresql`

La lecture de `package.json`, `scripts/run-next-with-database.mjs`,
`lib/prisma.js` et `lib/prisma-client-factory.js` confirme :

| Élément | Valeur |
|---|---|
| Variable source | `SUPABASE_DATABASE_URL` |
| Hôte masqué | `aws-1***.pooler.supabase.com` |
| Port | 6543 |
| Mode | Supavisor Transaction |
| SSL | `require` |
| Paramètre `schema` | `immos` |
| Client | `generated/prisma-postgresql`, sélection `normal` |
| Schéma statique attendu | `immos` |
| `pgbouncer` ajouté au runtime | `true` |
| `connection_limit` ajouté au runtime | `1` |
| `pool_timeout` ajouté au runtime | `60` |
| `connect_timeout` dans l'URL | valeur driver par défaut |

Le port 6543 est bien la connexion effectivement utilisée par
`npm run build:postgresql`.

Contrôle de configuration : succès en 356 ms.

## 3. Prévol

### Git

- commit conforme ;
- changements limités aux fichiers Phase 9 attendus ;
- aucun `.env` réel, SQLite, upload, log ou fichier généré suivi ;
- durée : 402 ms.

### Processus et ports

- aucun processus `node` ou `psql` ;
- ports 3000 et 3018 libres ;
- durée : 3 215 ms.

### SQLite et fichiers locaux

- SQLite :
  `8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec`
- trois JPEG présents, tailles et empreintes inchangées :
  - 2 405 379 octets —
    `4ea6fafc0e1dfec5b1763203715f20c00b2b84720c8ff9158a47a06c440fad4a`
  - 2 107 645 octets —
    `ff1a9c1a9ccf30932426389687755d2065074eacaa56948451e03903dac3bd83`
  - 1 501 619 octets —
    `d360445ca40c9e7c6afc77bc7d97a2c30c9f58b766cfb5de50db422bd5d393ec`
- durée : 1 086 ms.

### PostgreSQL et Storage

- `immos` : 222 lignes ; `asset_files` : 0 ;
- `immos_recipe_phase8` : 253 lignes ; `asset_files` : 0 ;
- intégrité FK recette : 0 violation ;
- bucket `asset-files` privé et vide.

Durées :

- recette et intégrité : 9 065 ms ;
- schéma normal : 2 718 ms ;
- bucket : 2 184 ms.

Une première commande de lecture du bucket comportait une erreur locale de syntaxe
PowerShell (`-Headers$headers`) et n'a envoyé aucune requête exploitable. Elle a
été corrigée avant le diagnostic réseau. Le contrôle corrigé a confirmé le bucket
privé et vide.

## 4. Résultats séquentiels

### 4.1 DNS isolé

- début : `2026-07-29T11:10:45.3048246+03:00`
- fin : `2026-07-29T11:10:45.7523071+03:00`
- durée : 447 ms
- timeout : 5 000 ms
- code de sortie : 0
- IPv4 :
  - `3.71.225.44`
  - `3.65.151.229`
  - `18.196.8.182`
- IPv6 : aucune
- résultat : succès

### 4.2 TCP isolé

- début : `2026-07-29T11:11:03.2467723+03:00`
- fin : `2026-07-29T11:11:03.8213380+03:00`
- durée : 575 ms
- timeout : 5 000 ms
- code de sortie : 0
- adresse utilisée : `3.71.225.44`
- port : 6543
- authentification : aucune
- résultat : succès

### 4.3 `psql SELECT 1`

- début : `2026-07-29T11:11:30.7672443+03:00`
- fin : `2026-07-29T11:11:32.6951374+03:00`
- durée totale du processus : 1 928 ms
- durée de la requête mesurée par `psql` : 228,575 ms
- temps connexion/démarrage approximatif : 1 699 ms
- `connect_timeout` : 8 secondes
- `sslmode` : `require`
- code de sortie : 0
- résultat : `1`
- stderr : vide

### 4.4 `psql current_schema()`

- nouveau processus indépendant ;
- début : `2026-07-29T11:12:00.0676017+03:00`
- fin : `2026-07-29T11:12:02.1912313+03:00`
- durée totale : 2 124 ms
- durée de la requête : 228,501 ms
- temps connexion/démarrage approximatif : 1 895 ms
- `connect_timeout` : 8 secondes
- code de sortie : 0
- résultat : `immos`
- stderr : vide

### 4.5 Prisma `SELECT 1`

- nouveau processus indépendant ;
- début : `2026-07-29T11:12:27.0485878+03:00`
- fin : `2026-07-29T11:12:27.4984565+03:00`
- durée : 450 ms
- timeout externe : 15 000 ms
- code de sortie : 1
- Prisma chargé : non
- connexion tentée : non
- requête tentée : non
- déconnexion Prisma nécessaire : non, aucune instance créée
- erreur : `SyntaxError: Unexpected token '.'`

Cause exacte : l'échappement des guillemets de la commande `node -e` a supprimé
les délimiteurs JavaScript avant l'import et les chaînes. L'échec est local au
harness diagnostique et n'apporte aucune preuve sur Prisma ou le pooler.

Conformément à la règle d'arrêt, aucune correction ni seconde tentative n'a été
effectuée.

### 4.6 Prisma `current_schema()`

Non exécuté : arrêt après l'échec du processus Prisma précédent.

### 4.7 Lecture Prisma minimale

Non exécutée : arrêt après l'échec du processus Prisma précédent.

## 5. Étape exacte d'arrêt

Étape 7, démarrage du processus de test Prisma `SELECT 1`, avant le chargement du
client Prisma et avant toute connexion réseau.

Ce point d'arrêt est différent :

- du `P1001` Phase 9B, survenu pendant le pré-rendu de `/` après compilation et
  TypeScript ;
- du timeout Phase 9B bis, survenu après 60,3 secondes sans sortie intermédiaire.

## 6. Classification

### Catégories exclues

- A, DNS défaillant : exclue ;
- B, TCP défaillant : exclue ;
- C, authentification ou TLS défaillant : exclue.

### Catégories non démontrées

- D, PostgreSQL natif réussi mais Prisma échoue : non démontrée, car Prisma n'a
  pas été chargé ;
- E, Prisma minimal réussi : non démontrée.

### Catégorie retenue

**F — incident non conclusif**, en raison de l'arrêt imposé après une défaillance
du harness local.

Niveau de certitude :

- fonctionnement DNS/TCP/TLS/psql sur 6543 : élevé ;
- fonctionnement Prisma sur 6543 dans cette phase : inconnu ;
- origine exacte du `P1001` du build : inconnue.

## 7. Cause la plus probable

Pour l'arrêt de cette phase : erreur d'échappement locale de la commande
JavaScript, démontrée.

Pour le `P1001` historique : aucune nouvelle cause démontrée. Les résultats natifs
rendent moins probable un défaut permanent du pooler ou des credentials. Un
incident intermittent ou un comportement propre au moteur Prisma/contexte de
pré-rendu reste possible.

## 8. Contrôles finaux

- recette : 253 lignes, `asset_files=0`, FK=0 violation ;
- `immos` : 222 lignes, `asset_files=0` ;
- SQLite : empreinte inchangée ;
- bucket `asset-files` : privé, 0 objet ;
- trois JPEG : tailles et empreintes inchangées ;
- aucune politique modifiée ;
- aucune écriture PostgreSQL ;
- aucune écriture Storage ;
- aucun objet ou URL signée créé ;
- aucun processus `node` ou `psql` résiduel ;
- ports 3000 et 3018 libres ;
- aucun secret affiché ;
- aucun commit créé.

Durées finales :

- recette : 5 669 ms ;
- `immos` : 2 009 ms ;
- bucket : 1 718 ms ;
- fichiers/processus/ports : 1 533 ms.

## 9. Recommandation

La prochaine étape devrait utiliser un petit script diagnostique versionné ou
temporaire, sans secret, plutôt qu'un `node -e`, puis exécuter une seule fois :

1. Prisma `SELECT 1` ;
2. dans un nouveau processus, Prisma `current_schema()` ;
3. dans un nouveau processus, un `count()` borné.

Cette recommandation nécessite une nouvelle validation humaine. Aucun build,
test Storage ou commit Phase 9B ne doit être lancé sur la base du diagnostic
Prisma incomplet de cette phase.

## 10. Fichiers modifiés

Un seul fichier a été ajouté :

- `SUPABASE_PHASE9B_TER_POOLER_6543_DIAGNOSTIC_REPORT.md`

Aucun fichier de code ou de configuration n'a été modifié.
