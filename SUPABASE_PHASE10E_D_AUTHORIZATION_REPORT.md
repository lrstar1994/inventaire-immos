# Phase 10E-D — Autorisation applicative et protection des accès

## Architecture retenue avant modification

L’audit préalable retient une autorisation propre à Inventaire Immos, distincte
de Supabase Auth :

1. Supabase Auth établit uniquement l’identité (`user.id`) ;
2. le serveur recherche explicitement une ligne `User` du backend métier actif
   avec `authProvider = "supabase"` et `externalAuthId = user.id` ;
3. l’absence de ligne, une correspondance multiple, `deletedAt` renseigné ou un
   statut inactif ferment l’accès ;
4. le rôle est lu exclusivement depuis la ligne métier, jamais depuis le
   navigateur, l’email ou `user_metadata` ;
5. les permissions sont calculées dans un module server-only central ;
6. les pages, routes API et mutations sensibles appliquent cette autorité côté
   serveur.

Les rôles existants sont projetés sans migration :

- `DIRECTION` → `admin` ;
- `INVENTORY_MANAGER` → `gestionnaire` ;
- `MAINTENANCE_MANAGER` → `gestionnaire`, avec ses permissions historiques
  plus restreintes ;
- `BASIC_USER` → `lecture_seule`.

Cette projection conserve les données et règles existantes. Aucun rôle n’est
accordé à la première connexion. Le compte Auth de recette reste donc
authentifié mais non autorisé tant qu’une association humaine explicite n’est
pas effectuée.

## Résumé exécutif

La fondation d’autorisation est en place sans migration et sans attribution de
rôle. Supabase Auth fournit l’identité ; la ligne `User` du backend actif fournit
l’appartenance, l’état et le rôle Inventaire Immos. L’accès est refusé par
défaut. Six pages métier et toutes les API privées sont gardées côté serveur.
`/connexion` et `/api/health` restent publics.

Le compte Auth de recette ne reçoit aucun accès automatiquement. Aucun paramètre
global Supabase Auth, aucune donnée et aucune policy n’ont été modifiés.

## État Git avant modification

- HEAD : `b1bd83da955f55cbee8a773684eea1dc0933587c`
- commit : `feat: add deferred asset file purge service`
- changements non commités 10E-B/10E-C attendus présents ;
- rapports historiques non suivis présents ;
- `git diff --check` réussi ;
- aucun fichier d’identifiants suivi.

## Audit de l’architecture existante

### Clients et session

- client navigateur : clé publique uniquement ;
- client serveur : session utilisateur et cookies ;
- client service-role : `server-only`, non utilisé pour login/logout ;
- `getCurrentUser()` valide l’utilisateur auprès d’Auth ;
- proxy limité au rafraîchissement de `/connexion` ;
- aucune protection globale avant cette phase.

### Identité historique

`lib/request-user.js` acceptait `x-user-id` et, en son absence, sélectionnait le
premier utilisateur `DIRECTION` actif. Ce fallback permettait un contournement
complet de l’autorisation. Il est supprimé. L’acteur provient désormais
uniquement de la session Auth puis de l’association métier explicite.

### Prisma et backends

Les schémas SQLite, PostgreSQL production et recette possèdent déjà :

- `User.externalAuthId` ;
- `User.authProvider` ;
- `User.status` ;
- `User.deletedAt` ;
- `User.role`.

Ils suffisent au modèle minimal. Aucune migration n’est nécessaire. Le helper
utilise le client Prisma déjà sélectionné par le backend actif.

## Pages publiques identifiées

- `/connexion` ;
- ressources Next.js statiques ;
- `/api/health`, qui ne retourne aucune donnée métier.

## Pages privées identifiées et protégées

- `/` ;
- `/parc` ;
- `/parc/[id]` ;
- `/documents` ;
- `/mouvements` ;
- `/referentiels`.

Chaque page appelle la garde server-only avant sa première lecture Prisma. Les
pages utilisant la session sont rendues dynamiquement. Un utilisateur non
connecté est redirigé vers `/connexion` avec un `returnTo` interne normalisé.
Un utilisateur connecté mais sans appartenance, inactif ou avec une
configuration invalide reçoit un état explicite sans être déconnecté de
Supabase.

## Server Actions auditées

Les seules Server Actions trouvées sont :

- `loginAction` ;
- `logoutAction`.

Elles concernent le cycle Auth et non les données métier. Elles utilisent le
client de session utilisateur, jamais le service-role. Les mutations métier
restent exposées via les Route Handlers et sont désormais gardées avant leur
traitement.

## API Routes auditées

Les 31 fichiers de routes couvrent :

- biens, entrées, options et détection de doublons ;
- fichiers privés ;
- documents ;
- mouvements ;
- référentiels ;
- utilisateurs et rôles ;
- santé.

Toutes les routes autres que `/api/health` passent par
`authorizeApiRequest()`, directement ou via les factories de
`lib/reference-api.js`. La garde intervient avant toute lecture ou écriture
métier. Les routes `users` et `roles` exigent explicitement
`users.manage`. Les contrôles métier historiques plus fins restent appliqués
aux mutations.

## Modèle d’autorisation retenu

La recherche est strictement :

```text
authProvider = "supabase"
externalAuthId = session.user.id
```

La requête lit au maximum deux lignes :

- zéro : `not_authorized` ;
- une inactive ou supprimée : `inactive` ;
- une active avec rôle connu : `authorized` ;
- plusieurs : `invalid_membership`, refus fermé.

L’email ne participe jamais à l’association. Le rôle, le `userId`, `isAdmin`,
`storageKey` ou tout header envoyé par le navigateur ne sont jamais une
autorité.

## Justification

Cette solution :

- isole Inventaire Immos des autres applications partageant Supabase Auth ;
- fonctionne avec SQLite comme avec PostgreSQL ;
- réutilise un modèle existant sans toucher aux données ;
- permet de désactiver l’application sans supprimer le compte Auth ;
- conserve les règles métier existantes ;
- permet une future extension vers des permissions plus fines ;
- refuse toute attribution implicite lors de la connexion.

## Matrice des rôles et permissions

| Rôle applicatif | Rôle existant | Lecture | Biens/documents | Mouvements | Fichiers | Référentiels | Utilisateurs |
|---|---|---:|---:|---:|---:|---:|---:|
| `admin` | `DIRECTION` | oui | écriture | création/gestion | upload/gestion | écriture | gestion |
| `gestionnaire` | `INVENTORY_MANAGER` | oui | écriture | création/gestion | upload/gestion | écriture | non |
| `gestionnaire` | `MAINTENANCE_MANAGER` | oui | non | création | upload | non | non |
| `lecture_seule` | `BASIC_USER` | oui | non | non | lecture | non | non |

Cette projection préserve les fonctions `can*` existantes. Elle n’élargit pas
les permissions actuelles d’un rôle historique.

Permissions centralisées :

- `app.read` ;
- `assets.write` ;
- `documents.write` ;
- `movements.create` ;
- `movements.manage` ;
- `files.upload` ;
- `files.manage` ;
- `referentials.write` ;
- `users.manage`.

## Helpers centralisés créés

`lib/authorization.js` :

- `getCurrentAppUser()` ;
- `requireAuthenticatedUser()` ;
- `requireAuthorizedUser()` ;
- `requireRole()` ;
- `requirePermission()` ;
- `hasPermission()` ;
- erreurs `AppAuthorizationError`.

`lib/authorization-http.js` :

- garde API ;
- normalisation 401, 403, 500 et indisponibilité 503 ;
- aucun détail Auth, Prisma ou PostgreSQL.

`lib/authorization-page.js` :

- redirection des utilisateurs non connectés ;
- résultat explicite pour les autres refus ;
- `returnTo` interne sûr.

## Fichiers créés

Six fichiers Phase 10E-D :

1. `lib/authorization.js`
2. `lib/authorization-http.js`
3. `lib/authorization-page.js`
4. `app/components/access-denied.js`
5. `scripts/test-app-authorization.mjs`
6. `SUPABASE_PHASE10E_D_AUTHORIZATION_REPORT.md`

## Fichiers modifiés

Trente-deux fichiers suivis ont été modifiés par 10E-D :

- les six pages métier ;
- `app/components/app-shell.js` ;
- 23 Route Handlers directs ;
- `lib/reference-api.js` ;
- `lib/request-user.js`.

Les changements antérieurs 10E-B/10E-C dans `.env.example`,
`app/globals.css`, `package.json` et `package-lock.json` sont conservés, mais ne
sont pas attribués à 10E-D.

## Protections appliquées

### Pages

- session lue côté serveur ;
- association métier relue avant les données ;
- redirection seulement pour `unauthenticated` ;
- refus explicite sans logout pour `not_authorized` et `inactive` ;
- aucune boucle avec `/connexion`.

### Server Actions

- login/logout restent publics et limités au cycle Auth ;
- aucune Server Action métier n’existe ;
- aucune action n’accepte de rôle ou d’acteur client.

### API

- garde avant lecture/écriture ;
- identité issue des cookies serveur ;
- ancienne identité `x-user-id` supprimée ;
- permission `users.manage` sur utilisateurs/rôles ;
- permissions historiques conservées sur les autres mutations.

## Statuts HTTP et erreurs

- 401 : session absente ;
- 403 : absence d’appartenance, compte inactif, rôle insuffisant ou association
  invalide ;
- 400 : validation métier existante ;
- 404 : ressource inexistante selon les handlers existants ;
- 500 : erreur interne assainie ;
- 503 : Auth ou autorisation temporairement indisponible.

Aucune stack trace, erreur SDK, erreur Prisma, clé, cookie ou token n’est
sérialisé.

## Redirections

Le helper 10E-C reste l’autorité pour `returnTo` :

- chemin interne commençant par un seul `/` ;
- refus des URL absolues, `//`, backslashes, protocoles et contrôles ;
- fallback interne `/`.

## Utilisateur authentifié mais non autorisé

Il reçoit « Accès non autorisé » et reste connecté à Supabase Auth. Il n’est
pas déconnecté, car le même compte peut être légitime dans une autre
application. Le compte de recette n’a reçu aucune association ni rôle.

## Compte inactif

Une ligne `DISABLED` ou supprimée logiquement produit « Accès désactivé ». Une
indisponibilité technique produit un message temporaire distinct et fermé.

## Bouton de déconnexion

Constat : le bouton existait uniquement sur `/connexion` lorsqu’un utilisateur
déjà connecté ouvrait cette page. Après la redirection vers le back-office, il
n’était donc pas visible.

Correction minimale : ajout d’une mutation de déconnexion visible dans
`AppShell`, réutilisant la Server Action existante. Aucun menu ou flux Auth n’a
été refondu. La déconnexion réelle reste à valider lors de la recette finale.

## Migrations

- aucune migration créée ;
- aucun `schema.prisma` modifié ;
- aucune table ou donnée d’autorisation créée ;
- aucun rôle attribué.

## Tests

Historique conservé :

- Storage/UI : 75 ;
- purge : 51 ;
- Auth 10E-B : 12 ;
- session 10E-C : 11 ;
- total antérieur : 149.

Nouveaux tests 10E-D : 17.

Résultat final : **166/166 réussis, 0 échec**.

Couverture ajoutée :

- non connecté ;
- connecté sans appartenance ;
- inactif et supprimé ;
- correspondance multiple ;
- lecture seule, gestionnaire et admin ;
- écriture refusée en lecture seule ;
- permissions historiques conservées ;
- 401/403 et succès API ;
- indisponibilités Auth et Prisma assainies ;
- aucune confiance dans un rôle ou `x-user-id` client ;
- toutes les pages privées gardées ;
- toutes les API privées gardées ;
- `/connexion` et `/api/health` publics ;
- frontière client/server-only.

## Contrôles build, TypeScript et lint

- validation syntaxique ciblée : réussie ;
- `git diff --check` : réussi ;
- TypeScript du build Next.js : réussi ;
- build SQLite : réussi après qualification dynamique de
  `/referentiels` et `/parc/[id]` ;
- lint : aucun script `lint` n’existe ;
- typecheck autonome : aucun script `typecheck` n’existe ;
- `build:postgresql` non exécuté.

Le build conserve un avertissement NFT/Turbopack préexistant lié au client
Prisma généré et au traçage du projet complet.

## États protégés avant/après

| État | Avant | Après |
|---|---:|---:|
| SQLite SHA-256 | `8c9dcce5...aaec` | identique |
| production `asset_units` | 12 | 12 |
| production `asset_files` | 0 | 0 |
| recette lignes métier | 253 | 253 |
| recette `asset_units` | 13 | 13 |
| recette `asset_files` | 0 | 0 |
| recette FK orphelines | 0 | 0 |
| Storage privé | oui | oui |
| objets Storage | 0 | 0 |

Les trois JPEG historiques sont présents avec leurs SHA-256 inchangés :

- `4ea6fafc0e1dfec5b1763203715f20c00b2b84720c8ff9158a47a06c440fad4a`
- `ff1a9c1a9ccf30932426389687755d2065074eacaa56948451e03903dac3bd83`
- `d360445ca40c9e7c6afc77bc7d97a2c30c9f58b766cfb5de50db422bd5d393ec`

## Scan de secrets

Aucune valeur réelle de service-role, anon key, JWT, token, cookie, mot de
passe, URL signée ou URL PostgreSQL n’est présente dans les fichiers 10E-D.
Les valeurs de tests utilisent exclusivement des domaines et identifiants
factices.

## Limites connues

- `externalAuthId` est indexé mais pas unique au niveau du schéma ; le helper
  détecte deux correspondances et refuse. Une future contrainte unique demande
  une migration préparée et un audit préalable.
- l’association Auth ↔ `User` doit encore être administrée manuellement ;
- l’UI ne masque pas encore chaque bouton selon les permissions ; les API
  restent toutefois l’autorité et bloquent les opérations ;
- les composants clients historiques peuvent afficher leur navigation avant
  un clic refusé par l’API ;
- la validation réelle de logout est différée ;
- aucune RLS n’a été modifiée ; Prisma reste l’autorité serveur.

## Éléments volontairement différés

- interface de gestion des appartenances et rôles ;
- attribution explicite au compte de recette ;
- contrainte unique conditionnelle sur l’identité Supabase ;
- affinage visuel des actions selon permissions ;
- recette réelle de chaque rôle ;
- RLS ;
- exposition de la purge ;
- invitations et administration Auth.

## Risques résiduels

- incohérence manuelle des associations entre environnements ;
- doublon `externalAuthId`, traité par refus mais pas empêché en écriture ;
- erreurs d’expérience utilisateur tant que les boutons ne sont pas masqués ;
- dépendance réseau Auth y compris en mode SQLite ;
- absence de validation réelle du bouton de déconnexion ajouté.

## Recommandation pour la phase suivante

Préparer une recette dédiée, non destructive :

1. créer ou sélectionner manuellement des comptes Auth sans modifier les
   paramètres globaux ;
2. associer explicitement des fixtures d’autorisation distinctes en recette ;
3. valider successivement absence d’accès, inactif, lecture seule,
   gestionnaire et admin ;
4. valider le logout visible ;
5. nettoyer uniquement les fixtures créées ;
6. ne considérer ensuite qu’une interface minimale d’administration des
   appartenances.

## Confirmations finales

- aucun paramètre global Supabase Auth modifié ;
- aucun provider Auth modifié ;
- aucun compte créé ;
- aucune invitation ;
- aucun rôle attribué ;
- aucune donnée métier modifiée ;
- aucune policy ou RLS modifiée ;
- aucun objet Storage créé ;
- aucun upload ou purge ;
- aucune migration ;
- aucun commit ;
- aucun push ;
- aucun tag ;
- aucune phase suivante commencée.
