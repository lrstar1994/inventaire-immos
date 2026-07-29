# Phase 9B sexies — Dashboard dynamique et validation finale

Date : 2026-07-29
Commit de référence : `ce4b6c223baf91d82696b3ff87ef35d0167bb8fc`

## 1. Conclusion

La correction minimale est validée.

- la page `/` est désormais dynamique ;
- les quatre métriques restent inchangées et sont calculées au runtime ;
- l'instrumentation diagnostique `$extends` a été entièrement retirée ;
- les 8 tests Storage réussissent ;
- les builds par défaut, SQLite et PostgreSQL réussissent ;
- aucun `P1001` ou `P2028` ;
- aucune donnée ou objet Storage modifié.

Recommandation finale : **Phase 9B prête pour commit après validation humaine**.

## 2. État initial

- commit courant :
  `ce4b6c223baf91d82696b3ff87ef35d0167bb8fc` ;
- SQLite SHA-256 :
  `8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec` ;
- `immos` : 222 lignes, `asset_files=0` ;
- `immos_recipe_phase8` : 253 lignes, `asset_files=0` ;
- intégrité relationnelle recette : 0 violation ;
- bucket `asset-files` privé et vide ;
- trois JPEG orphelins présents et inchangés ;
- aucun processus Node ou `psql` ;
- ports 3000 et 3018 libres ;
- aucun secret exposé.

## 3. Vérification de la page racine

Avant correction, `app/page.js` :

- ne déclarait aucune stratégie dynamique ;
- était classée statique (`○`) par Next.js ;
- calculait quatre métriques uniquement destinées au tableau de bord :
  1. nombre de biens physiques actifs ;
  2. nombre de documents en brouillon ;
  3. nombre de mouvements des 30 derniers jours ;
  4. nombre de biens possédant une photo principale active ;
- lançait ces quatre `count()` avec le même `Promise.all()`.

Ces valeurs dépendent de la base courante et, pour les mouvements, d'une fenêtre
temporelle glissante. Aucun workflow métier, API publique ou besoin SEO critique
n'impose leur génération pendant le build.

## 4. Correction appliquée

Modification exacte dans `app/page.js` :

```js
export const dynamic = "force-dynamic";
```

Avant :

```text
/ : page statique, métriques calculées pendant next build
```

Après :

```text
/ : page dynamique, métriques calculées au runtime
```

Les éléments suivants sont strictement conservés :

- les quatre requêtes Prisma ;
- leurs filtres ;
- leur `Promise.all()` ;
- les textes, cartes et résultats affichés ;
- la gestion native des erreurs PostgreSQL ;
- le composant serveur.

Aucun cache, fallback fictif ou Client Component n'a été ajouté.

## 5. Instrumentation diagnostique

L'instrumentation Phase 9B quinquies était basée sur :

- `APP_BUILD_DB_TRACE=1` ;
- `AsyncLocalStorage` ;
- une extension Prisma `$extends`.

Elle a été entièrement supprimée parce que :

- elle n'était utile qu'au diagnostic ;
- le build instrumenté s'était arrêté au type-checking ;
- `$extends` pouvait alourdir l'inférence des types Prisma ;
- elle modifiait le type concret du client retourné.

Éléments retirés :

- `lib/build-db-trace.js`
- tous les imports et wrappers de `app/page.js`
- tous les imports et wrappers de `app/referentiels/page.js`
- l'extension de `lib/prisma-client-factory.js`

Après suppression :

- aucun `$extends` diagnostique ;
- aucune occurrence `APP_BUILD_DB_TRACE` ;
- aucune création supplémentaire de PrismaClient ;
- `app/referentiels/page.js` et `lib/prisma-client-factory.js` sont revenus à leur
  état antérieur.

Les rapports diagnostiques restent conservés pour la traçabilité.

## 6. Vérification statique Storage

- provider par défaut : `local` ;
- absence de variable : sélection locale ;
- valeur inconnue : erreur explicite ;
- modules privilégiés marqués `server-only` ;
- provider Supabase paresseux ;
- aucune requête Storage au chargement ;
- aucun `getPublicUrl` ;
- aucune clé privilégiée dans un Client Component ;
- URL locale historique :
  `/uploads/assets/{clé-relative}` ;
- aucun accès `asset_files` supplémentaire ;
- aucun import Storage ne provoque une connexion Prisma ou Supabase pendant le
  build.

## 7. Tests Storage

Commande exécutée une seule fois :

```text
npm.cmd run test:storage
```

Résultat :

- 8 tests ;
- 8 réussis ;
- 0 échec ;
- durée Node Test : 274,772 ms ;
- durée du processus : environ 8,7 secondes ;
- aucun appel Supabase réel ;
- aucun objet créé ;
- aucun secret dans la sortie ;
- aucun JPEG modifié.

## 8. Builds

Timeout externe de chaque build : 300 secondes.

### 8.1 Build par défaut

- commande : `npm.cmd run build`
- début : `2026-07-29T12:05:52.1768744+03:00`
- fin : `2026-07-29T12:07:18.6467944+03:00`
- durée : 86 470 ms
- compilation : succès en 53 s
- TypeScript : succès en 6,9 s
- génération : 20/20 pages statiques en 2,3 s
- résultat : succès
- `/` : dynamique

### 8.2 Build SQLite explicite

- commande : `npm.cmd run build:sqlite`
- début : `2026-07-29T12:07:29.9809499+03:00`
- fin : `2026-07-29T12:08:03.8803643+03:00`
- durée : 33 899 ms
- compilation : succès en 17,2 s
- TypeScript : succès en 909 ms
- génération : 20/20 pages statiques en 456 ms
- résultat : succès
- `/` : dynamique

### 8.3 Build PostgreSQL

- commande : `npm.cmd run build:postgresql`
- début : `2026-07-29T12:08:23.9686965+03:00`
- fin : `2026-07-29T12:08:58.6881187+03:00`
- durée : 34 719 ms
- compilation : succès en 16,3 s
- TypeScript : succès en 475 ms
- génération : 20/20 pages statiques en 1 187 ms
- résultat : succès
- `P1001` : aucun
- `P2028` : aucun
- `/` : dynamique
- client recipe : non sélectionné
- écriture PostgreSQL : aucune
- opération Storage : aucune

Le build ne lance plus les quatre `count()` du dashboard : `/` est exclue de la
génération statique et rendue à la demande. Le schéma normal `immos` reste celui
du client PostgreSQL ; son bon routage avait été confirmé par le diagnostic
Prisma 6543 précédent.

### 8.4 `git diff --check`

Résultat : succès.

L'avertissement Turbopack NFT déjà connu reste présent et non bloquant. Il est
hors périmètre de cette phase.

## 9. Tableau final des routes

```text
ƒ /
○ /_not-found
ƒ /api/asset-categories
ƒ /api/asset-categories/[id]
ƒ /api/asset-documents
ƒ /api/asset-documents/[id]
ƒ /api/asset-documents/[id]/cancel
ƒ /api/asset-documents/[id]/validate
ƒ /api/asset-documents/from-entries
ƒ /api/asset-duplicate-check
ƒ /api/asset-entries
ƒ /api/asset-entries/[id]
ƒ /api/asset-files
ƒ /api/asset-files/[id]
ƒ /api/asset-items
ƒ /api/asset-items/[id]
ƒ /api/asset-movement-options
ƒ /api/asset-movements
ƒ /api/asset-movements/[id]
ƒ /api/asset-movements/[id]/cancel
ƒ /api/asset-movements/[id]/validate
ƒ /api/asset-options
ƒ /api/asset-units
ƒ /api/asset-units/[id]
ƒ /api/asset-units/[id]/files
ƒ /api/document-options
ƒ /api/health
ƒ /api/locations
ƒ /api/locations/[id]
ƒ /api/roles
ƒ /api/suppliers
ƒ /api/suppliers/[id]
ƒ /api/users
ƒ /api/users/[id]
ƒ /documents
ƒ /mouvements
ƒ /parc
ƒ /parc/[id]
ƒ /referentiels
```

Seule `/_not-found` est statique. Aucune route métier lisant PostgreSQL n'est
pré-rendue.

## 10. Cause historique probable

La correspondance suivante est désormais validée par le résultat avant/après :

- avant : `/` statique, quatre lectures simultanées, `P1001` pendant son
  pré-rendu ;
- après : `/` dynamique, aucune lecture dashboard pendant le build, build
  PostgreSQL réussi.

Conclusion : le `P1001` historique était lié au contexte du pré-rendu de `/`,
favorisé par les quatre lectures simultanées et `connection_limit=1`, possiblement
combiné à une intermittence du pooler.

Niveau de certitude : élevé pour la suppression du déclencheur de build ; moyen à
élevé pour la cause réseau interne exacte.

## 11. Contrôles finaux protégés

- SQLite SHA-256 avant/après :
  `8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec` ;
- `immos` avant/après : 222 lignes ;
- `immos.asset_files` : 0 ;
- recette avant/après : 253 lignes ;
- recette `asset_files` : 0 ;
- intégrité relationnelle recette : 0 violation ;
- bucket `asset-files` privé et vide ;
- aucune politique ajoutée ou modifiée ;
- aucune URL signée réelle ;
- aucun upload ou suppression Storage ;
- trois JPEG inchangés :
  - `4ea6fafc0e1dfec5b1763203715f20c00b2b84720c8ff9158a47a06c440fad4a`
  - `ff1a9c1a9ccf30932426389687755d2065074eacaa56948451e03903dac3bd83`
  - `d360445ca40c9e7c6afc77bc7d97a2c30c9f58b766cfb5de50db422bd5d393ec`
- aucun fichier local déplacé, renommé ou supprimé ;
- aucun processus Node, Prisma ou `psql` résiduel ;
- ports 3000 et 3018 libres ;
- aucun secret exposé ;
- aucun commit créé.

## 12. Fichiers finaux Phase 9B

### Modifiés

- `.env.example`
- `app/page.js`
- `lib/asset-file-service.js`
- `package.json`

### Ajoutés pour l'abstraction

- `lib/storage/config.js`
- `lib/storage/errors.js`
- `lib/storage/file-validation.js`
- `lib/storage/get-file-storage-provider.js`
- `lib/storage/index.js`
- `lib/storage/local-file-storage-provider.js`
- `lib/storage/storage-key.js`
- `lib/storage/storage-provider-factory.js`
- `lib/storage/supabase-storage-provider.js`
- `lib/storage/types.js`
- `scripts/test-file-storage-abstraction.mjs`

### Diagnostic conservé

- `scripts/diagnose-prisma-pooler-6543.mjs`
- rapports Phase 9A et Phase 9B bis à sexies

### Diagnostic supprimé

- `lib/build-db-trace.js`
- instrumentation temporaire de la factory et des pages

## 13. Git final

Aucun commit n'a été créé. L'arbre de travail contient les changements Phase 9 et
les rapports de traçabilité pour validation humaine.

## 14. Recommandation

**Phase 9B prête pour commit après validation humaine.**

Ne pas commencer la Phase 9C ni la migration réelle des fichiers avant cette
validation.
