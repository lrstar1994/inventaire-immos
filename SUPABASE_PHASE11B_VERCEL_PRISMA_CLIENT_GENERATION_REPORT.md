# Phase 11B — Compatibilité des clients Prisma avec le build Vercel

## Statut

**PHASE 11B VALIDÉE — CLIENTS PRISMA GÉNÉRÉS POUR LE BUILD VERCEL**

## Résumé exécutif

Le build PostgreSQL importait statiquement trois clients Prisma depuis `lib/prisma-client-factory.js`, alors que son étape de préparation ne générait que le client PostgreSQL Production. Dans un checkout Vercel propre, `generated/` est ignoré par Git et le client Recipe était donc absent. Turbopack devait néanmoins résoudre l'import statique `@/generated/prisma-recipe`, ce qui produisait l'erreur `Module not found` avant que le runtime actif puisse sélectionner le client Production.

La correction retenue génère explicitement et séquentiellement les trois clients requis avant le prévol et avant Next.js. Aucun chargement dynamique complexe n'a été introduit et la factory reste inchangée.

## État et audit

- HEAD de travail : `f874a3f28101fa79311388d363f8e95ede4fb899` (`fix: support Vercel environment variables during PostgreSQL build`).
- `lib/prisma-client-factory.js` importe statiquement les trois sorties Prisma.
- `.gitignore` exclut `/generated/`; un checkout propre ne peut donc pas compter sur des clients déjà présents.
- `scripts/run-next-with-database.mjs` ne générait auparavant que le schéma PostgreSQL Production.
- Aucun schéma Prisma et aucune migration n'ont été modifiés.

## Schémas et sorties confirmés

| Runtime | Schéma Prisma | Provider | Variable requise | Sortie existante |
|---|---|---|---|---|
| SQLite | `prisma/schema.prisma` | SQLite | `DATABASE_URL` | `generated/prisma-lot6` |
| PostgreSQL Production | `prisma/postgresql/schema.prisma` | PostgreSQL, schéma `immos` | `SUPABASE_DIRECT_URL` pour la génération | `generated/prisma-postgresql` |
| PostgreSQL Recipe | `prisma/postgresql-recipe/schema.prisma` | PostgreSQL, schéma `immos_recipe_phase8` | `SUPABASE_DIRECT_URL` pour la génération | `generated/prisma-recipe` |

Les noms et chemins proviennent directement des blocs `generator client` existants. Aucun dossier de sortie n'a été inventé.

## Solutions comparées

### A — Générer les trois clients avant le build

- Avantages : correction minimale, compatible avec les imports statiques existants, comportement reproductible sur Vercel et localement, aucun changement de frontière serveur/client.
- Coût : quelques secondes supplémentaires de génération au build.
- Risque : faible ; les générations sont déterministes et ne réalisent ni migration ni écriture de données.

### B — Charger dynamiquement uniquement le client actif

- Avantages : pourrait réduire les artefacts générés pour un runtime donné.
- Risques : refonte plus large de la factory, résolution dynamique par Turbopack à sécuriser, contrats synchrones et cache des clients à réexaminer, risque de régression sur les trois runtimes.

**Choix : option A**, conformément au principe de correction minimale de cette phase. L'option B n'est pas nécessaire pour rendre le build reproductible.

## Modification réalisée

Pour `npm run build:postgresql`, `scripts/run-next-with-database.mjs` :

1. conserve les variables déjà validées et préparées par le chargeur 11A ;
2. transmet `DATABASE_URL` et `SUPABASE_DIRECT_URL` au processus de génération sans en afficher les valeurs ;
3. exécute séquentiellement :
   - `prisma generate --schema prisma/schema.prisma` ;
   - `prisma generate --schema prisma/postgresql/schema.prisma` ;
   - `prisma generate --schema prisma/postgresql-recipe/schema.prisma` ;
4. refuse le build si une génération échoue ;
5. conserve ensuite le prévol PostgreSQL Production strict existant, puis Next.js seulement si le prévol réussit.

Aucune commande `prisma migrate` ou `prisma db push` n'est exécutée.

## Fichiers concernés

### Modifiés

- `scripts/run-next-with-database.mjs`
- `scripts/test-supabase-env-loader.mjs`

### Créé

- `SUPABASE_PHASE11B_VERCEL_PRISMA_CLIENT_GENERATION_REPORT.md`

### Explicitement inchangés

- `lib/prisma-client-factory.js`
- les trois schémas Prisma
- les migrations
- `package.json` et `package-lock.json`
- `.env`, `.env.local` et la configuration Vercel
- les données SQLite et distantes

## Tests et validations

### Tests ciblés

- validation syntaxique du lanceur : réussie ;
- tests du chargeur et du prévol Production : **10/10 réussis** ;
- le test vérifie les trois chemins de schéma, la transmission des variables nécessaires et l'ordre génération avant prévol.

### Suite complète locale

- **213/213 tests réussis** ;
- **0 échec**.

### Build PostgreSQL isolé sans `.env.local`

Un isolat propre a été préparé sans dossier `generated/` et sans `.env.local`.

- Une tentative d'installation totalement indépendante par `npm install` n'a produit aucune progression exploitable dans la fenêtre locale, en raison de l'accès réseau au registre ; elle a été arrêtée proprement et l'isolat supprimé.
- Le scénario a ensuite été rejoué dans un nouvel isolat propre, avec les dépendances déjà installées montées depuis le workspace, sans réutiliser `generated/`.
- Les trois clients ont été générés avec succès et leurs entrées `index.js` ont été confirmées présentes avant la suite du build.
- L'erreur `Can't resolve '@/generated/prisma-recipe'` n'est plus reproduite.
- Le build s'est arrêté ensuite au prévol Production avec **Prisma P1001 sur le canal distant 6543**. Cet arrêt intervient après la génération réussie des trois clients et relève uniquement de la connectivité locale déjà connue ; Next.js n'a donc pas été lancé dans cet essai isolé.

Cette limite réseau ne masque pas le résultat recherché en 11B : un checkout dépourvu de `generated/` produit bien les trois modules statiquement importés avant le prévol.

### Build SQLite et TypeScript

- `npm run build:sqlite` : **réussi** ;
- compilation Next.js : réussie ;
- contrôle TypeScript intégré au build : **réussi** ;
- génération des pages : réussie.

## Avertissement Turbopack / NFT

Le build SQLite émet encore un avertissement non bloquant `Encountered unexpected file in NFT list`. La trace observée traverse le client Prisma SQLite et la factory ; l'audit demandé signale également le provider LOCAL, dont les opérations `fs/path` reposent sur `public/uploads/assets`.

Cet avertissement n'empêche ni la compilation ni TypeScript. Il n'est pas corrigé dans 11B afin de ne pas élargir la phase. Le provider LOCAL reste un risque à traiter séparément pour un hébergement Vercel à système de fichiers éphémère ; le runtime PostgreSQL/Storage server-only demeure la cible d'hébergement.

## Contrôles de sécurité et d'intégrité

- `git diff --check` : réussi ;
- aucun `.env` ou `.env.local` dans le diff ;
- `.env.local` reste ignoré par Git ;
- `/generated/` reste ignoré par Git ;
- aucun secret réel, mot de passe, jeton, cookie, URL PostgreSQL complète ou URL signée ajouté ;
- aucun schéma Prisma modifié ;
- aucune migration créée ;
- aucune donnée locale ou distante modifiée ;
- aucune connexion d'écriture effectuée ;
- empreinte SQLite finale : `9645a17ea36adfba0c8964fbf536c47a323d22f606896112f4ed62334882d5ed`, conforme à la référence ;
- aucun commit, aucun push et aucun déploiement effectués.

## Conclusion

**PHASE 11B VALIDÉE — CLIENTS PRISMA GÉNÉRÉS POUR LE BUILD VERCEL**
