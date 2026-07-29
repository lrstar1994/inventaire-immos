# Phase 9B quater — Diagnostic Prisma isolé sur le pooler 6543

Date : 2026-07-29
Commit : `ce4b6c223baf91d82696b3ff87ef35d0167bb8fc`

## 1. Conclusion

Classification : **D — les trois tests Prisma réussissent**.

Le canal Prisma normal vers Supavisor Transaction sur le port 6543 fonctionne
hors du contexte Next.js :

- `SELECT 1` : succès ;
- `current_schema() = immos` : succès ;
- `assetFile.count() = 0` : succès ;
- déconnexion propre dans les trois processus.

Le `P1001` du build Phase 9B n'est donc pas un défaut permanent de DNS, TCP, TLS,
credentials, routage PostgreSQL ou du client Prisma normal sur le port 6543.
L'investigation suivante doit cibler le contexte du pré-rendu Next.js et la
concurrence des lectures pendant `build:postgresql`. Aucune modification de
l'abstraction Storage n'est justifiée par ces résultats.

## 2. État initial

- commit conforme ;
- modifications limitées aux fichiers Phase 9 non commités ;
- aucun processus Node ou `psql` résiduel ;
- ports 3000 et 3018 libres ;
- SQLite SHA-256 :
  `8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec` ;
- `immos` : 222 lignes, `asset_files=0` ;
- `immos_recipe_phase8` : 253 lignes, `asset_files=0` ;
- intégrité relationnelle recette : 0 violation ;
- bucket `asset-files` privé et vide ;
- trois JPEG présents avec leurs tailles et empreintes validées.

Le script Prisma existant de vérification de recette a expiré pendant le prévol
après 34 secondes sans sortie. Il n'a effectué aucune écriture. Les quatre
compteurs et l'intégrité ont ensuite été confirmés avec `psql` dans une
transaction `READ ONLY`, sans relancer ce script.

## 3. Script diagnostique

Fichier :

```text
scripts/diagnose-prisma-pooler-6543.mjs
```

Caractéristiques :

- aucun secret codé en dur ;
- charge `.env.local` par le chargeur existant ;
- utilise exclusivement `SUPABASE_DATABASE_URL` ;
- refuse une cible autre que le port 6543 ;
- exige `sslmode=require` et `schema=immos` ;
- charge uniquement `generated/prisma-postgresql` ;
- reproduit les paramètres runtime :
  - `pgbouncer=true`
  - `connection_limit=1`
  - `pool_timeout=60`
- aucun import Next.js, route, service métier ou module Storage ;
- un seul mode et une seule requête par processus ;
- fermeture de Prisma dans `finally` ;
- messages JSON structurés ;
- erreur filtrée des URL et du nom d'hôte ;
- code de sortie non nul en cas d'échec.

Modes :

- `select1`
- `current-schema`
- `count`

Le contrôle `node --check` a réussi. Aucun URL réel, mot de passe, token ou clé
Supabase n'est présent dans le script.

## 4. Prisma SELECT 1

Commande :

```text
node scripts/diagnose-prisma-pooler-6543.mjs select1
```

Résultat :

- début : `2026-07-29T08:32:54.665Z`
- fin : `2026-07-29T08:32:58.640Z`
- timeout externe : 15 000 ms
- création du client : 179 ms
- durée de la requête : 3 760 ms
- durée totale mesurée par le script : 3 946 ms
- durée du processus observée : environ 5,0 s
- résultat : `1`
- déconnexion : succès en 2 ms
- code de sortie : 0
- code Prisma : aucun

## 5. Prisma current_schema()

Commande :

```text
node scripts/diagnose-prisma-pooler-6543.mjs current-schema
```

Nouveau processus indépendant.

Résultat :

- début : `2026-07-29T08:33:11.810Z`
- fin : `2026-07-29T08:33:15.013Z`
- timeout externe : 15 000 ms
- création du client : 9 ms
- durée de la requête : 3 187 ms
- durée totale : 3 202 ms
- durée du processus observée : environ 4,0 s
- schéma : `immos`
- déconnexion : succès en 2 ms
- code de sortie : 0
- code Prisma : aucun

## 6. Lecture Prisma minimale

Commande :

```text
node scripts/diagnose-prisma-pooler-6543.mjs count
```

Nouveau processus indépendant. Une seule lecture ORM :

```text
assetFile.count()
```

Résultat :

- début : `2026-07-29T08:33:29.108Z`
- fin : `2026-07-29T08:33:32.598Z`
- timeout externe : 15 000 ms
- création du client : 10 ms
- durée de la requête : 3 426 ms
- durée totale : 3 480 ms
- durée du processus observée : environ 4,3 s
- résultat : 0
- valeur attendue : 0
- déconnexion : succès en 2 ms
- code de sortie : 0
- code Prisma : aucun

## 7. Comparaison avec les incidents précédents

| Phase | Résultat |
|---|---|
| 9B | `P1001` pendant le pré-rendu de `/`, après compilation et TypeScript |
| 9B bis | commande groupée expirée après 60,3 s sans sortie intermédiaire |
| 9B ter | PostgreSQL natif réussi ; harness `node -e` invalide avant Prisma |
| 9B quater | trois processus Prisma isolés réussis sur 6543 |

Les phases 9B bis et ter ne démontraient pas un échec Prisma. La présente phase
démontre que Prisma fonctionne lorsqu'une seule connexion et une seule requête
sont exécutées dans un processus isolé.

## 8. Analyse

### Classification

**D — les trois tests réussissent.**

### Cause la plus probable du P1001 historique

Le canal de base étant validé, les hypothèses restantes les plus plausibles sont :

- incident intermittent Supavisor pendant le build ;
- concurrence de plusieurs workers ou plusieurs lectures lors du pré-rendu ;
- acquisition de connexion propre au contexte Next.js/Turbopack ;
- comportement d'une page pré-rendue qui ouvre une connexion au moment du build.

Cette phase ne permet pas de distinguer ces hypothèses, car aucun build n'était
autorisé.

### Niveau de certitude

- fonctionnement Prisma minimal sur 6543 : élevé ;
- fonctionnement du mapping Prisma normal vers `immos` : élevé ;
- caractère non permanent du défaut : élevé ;
- cause exacte du `P1001` pendant le build : faible à moyenne.

## 9. Contrôles finaux

Après les trois processus :

- `immos` : 222 lignes ;
- `immos.asset_files` : 0 ;
- `immos_recipe_phase8` : 253 lignes ;
- `immos_recipe_phase8.asset_files` : 0 ;
- intégrité relationnelle recette : 0 violation ;
- SQLite SHA-256 inchangé :
  `8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec` ;
- bucket `asset-files` privé et vide ;
- aucune politique modifiée ;
- aucun objet Storage créé ;
- trois JPEG inchangés :
  - `4ea6fafc0e1dfec5b1763203715f20c00b2b84720c8ff9158a47a06c440fad4a`
  - `ff1a9c1a9ccf30932426389687755d2065074eacaa56948451e03903dac3bd83`
  - `d360445ca40c9e7c6afc77bc7d97a2c30c9f58b766cfb5de50db422bd5d393ec`
- aucun processus Node, Prisma ou `psql` résiduel ;
- ports 3000 et 3018 libres ;
- aucun build lancé ;
- aucun test Storage lancé ;
- aucune donnée modifiée ;
- aucun commit créé.

## 10. Git

Fichiers ajoutés par cette phase :

- `scripts/diagnose-prisma-pooler-6543.mjs`
- `SUPABASE_PHASE9B_QUATER_PRISMA_6543_DIAGNOSTIC_REPORT.md`

Aucun fichier métier, Prisma, Storage ou de configuration n'a été modifié.

## 11. Recommandation

L'étape suivante devrait qualifier le pré-rendu PostgreSQL de façon contrôlée,
avec une seule exécution du build et une instrumentation permettant d'identifier
le nombre de workers, la page concernée et les lectures simultanées.

Cette étape nécessite une validation humaine distincte. Aucun changement Storage,
aucune Phase 9C et aucun commit ne doivent commencer dans cette phase.
