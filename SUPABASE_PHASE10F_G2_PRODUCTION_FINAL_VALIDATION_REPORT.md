# Phase 10F-G2 — Reprise de la validation finale sur PostgreSQL Production

## Statut

**PHASE 10F-G2 NON VALIDÉE — CONNEXION PRODUCTION INDISPONIBLE**

## Résumé exécutif

La reprise a été arrêtée au prévol Production, avant tout démarrage Next.js et avant toute écriture. Le premier et unique essai du prévol via `SUPABASE_DATABASE_URL`, Transaction pooler 6543, a retourné Prisma P1001.

Conformément aux règles de la phase :

- aucun retry automatique n'a été effectué ;
- aucun canal 5432 n'a été utilisé ;
- `SUPABASE_DIRECT_URL` n'a pas été utilisée par le runtime ;
- aucun serveur Next.js n'a été démarré ;
- aucune recette Auth, UX, lecture fonctionnelle ou CRUD n'a été engagée.

## Rappel du blocage initial et canal demandé

- Le blocage 10F-G initial concernait le Session pooler 5432.
- La Phase 10F-G1 avait qualifié le Transaction pooler 6543.
- La reprise G2 a utilisé le contrat Production attendu :
  - variable `SUPABASE_DATABASE_URL` ;
  - port 6543 ;
  - Transaction pooler ;
  - `sslmode=require` ;
  - `pgbouncer=true` ;
  - `connection_limit=1` ;
  - `pool_timeout=60` ;
  - schéma `immos` ;
  - client `generated/prisma-postgresql`.

Aucune URL complète, aucun hôte complet et aucun secret ne sont reproduits dans ce rapport.

## État Git initial

- HEAD : `6244fdc58b6e908ea3a7483a9e3a0abe313aaf84`.
- Commit : `6244fdc feat(auth): secure Supabase authorization and recipe validation`.
- Les modifications applicatives 10F-UX, les scripts 10F-G1 et les rapports historiques non suivis étaient présents comme attendu.
- Aucun changement de `schema.prisma` ou des migrations n'a été détecté.
- `git diff --check` était réussi.

## États locaux avant prévol

- SQLite : SHA-256 `9645a17ea36adfba0c8964fbf536c47a323d22f606896112f4ed62334882d5ed`, conforme.
- `.env.local` : ignoré par Git.
- Ports 3000 et 3001 : libres.
- Aucun serveur Next.js n'était actif.

Les états distants de référence au début de la phase étaient ceux validés en 10F-G1 :

- Recipe : 253 lignes métier, 13 AssetUnit, 0 AssetFile, 0 FK orpheline ;
- Production : 222 lignes métier, 12 AssetUnit, 0 AssetFile, 0 FK orpheline ;
- Storage : bucket privé et vide ;
- Auth : inchangé.

## Prévol Production réel

Commande exécutée dans un processus isolé avec les sélecteurs Production :

- `APP_DATABASE_PROVIDER=postgresql` ;
- `APP_PRISMA_CLIENT=normal` ;
- script `scripts/preflight-postgresql-production.mjs`.

Résultat : échec Prisma P1001 lors de l'ouverture de la connexion au Transaction pooler 6543.

Le prévol n'a donc pas pu confirmer pendant cette tentative :

- `current_schema() = immos` ;
- les compteurs 222 / 12 / 0 ;
- les FK orphelines ;
- l'enum `StorageProvider` ;
- les quatre colonnes Storage.

Le diagnostic final distant prévu dans la même séquence a rencontré le même défaut de connexion. Il n'a effectué aucune mutation.

## Étapes non exécutées

En raison de l'arrêt obligatoire, les étapes suivantes n'ont pas été lancées et ne sont pas déclarées réussies :

- démarrage Production ;
- validation anonyme ;
- validation des quatre rôles ;
- validation desktop, tablette et mobile ;
- session, changement de compte et déconnexion ;
- lectures fonctionnelles ;
- CRUD synthétique ;
- transaction synthétique et rollback ;
- contrôles Prisma finaux ;
- build PostgreSQL Production ;
- recette fonctionnelle Production.

## Données et nettoyage

Aucun identifiant de campagne n'a été créé car la phase s'est arrêtée avant la préparation des écritures.

- aucune donnée synthétique créée ;
- aucune donnée métier modifiée ;
- aucune liaison Auth temporaire créée ;
- aucun nettoyage distant nécessaire ;
- aucune écriture Storage ;
- aucune URL signée générée ;
- aucune migration ou modification Prisma.

Comme aucune connexion distante n'a abouti pendant G2, les compteurs distants finaux ne peuvent pas être revalidés dans cette phase. L'absence totale de commande mutante garantit néanmoins que G2 n'a produit aucun changement distant.

## Tests et build

Les suites fonctionnelles, builds et contrôles distants supplémentaires n'ont pas été exécutés après l'échec du prévol. Continuer aurait contrevenu à l'instruction d'arrêt immédiat et aurait masqué l'indisponibilité réelle du canal Production.

## Fichiers créés ou modifiés par G2

- Créé : `SUPABASE_PHASE10F_G2_PRODUCTION_FINAL_VALIDATION_REPORT.md`.
- Aucun code métier, test, schéma Prisma, migration ou configuration n'a été modifié par G2.

## Sécurité et état final

- Aucun secret n'a été écrit dans le rapport.
- Aucun fichier d'environnement n'a été suivi.
- SQLite est restée inchangée.
- Aucun serveur Next.js n'a été démarré.
- Aucune écriture Production, Recipe, Storage ou Auth n'a été exécutée.
- Aucun commit, push ou tag n'a été effectué.

## Condition de reprise

Reprendre G2 uniquement lorsque le prévol Production réussit dès son essai contrôlé sur `SUPABASE_DATABASE_URL` / 6543. La reprise devra recommencer par l'intégralité des contrôles protégés avant toute validation fonctionnelle ou écriture synthétique.

## Reprise immédiate du 6 août 2026 après prévol validé

L'utilisatrice a confirmé hors de cette exécution :

- `PRODUCTION_PREFLIGHT_OK` ;
- provider PostgreSQL ;
- client `generated/prisma-postgresql` ;
- Transaction pooler 6543 ;
- schéma `immos` ;
- Production 222 / 12 / 0 ;
- 0 FK orpheline ;
- quatre colonnes Storage et deux valeurs d'enum conformes ;
- Next.js prêt en 4,3 secondes.

La reprise a donc commencé directement à l'étape suivant le prévol, sans relancer les contrôles réseau déjà validés.

### Préparation de la campagne

Le validateur fonctionnel existant a reçu un mode Production explicite et restrictif :

- `PHASE10F_TARGET=production` obligatoire ;
- `SUPABASE_DATABASE_URL` uniquement ;
- port 6543 et schéma `immos` vérifiés ;
- client `generated/prisma-postgresql` ;
- liaison temporaire contrôlée du compte Auth de test ;
- vérification prévue des quatre rôles ;
- rollback synthétique prévu ;
- CRUD préfixé et nettoyage transactionnel idempotent ;
- contrôles croisés Recipe/Production et empreinte SQLite.

Fichier de diagnostic adapté : `scripts/validate-phase10f-f-functional-recipe.mjs`. Aucun code applicatif, schéma Prisma ou migration n'a été modifié par cette adaptation.

### Résultat de la reprise

Le serveur confirmé par l'utilisatrice répondait bien sur `/connexion`. Cependant, le validateur s'est arrêté sur sa **première lecture Prisma**, avant toute sélection ou modification de profil, avec un nouveau P1001 sur le Transaction pooler 6543.

Conséquences vérifiées :

- aucune liaison `externalAuthId` créée ;
- aucun préfixe de campagne créé en base ;
- aucune donnée synthétique créée ;
- aucun CRUD exécuté ;
- aucune transaction d'écriture ouverte ;
- aucun rôle ou compte Auth modifié ;
- aucun objet Storage touché.

Conformément à l'arrêt obligatoire, aucune seconde tentative n'a été effectuée. Les validations anonyme, quatre rôles, UX, fonctionnelles et CRUD restent non exécutées et non validées.

Le processus Next.js confirmé sur le port 3000 a été arrêté. Les ports 3000 et 3001 sont libres.

### État local après arrêt

- SQLite : SHA-256 toujours égal à `9645a17ea36adfba0c8964fbf536c47a323d22f606896112f4ed62334882d5ed`.
- Schéma Prisma : inchangé.
- Migration : aucune.
- `git diff --check` : réussi.
- Commit, push et tag : aucun.

Les états distants ne sont pas déclarés relus après l'échec P1001. L'absence de toute commande mutante pendant la reprise garantit que cette exécution n'a pas modifié Production, Recipe, Storage ou Auth.

## Conclusion finale de G2

**PHASE 10F-G2 NON VALIDÉE — CONNEXION PRODUCTION INDISPONIBLE**
