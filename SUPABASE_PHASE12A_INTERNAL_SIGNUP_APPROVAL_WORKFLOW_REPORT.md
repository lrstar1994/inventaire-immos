# Phase 12A — Inscription interne avec validation par la Direction

## Statut

**PHASE 12A NON VALIDÉE — RECETTE RECIPE BLOQUÉE PAR LA CONNECTIVITÉ**

L’implémentation locale, les tests et le build sont conformes, mais le statut de réussite demandé ne peut pas être prononcé : le prévol PostgreSQL Recipe a échoué avant toute migration et toute écriture. Aucun compte Auth de test n’a été créé et aucune recette réelle n’a été déclarée réussie.

> Addendum Phase 12A-P : la migration additive Production a ensuite été appliquée et contrôlée sur `immos`, sans modification de ligne. La recette Recipe reste non exécutée et le statut 12A demeure donc non validé.

## Audit de l’existant

### Authentification

- `/connexion` utilise une Server Action et le client Supabase serveur avec cookies.
- La connexion appelle `signInWithPassword`; la déconnexion appelle `signOut({ scope: "local" })`.
- Le service role n’est utilisé ni pour login/logout ni par le nouveau workflow.
- Le client navigateur existe mais n’est pas nécessaire à l’inscription : la Server Action utilise le client utilisateur serveur officiel.
- Les redirections passent par `normalizeInternalReturnPath`.

### Autorisation

- `getCurrentAppUser()` relit l’utilisateur Auth réel puis recherche `User` avec `authProvider = supabase` et `externalAuthId`.
- Avant 12A, un compte Auth sans profil retournait `not_authorized`.
- Seul un `User` non supprimé, `ACTIVE`, avec rôle reconnu reçoit des permissions.
- `authorizePrivatePage` redirige l’anonyme et retourne les autres refus au composant `AccessDenied`.
- Les API utilisent `authorizeApiRequest`; `users.manage` appartient uniquement à DIRECTION.

### Modèle User initial

- statuts initiaux : `ACTIVE`, `DISABLED` ; aucun statut d’attente ;
- email obligatoire et unique ;
- nom obligatoire ;
- rôle obligatoire avec défaut `BASIC_USER` ;
- `authProvider` obligatoire avec défaut `local` ;
- `externalAuthId` nullable et seulement indexé avant 12A ;
- suppression logique par `deletedAt` ;
- dates automatiques `createdAt` et `updatedAt`.

### Interface DIRECTION

- `/users` est protégé côté serveur par `users.manage` avant toute lecture Prisma ;
- liste, création, modification et désactivation logique existaient ;
- aucune gestion de mot de passe ou création Auth.

## Statut d’attente retenu

`PENDING` est ajouté à `UserStatus` dans les trois schémas Prisma.

Règle d’autorisation :

- `PENDING` retourne le statut applicatif `pending` avec `user: null` ;
- aucune permission, pas même `app.read`, n’est calculée ;
- `BASIC_USER` sert uniquement de valeur technique compatible dans la ligne en attente ;
- ce rôle ne devient effectif qu’après passage explicite à `ACTIVE` ;
- `DISABLED`, suppression logique, rôle invalide et profil absent restent default deny.

## Évolution additive préparée

Deux migrations PostgreSQL distinctes sont préparées :

- Production : `prisma/postgresql/migrations/20260807090000_add_pending_user_access_requests/migration.sql` ;
- Recipe : `prisma/postgresql-recipe/migrations/20260807090000_add_pending_user_access_requests/migration.sql`.

Elles :

- ajoutent `PENDING` à l’enum du schéma explicitement ciblé ;
- remplacent l’index simple `external_auth_id` par un index unique ;
- sont transactionnelles ;
- ne contiennent aucune mutation de ligne métier ;
- ne mélangent jamais `immos` et `immos_recipe_phase8`.

La migration Recipe n’a pas été appliquée, car le prévol réseau a échoué. La migration Production n’a pas été appliquée et ne doit l’être qu’après validation Recipe.

SQLite n’a reçu aucune migration physique : son fichier reste intact. Le schéma Prisma déclare néanmoins le contrat PENDING et l’unicité future.

## Workflow d’inscription

### Interface

- lien « Créer un compte » ajouté à `/connexion` ;
- page publique `/inscription` ;
- champs : nom, email, mot de passe, confirmation ;
- aucun rôle demandé ;
- mot de passe minimal de 8 caractères, maximum 1024 ;
- nom/email obligatoires et bornés ;
- confirmation identique ;
- redirection interne normalisée ;
- erreurs publiques assainies.

### Création Auth et demande métier

La Server Action appelle `executeSignup()` :

1. validation stricte ;
2. précontrôle de l’email métier pour éviter un compte Auth orphelin évident ;
3. `auth.signUp({ email, password })` avec le client utilisateur ;
4. refus des réponses Supabase indiquant une identité déjà existante ;
5. transaction Prisma vérifiant email et `externalAuthId` ;
6. création avec `authProvider = supabase`, `status = PENDING`, rôle technique `BASIC_USER` ;
7. aucune permission accordée.

Si Supabase exige la confirmation email, l’interface demande de confirmer puis de se connecter. Aucun paramètre global Auth n’est modifié et aucune notification email applicative n’est ajoutée.

### Échec entre Auth et base

Supabase Auth et PostgreSQL ne peuvent pas partager une transaction atomique. En cas d’échec métier après `signUp` :

- le compte Auth reste sans accès par default deny ;
- un message neutre demande de contacter la Direction ;
- aucun rôle n’est attribué ;
- la reprise doit vérifier l’absence de profil puis recréer explicitement la demande ou supprimer manuellement le compte Auth orphelin ;
- aucun nettoyage service-role automatique n’est introduit.

## Écran PENDING

`AccessDenied` distingue maintenant `pending` et affiche :

- « Demande d’accès en attente » ;
- confirmation que le compte est créé ;
- validation Direction encore requise ;
- bouton Déconnexion.

Le shell privé retourne seulement les enfants tant que le statut n’est pas `authorized` : aucun sidebar, menu ou donnée métier n’est affiché.

## Validation par DIRECTION

Une route dédiée `POST /api/users/[id]/approve` :

- exige `users.manage` ;
- accepte uniquement un rôle explicite parmi les quatre rôles validés ;
- exige que la cible soit encore `PENDING` et non supprimée ;
- met atomiquement `status = ACTIVE`, le rôle choisi et `updatedById` ;
- écrit l’audit `USER_ACCESS_APPROVED` dans la même transaction ;
- ne modifie ni email ni mot de passe Supabase Auth.

L’interface `/users` ajoute « Demandes en attente » avec nom, email, date, choix de rôle sans présélection, validation confirmée et refus par désactivation logique existante.

## Sécurité des rôles

- DIRECTION seul possède `users.manage` ;
- DIRECTION seul peut atteindre la route d’approbation ;
- les quatre rôles peuvent être attribués uniquement par choix explicite de DIRECTION ;
- PENDING ne possède aucune permission ;
- BASIC_USER reste lecture seule une fois ACTIVE ;
- MAINTENANCE_MANAGER reste gestionnaire restreint ;
- INVENTORY_MANAGER reste gestionnaire sans `users.manage` ;
- aucune valeur de rôle provenant de l’inscription n’est lue ou acceptée.

## Doublons

- email métier : contrainte unique existante plus précontrôle avant `signUp` ;
- `externalAuthId` : unicité ajoutée aux schémas et migrations ;
- transaction de création : double vérification email/UUID ;
- réponse Auth sans nouvelle identité : traitée comme compte existant ;
- message public propose la connexion sans révéler de détail sensible.

## Tests

- suite locale finale : **237/237 réussis** ;
- tests 12A : 12 ;
- deux contrôles dédiés vérifient les trois schémas et le ciblage strict des migrations ;
- aucun test réseau réel n’est compté comme réussi.

Couverture : validation des champs, inscription mockée, PENDING, default deny, doublons, écran sans shell, logout, route Direction, quatre rôles, absence de présélection, migrations additives et absence de secret.

## Builds et contrôles locaux

- trois clients Prisma régénérés avec le nouveau contrat ;
- build PostgreSQL : génération réussie, arrêt au prévol Production P1001 réseau connu ;
- build SQLite : réussi ;
- TypeScript : réussi ;
- routes `/inscription` et `/api/users/[id]/approve` présentes ;
- démarrage SQLite : réussi ;
- `GET /inscription` : 200 ;
- `GET /connexion` : 200 ;
- GET sur approbation : 405 ;
- POST anonyme sur approbation : 401 ;
- serveur arrêté.

## Recette PostgreSQL Recipe

Le prévol `dev:postgresql:recipe` a échoué avant toute écriture avec le message réseau protégé existant : PostgreSQL Supabase Recipe était injoignable depuis le réseau courant.

En conséquence :

- aucune migration Recipe appliquée ;
- aucun compte Auth de test créé ;
- aucune ligne PENDING réelle créée ;
- aucune validation DIRECTION réelle ;
- aucun nettoyage nécessaire ;
- Production, Recipe, Auth et Storage n’ont subi aucune mutation.

La recette à reprendre lorsque Recipe est joignable reste : migration additive Recipe, création d’un compte dédié, confirmation éventuelle, état PENDING, refus métier, validation Direction avec chaque rôle utile, reconnexion, vérification des permissions, puis suppression complète du profil et du compte Auth de test.

## Fichiers créés

- `app/inscription/page.js`
- `app/inscription/signup-form.js`
- `app/api/users/[id]/approve/route.js`
- `lib/supabase/signup-flow.js`
- les deux migrations PostgreSQL 12A
- `scripts/test-internal-signup-approval.mjs`
- ce rapport

## Fichiers modifiés

- `app/connexion/page.js`
- `app/connexion/actions.js`
- `app/components/access-denied.js`
- `app/users/page.js`
- `app/users/user-manager.js`
- `lib/authorization.js`
- les trois schémas Prisma

## État final et confirmations

- SQLite physiquement inchangée ;
- Production inchangée ;
- Recipe inchangée ;
- Storage inchangé ;
- Auth inchangé ;
- aucune élévation de privilège ;
- aucun secret ajouté ;
- aucune notification email applicative ajoutée ;
- aucun commit, push ou déploiement.

## Conclusion

**PHASE 12A NON VALIDÉE — RECETTE RECIPE BLOQUÉE PAR LA CONNECTIVITÉ**

L’implémentation est prête pour reprise, mais le statut attendu « PHASE 12A VALIDÉE — INSCRIPTION INTERNE ET VALIDATION DIRECTION OPÉRATIONNELLES » reste interdit tant que la migration et le workflow réel n’ont pas été validés puis nettoyés sur PostgreSQL Recipe.
