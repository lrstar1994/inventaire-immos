# Phase 9B quinquies — Diagnostic du pré-rendu Next.js PostgreSQL

Date : 2026-07-29
Commit : `ce4b6c223baf91d82696b3ff87ef35d0167bb8fc`

## 1. Conclusion

L'unique build diagnostique n'a pas atteint le pré-rendu ni Prisma.

Il a dépassé le timeout externe de 180 secondes. Le fichier Next.js
`.next/diagnostics/build-diagnostics.json` indique :

```json
{
  "buildStage": "type-checking",
  "buildOptions": {
    "useBuildWorker": "true"
  }
}
```

Aucun événement de l'instrumentation Prisma, aucun `P1001` et aucune route en
cours de génération n'ont été observés. Le `P1001` historique de la Phase 9B
n'est donc pas reproduit dans cette exécution.

Cas retenu : **D — arrêt non Prisma au stade type-checking**.

La cause du `P1001` historique reste probablement liée au contexte de pré-rendu
ou à un incident intermittent, mais la présente instrumentation basée sur
`$extends` est elle-même suspectée d'avoir alourdi l'analyse TypeScript/Next.js
avant que le build atteigne les requêtes.

## 2. État initial

- commit conforme ;
- changements limités au périmètre Phase 9 ;
- SQLite SHA-256 :
  `8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec` ;
- `immos` : 222 lignes, `asset_files=0` ;
- `immos_recipe_phase8` : 253 lignes, `asset_files=0` ;
- intégrité relationnelle recette : 0 violation ;
- bucket `asset-files` privé et vide ;
- trois JPEG orphelins présents et inchangés ;
- aucun processus Node ou `psql` ;
- ports 3000 et 3018 libres ;
- aucun secret affiché.

## 3. Cartographie des accès Prisma pendant le build

### Pages applicatives

| Route | Fichier | Statut Next.js observé | Accès Prisma serveur |
|---|---|---|---|
| `/` | `app/page.js` | statique (`○`) | 4 `count()` parallèles |
| `/referentiels` | `app/referentiels/page.js` | dynamique (`ƒ`) | 4 `findMany()` parallèles au runtime |
| `/parc` | `app/parc/page.js` | `force-dynamic` | 6 `findMany()` parallèles au runtime |
| `/parc/[id]` | `app/parc/[id]/page.js` | dynamique | aucun accès Prisma serveur dans la page ; chargement client via API |
| `/documents` | `app/documents/page.js` | `force-dynamic` | 6 `findMany()` parallèles au runtime |
| `/mouvements` | `app/mouvements/page.js` | `force-dynamic` | 5 `findMany()` parallèles au runtime |
| `/_not-found` | générée par Next.js | statique (`○`) | aucun |

Les routes API sont dynamiques (`ƒ`) et ne sont pas exécutées pendant la
génération statique.

### Requêtes du tableau de bord `/`

`getDashboardData()` lance simultanément :

1. `assetUnit.count({ deletedAt: null })`
2. `assetDocument.count({ status: "DRAFT" })`
3. `assetMovement.count({ createdAt >= J-30 })`
4. `assetUnit.count()` avec relation vers la photo principale active

Cette liste correspond aux erreurs du premier build PostgreSQL Phase 9B :

- `assetUnit.count()`
- `assetDocument.count()`
- `assetMovement.count()`
- second `assetUnit.count()`

La page `/` est la seule page démontrée comme pré-rendue statiquement avec accès
à PostgreSQL.

### Metadata et layouts

- `app/layout.js` contient uniquement des metadata statiques ;
- les pages métier utilisent des objets `metadata` statiques ;
- aucun `generateMetadata()` ;
- aucun `generateStaticParams()` ;
- aucun `unstable_cache()` ;
- aucun `fetchCache`, `revalidate` ou `force-static` ;
- aucun accès Prisma au niveau module : les requêtes sont dans les fonctions de
  chargement appelées lors du rendu.

## 4. Cycle de vie Prisma

```text
next build
  └─ worker(s) de build / rendu
      └─ import lib/prisma.js
          ├─ sélection provider=postgresql, client=normal
          ├─ clé globale __inventairePrisma_postgresql_normal
          └─ createPrismaClient()
              └─ generated/prisma-postgresql
                  └─ une instance par processus de worker
                      └─ Supavisor Transaction :6543, schema=immos
```

Constats :

- singleton effectif dans un processus via `globalThis` ;
- un worker distinct possède son propre `globalThis` et peut donc posséder une
  instance distincte ;
- aucun `new PrismaClient()` ailleurs dans `app/` ou `lib/` ;
- aucun `$disconnect()` dans `app/` ou `lib/` ;
- client recipe non sélectionné pendant `build:postgresql` ;
- `connection_limit=1`, `pool_timeout=60`, `pgbouncer=true` sur le client normal ;
- le garde `current_schema()` n'est appelé que dans les transactions d'écriture,
  pas dans les lectures de pré-rendu ;
- aucune extension Prisma métier n'ajoutait de requête aux lectures avant
  l'instrumentation.

## 5. Analyse de la concurrence

### Concurrence applicative

Pour `/`, `Promise.all()` soumet quatre requêtes simultanément au même client.
Le maximum applicatif attendu est donc 4 requêtes actives/pending dans le
processus qui génère `/`.

### Concurrence Next.js

Les builds précédents indiquent trois workers de génération. Toutefois :

- les pages `/parc`, `/documents` et `/mouvements` sont `force-dynamic` ;
- `/referentiels` est classée dynamique ;
- seule `/` combine pré-rendu statique et accès base.

Estimation :

- concurrence par worker sur `/` : 4 ;
- connexions physiques permises par ce client : 1 ;
- autres workers avec lectures PostgreSQL au même instant : non démontrés ;
- maximum théorique si plusieurs pages de données devenaient statiques : supérieur,
  mais non observé dans la configuration actuelle.

## 6. Instrumentation temporaire

Variable d'activation :

```text
APP_BUILD_DB_TRACE=1
```

Inactive par défaut.

Fichiers :

- `lib/build-db-trace.js`
- `lib/prisma-client-factory.js`
- `app/page.js`
- `app/referentiels/page.js`

Fonctionnement prévu :

- contexte de route via `AsyncLocalStorage` ;
- événement de création du client ;
- début, succès ou échec de chaque opération Prisma ;
- PID, client, route, modèle, opération, durée et compteur actif ;
- aucune requête SQL, donnée métier, URL ou credential journalisé ;
- wrapper `$extends` installé uniquement lorsque la variable vaut `1`.

L'abstraction Storage n'est ni appelée ni initialisée par cette instrumentation.

### Résultat effectif

Aucun événement `build_db_client_created` ou `build_db_query_*` n'a été produit.
Le build n'a pas atteint l'instanciation instrumentée ou les requêtes.

## 7. Build diagnostique unique

Commande logique :

```text
APP_BUILD_DB_TRACE=1 npm run build:postgresql
```

Une seule exécution.

- timeout externe : 180 000 ms ;
- durée observée par l'exécuteur : 184 069 ms ;
- code final de l'exécuteur : timeout (`124`) ;
- sortie de build restituée : aucune, en raison du dépassement et du buffering de
  l'exécuteur ;
- premier `P1001` : aucun observé ;
- dernière requête réussie : aucune requête Prisma observée ;
- requêtes simultanées au moment de l'arrêt : 0 observée ;
- route en génération : aucune ;
- processus résiduel : aucun.

Horodatage :

- début approximatif déduit des artefacts `.next` : 11:48:26 locale ;
- `build-diagnostics.json` mis à jour : 11:51:07 locale ;
- arrêt externe environ 184 secondes après le lancement.

Étape exacte attestée par Next.js : `type-checking`, avec `useBuildWorker=true`.

## 8. Comparaison avec les diagnostics précédents

| Phase | Résultat |
|---|---|
| 9B | compilation et TypeScript réussis, puis `P1001` pendant pré-rendu de `/` |
| 9B bis | commande groupée expirée sans sortie après 60,3 s |
| 9B ter | DNS/TCP/TLS/psql 6543 réussis ; harness Prisma invalide |
| 9B quater | trois processus Prisma 6543 isolés réussis |
| 9B quinquies | build interrompu au type-checking avant Prisma/pré-rendu |

## 9. Évaluation des dix hypothèses

### 1. Pages utilisant PostgreSQL inutilement pendant le build

- Pour : `/` lit quatre métriques qui pourraient être calculées au runtime.
- Contre : il est légitime qu'un tableau de bord affiche ces données.
- Probabilité d'implication dans le `P1001` : élevée.

### 2. Pages métier devant être dynamiques

- Pour : les métriques dépendent de données et du temps courant (`J-30`).
- Contre : aucune déclaration dynamique sur `/`.
- Probabilité : élevée ; `/` est actuellement statique alors que son contenu est
  temporel et dépendant de la base.

### 3. Plusieurs PrismaClient instanciés

- Pour : Next.js peut créer une instance par processus worker.
- Contre : singleton correct dans chaque processus ; aucun autre constructeur
  applicatif.
- Probabilité : faible à moyenne.

### 4. Garde `current_schema()` trop fréquent

- Pour : le garde ajoute une requête lors des transactions d'écriture.
- Contre : aucune transaction d'écriture ni garde pendant le pré-rendu.
- Probabilité : très faible.

### 5. Pré-rendu concurrent dépassant la capacité pratique du pooler

- Pour : quatre requêtes sont soumises ensemble ; `connection_limit=1`.
- Contre : le client devrait les mettre en attente et le pooler accepte les tests
  isolés.
- Probabilité : élevée parmi les causes du `P1001` historique.

### 6. Metadata provoquant une seconde lecture

- Pour : aucune preuve.
- Contre : metadata entièrement statiques, aucun `generateMetadata`.
- Probabilité : très faible.

### 7. Dashboard exécutant plusieurs `count()` en parallèle

- Pour : preuve directe dans `app/page.js` et correspondance exacte avec les
  erreurs du build Phase 9B.
- Contre : aucune.
- Probabilité : très élevée.

### 8. Import Storage déclenchant Prisma

- Pour : `/parc` importe `asset-file-service`, qui importe Prisma et Storage.
- Contre : `/parc` est `force-dynamic`; la factory Storage est paresseuse et
  n'appelle ni Prisma ni Supabase au chargement.
- Probabilité : très faible.

### 9. `$disconnect()` prématuré

- Pour : aucune preuve.
- Contre : aucun `$disconnect()` dans le code applicatif.
- Probabilité : très faible.

### 10. Incident purement intermittent du pooler

- Pour : les tests Prisma isolés réussissent ; le premier build a échoué après des
  builds antérieurs réussis.
- Contre : la concurrence spécifique du dashboard fournit aussi une explication.
- Probabilité : moyenne.

## 10. Cause la plus probable

Pour le `P1001` historique :

1. soumission simultanée des quatre comptages de `/` pendant le pré-rendu ;
2. combinée à une connexion physique limitée à 1 et à un pooler intermittent.

Niveau de certitude : moyen. La correspondance route/requêtes est forte, mais
l'unique build instrumenté n'a pas atteint le pré-rendu.

Pour l'arrêt de cette phase : blocage ou lenteur au stade type-checking.
L'instrumentation `$extends`, bien qu'inactive sauf variable, est une hypothèse
plausible d'alourdissement de l'analyse de types Prisma. Niveau de certitude :
faible à moyen.

## 11. Corrections proposées, non appliquées

Correction minimale recommandée pour l'application :

```text
export const dynamic = "force-dynamic";
```

sur `app/page.js`, afin de déplacer les métriques du dashboard au runtime. Cette
page dépend de la base et d'une fenêtre temporelle glissante ; un pré-rendu
statique n'est pas fonctionnellement souhaitable.

Complément possible, seulement si nécessaire après validation :

- remplacer le `Promise.all()` de quatre comptages par une lecture mutualisée ou
  séquentielle adaptée à `connection_limit=1` ;
- conserver le singleton actuel ;
- ne pas modifier le garde transactionnel ;
- ne pas modifier Storage.

Pour un prochain diagnostic, préférer une instrumentation plus légère sans
`$extends` (événements Prisma ou logs ponctuels dans la page), afin d'éviter une
possible surcharge du type-checking.

Aucune correction n'est appliquée dans cette phase.

## 12. Contrôles finaux

- SQLite SHA-256 inchangé :
  `8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec` ;
- `immos` : 222 lignes, `asset_files=0` ;
- recette : 253 lignes, `asset_files=0`, intégrité=0 violation ;
- bucket `asset-files` privé et vide ;
- aucune politique ou donnée modifiée ;
- trois JPEG inchangés :
  - `4ea6fafc0e1dfec5b1763203715f20c00b2b84720c8ff9158a47a06c440fad4a`
  - `ff1a9c1a9ccf30932426389687755d2065074eacaa56948451e03903dac3bd83`
  - `d360445ca40c9e7c6afc77bc7d97a2c30c9f58b766cfb5de50db422bd5d393ec`
- aucun processus Node ou Prisma résiduel ;
- ports 3000 et 3018 libres ;
- aucun secret journalisé ;
- aucun commit créé.

## 13. Fichiers diagnostiques modifiés

Ajouté :

- `lib/build-db-trace.js`

Modifiés uniquement pour la trace conditionnelle :

- `lib/prisma-client-factory.js`
- `app/page.js`
- `app/referentiels/page.js`

Rapport ajouté :

- `SUPABASE_PHASE9B_QUINQUIES_NEXT_BUILD_PRERENDER_DIAGNOSTIC_REPORT.md`

L'instrumentation reste inactive sans `APP_BUILD_DB_TRACE=1`.

## 14. Git final

Aucun commit n'a été créé. Les modifications Phase 9 et les fichiers de
diagnostic restent dans l'arbre de travail pour validation humaine.
