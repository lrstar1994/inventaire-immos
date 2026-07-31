# Phase 10E-A — Audit Supabase Auth et contrôle d’accès administratif

## Conclusion

**Phase 10E-A réussie avec réserves nécessitant des décisions humaines**

L’intégration Auth est techniquement compatible avec l’architecture actuelle,
mais l’application ne doit pas être exposée avant le remplacement de l’identité
implicite actuelle. En l’absence de `x-user-id`, `getRequestUser()` choisit
aujourd’hui le premier utilisateur `DIRECTION` actif. Ce mécanisme n’est ni une
authentification ni une autorisation acceptable hors environnement local
contrôlé.

La stratégie recommandée est une identité Supabase Auth commune, indépendante
du backend métier, puis une correspondance serveur stricte vers la ligne
`User` du backend actif au moyen de `externalAuthId`. Les opérations métier
continuent à passer par le serveur et Prisma. Storage reste privé et accessible
uniquement via les services server-only existants. Aucune policy, donnée,
configuration ou application n’a été modifiée pendant cet audit.

## État Git

- HEAD initial : `b1bd83da955f55cbee8a773684eea1dc0933587c`
- HEAD final : `b1bd83da955f55cbee8a773684eea1dc0933587c`
- message : `feat: add deferred asset file purge service`
- aucun fichier suivi n’était modifié au prévol ;
- seuls les rapports post-commit historiques connus étaient non suivis ;
- le seul nouveau fichier produit par la phase est le présent rapport ;
- aucun commit, push ou tag.

## Sources auditées

### Rapports

- `SUPABASE_PHASE10D_G_FINAL_COMMIT_REPORT.md`
- `SUPABASE_PHASE10D_G_A_DELETION_RETENTION_AND_ORPHAN_AUDIT_PLAN.md`
- `SUPABASE_PHASE10D_G_B_INTERNAL_DEFERRED_PURGE_SERVICE_REPORT.md`
- `SUPABASE_PHASE10D_G_C1_MISSING_OBJECT_DETECTION_FIX_AND_REAL_VALIDATION_REPORT.md`
- rapports relatifs au dual backend et aux migrations PostgreSQL ;
- rapports 10D-C, 10D-E et 10D-F sur le client Storage server-only, les URLs
  signées et la projection serveur vers l’interface.

### Code et configuration

- `package.json`, `next.config.mjs`, `jsconfig.json` ;
- arborescence `app/`, pages, composants et 31 fichiers de routes API ;
- `lib/request-user.js`, `lib/roles.js`, `lib/reference-api.js` ;
- services métier, audit et accès Prisma ;
- modules `lib/storage/` et service de purge différée ;
- schémas Prisma SQLite, PostgreSQL production et PostgreSQL recette ;
- scripts de sélection des backends et de validation Supabase.

## Architecture actuelle

| Élément | Constat |
|---|---|
| Framework | Next.js `^16.2.6`, React `^19.2.6`, App Router |
| Routage | `app/`; aucun Pages Router et aucun groupe de routes |
| Middleware | aucune `middleware` ni `proxy` |
| Layout | un layout racine public contenant directement `AppShell` |
| Pages | `/`, `/parc`, `/parc/[id]`, `/documents`, `/mouvements`, `/referentiels` |
| Composants clients | navigation active, aide, gestionnaires documents/mouvements/parc/référentiels, détail d’un bien et vue des fichiers |
| API | routes App Router sous `/api`; aucune session Auth |
| Identité actuelle | en-tête `x-user-id`, avec fallback automatique vers un `DIRECTION` |
| Cookies/session | aucun mécanisme applicatif trouvé |
| Données | Prisma SQLite par défaut ou PostgreSQL selon `APP_DATABASE_PROVIDER` |
| Storage | provider LOCAL par défaut ou SUPABASE explicitement configuré |
| Client Storage privilégié | server-only, initialisation paresseuse, service role |
| Fichiers privés | résolution serveur, URL signée en mémoire, DTO client sans bucket/key |
| Purge | service interne server-only, sans route, action, UI, cron ou worker |

`AppShell` affiche actuellement un nom et un rôle statiques. Cela ne constitue
pas une identité de session et devra être alimenté par une identité serveur
réelle seulement après mise en place de la session.

## Cartographie des zones

### Zone publique recommandée

- future page de connexion ;
- future route de callback Auth ;
- future demande de récupération de mot de passe ;
- endpoint de santé minimal, sans donnée métier ni détail d’infrastructure.

À ce jour, toutes les pages et la majorité des routes GET sont publiquement
accessibles au niveau applicatif. Elles doivent être considérées comme
administratives ou internes, pas comme publiques.

### Zone authentifiée en lecture

- tableau de bord ;
- parc et détail des biens ;
- documents ;
- mouvements ;
- référentiels ;
- routes de listes et d’options nécessaires à ces pages ;
- accès aux pièces jointes privées après rattachement métier.

### Zone administrative

- création et modification des biens ;
- référentiels ;
- documents et mouvements ;
- gestion des utilisateurs ;
- upload et suppression logique des fichiers.

### Zone hautement sensible et serveur uniquement

- client service role ;
- génération d’URL signée ;
- configuration PostgreSQL ;
- service de purge différée ;
- administration Auth ;
- futures opérations d’invitation, promotion et révocation ;
- futures policies et migrations.

## Cartographie des pages et frontières de données

| Page | Chargement actuel | Client associé | Classe recommandée |
|---|---|---|---|
| `/` | Prisma direct dans Server Component | aucun gestionnaire métier | authentifiée, lecture |
| `/parc` | Prisma puis DTO d’accès fichier | `asset-park.js` | authentifiée; mutations selon permission |
| `/parc/[id]` | lecture via API/service | `asset-unit-detail.js` | authentifiée; fichiers privés |
| `/documents` | Prisma direct | `document-manager.js` | authentifiée; gestion documentaire |
| `/mouvements` | Prisma direct | `movement-manager.js` | authentifiée; gestion des mouvements |
| `/referentiels` | Prisma direct | `reference-manager.js` | authentifiée; écriture administrative |

Toutes les pages dynamiques doivent effectuer un contrôle dans un layout
serveur administratif, puis les pages et loaders sensibles doivent revalider
les permissions nécessaires. Le middleware futur peut accélérer les
redirections, mais ne doit pas être l’autorité finale.

## Routes API et exposition actuelle

Les routes concernent :

- biens et entrées : `asset-units`, `asset-entries`, duplicate check et options ;
- fichiers : `asset-files`, fichiers d’une unité ;
- documents : création, modification, validation, annulation et génération
  depuis les entrées ;
- mouvements : création, modification, validation et annulation ;
- référentiels : fournisseurs, emplacements, catégories et articles ;
- utilisateurs et rôles ;
- santé.

Les mutations appellent généralement `getRequestUser()` et les helpers de
`lib/roles.js`. Les lectures, dont celles qui génèrent des DTO avec URLs
signées, sont souvent sans contrôle d’identité. Les handlers génériques de
référentiels protègent les mutations, mais pas les lectures.

Les routes utilisateurs GET sont actuellement sans contrôle d’accès. Les
routes `roles`, options, documents, mouvements, unités et fichiers peuvent
révéler des informations internes. Une politique « GET donc public » serait
incorrecte.

## Opérations sensibles et protections futures

| Opération | Point d’entrée actuel | Risque principal | Rôle minimum recommandé | Protection |
|---|---|---|---|---|
| Lire le back-office | pages et GET API | divulgation globale | lecture seule | session + périmètre |
| Créer une AssetUnit/entrée | POST API | données frauduleuses | admin | permission serveur |
| Modifier une AssetUnit | PATCH API | altération d’inventaire | admin | permission + validation |
| Suppression logique AssetUnit | DELETE API | indisponibilité métier | admin | permission + audit |
| Modifier disponibilités/statuts | PATCH, validations | incohérence métier | gestionnaire selon domaine | permission spécifique |
| Gérer référentiels | routes génériques | corruption des listes | admin | permission serveur |
| Créer/valider documents | routes documents | écritures irréversibles | admin | permission spécifique |
| Créer mouvements | routes mouvements | déplacement non autorisé | gestionnaire |
| Valider/annuler mouvements | routes mouvements | état physique erroné | admin |
| Upload fichier | POST asset-files | contenu hostile/coût | gestionnaire |
| Lire fichier privé | loaders et GET fichiers | fuite bearer URL | lecture seule avec droit métier |
| Supprimer logiquement fichier | DELETE asset-files | perte de visibilité | admin |
| Restaurer plus tard | aucun point actuel | retour de contenu purgé | admin |
| Purge DRY_RUN | aucun point public | fuite de diagnostic | super_admin |
| Purge EXECUTE | service interne | destruction physique | super_admin + confirmation forte |
| Gérer utilisateurs/Auth | routes users futures | élévation de privilège | super_admin |

Le rôle « admin » ci-dessus correspond au gestionnaire d’inventaire actuel ;
les validations finales particulièrement sensibles peuvent rester réservées
au niveau supérieur selon la règle métier validée.

## Options d’identité étudiées

### Option A — Auth uniquement avec PostgreSQL/Supabase

Avantage : mode SQLite sans dépendance réseau Auth. Inconvénients : deux
modèles d’identité, comportements divergents, risque de tester localement une
application non protégée puis de déployer une variante protégée. Cette option
n’est pas recommandée comme cible.

### Option B — Supabase Auth également avec SQLite

Avantages : même authentification, mêmes cookies et même frontière de sécurité
quel que soit le backend métier. Inconvénient : le mode SQLite devient
dépendant de la disponibilité réseau de Supabase Auth.

### Option C — Auth indépendante du backend métier avec session commune

Cette option sépare explicitement :

- l’identité : Supabase Auth ;
- la session : cookies sécurisés Next.js ;
- les autorisations métier : ligne `User` du backend actif et permissions
  serveur ;
- les données : SQLite ou PostgreSQL ;
- les opérations privilégiées Storage : service role server-only.

C’est la recommandation. En production et recette, une indisponibilité Auth
doit fermer l’accès. Pour le développement local hors ligne, un éventuel mode
de développement doit être explicite, limité à `NODE_ENV=development`, à une
cible locale et désactivé par défaut ; il ne doit jamais réutiliser le fallback
`DIRECTION`.

## Correspondance entre Auth et utilisateur métier

Les trois schémas possèdent déjà :

- `User.authProvider`, défaut `local` ;
- `User.externalAuthId`, nullable et indexé ;
- `User.email`, unique ;
- `User.role`, `status`, `deletedAt`.

La correspondance recommandée est :

1. valider la session Auth côté serveur ;
2. prendre le `sub` Auth vérifié, jamais un ID client ;
3. chercher `User.externalAuthId = sub` dans le backend actif ;
4. exiger `authProvider = supabase`, `status = ACTIVE`, `deletedAt = null` ;
5. charger le rôle applicatif depuis la base métier ;
6. refuser si la correspondance est absente ou ambiguë.

`externalAuthId` n’est actuellement pas unique. Avant une généralisation, une
décision de migration devra garantir son unicité pour les comptes Supabase, ou
le helper devra au minimum détecter plusieurs correspondances et refuser. Une
association automatique par email à chaque requête est déconseillée : elle
peut associer le mauvais compte. Le lien initial doit être explicite et audité.

## Modèle minimal de rôles

Le modèle demandé peut être couvert sans nouvel enum immédiat :

| Niveau conceptuel | Rôle actuel | Lecture | Création/modification | Suppression logique | Fichiers privés | Utilisateurs | Purge |
|---|---|---:|---:|---:|---:|---:|---:|
| `super_admin` | `DIRECTION` | oui | oui | oui | oui | oui | oui, plus tard |
| `admin` | `INVENTORY_MANAGER` | oui | oui | oui | oui | non | non |
| `gestionnaire` | `MAINTENANCE_MANAGER` | oui | domaines autorisés | non par défaut | upload/lecture | non | non |
| `lecture_seule` | `BASIC_USER` | oui | non | non | lecture autorisée | non | non |

Le code doit évoluer de vérifications de rôles dispersées vers des permissions
nommées : `assets.read`, `assets.write`, `files.read`, `files.upload`,
`files.soft_delete`, `users.manage`, `purge.dry_run`, `purge.execute`.
L’autorité reste côté serveur.

## Stockage des rôles

| Solution | Avantages | Risques | Recommandation |
|---|---|---|---|
| `user_metadata` | simple | modifiable par l’utilisateur selon flux | jamais autorité sensible |
| `app_metadata` | administrateur seulement, disponible dans JWT | claim obsolète jusqu’au refresh/révocation | signal Auth secondaire |
| profil métier `User` | déjà présent, commun SQLite/PostgreSQL | lecture DB requise | autorité applicative recommandée |
| table de rôles séparée | extensible | migration et complexité prématurées | différer |
| claims personnalisés | utiles à RLS | cycle de rafraîchissement complexe | complément futur |

Recommandation : rôle effectif chargé depuis la ligne `User` du backend actif ;
`app_metadata` peut contenir une version ou un niveau de défense supplémentaire,
mais ne remplace pas la relecture serveur pour les opérations sensibles. Toute
modification ou révocation de rôle doit invalider ou réévaluer la session avant
une mutation critique.

## Architecture des clients Supabase

### Client navigateur

- clé publique/anon uniquement ;
- connexion, déconnexion et rafraîchissement via mécanisme officiel ;
- aucune service role ;
- aucune opération Storage privilégiée ;
- aucun rôle sensible tiré de données contrôlables par le client.

### Client serveur lié à la session

- lit et écrit les cookies selon l’API Next.js ;
- valide l’utilisateur courant auprès d’Auth ;
- ne doit pas faire confiance à une simple lecture locale non vérifiée du JWT
  pour les actions critiques ;
- sert aux helpers `requireAuthenticatedUser` et `requirePermission`.

### Client administrateur service role

- reste server-only ;
- séparé des clients de session ;
- jamais utilisé pour « devenir » l’utilisateur connecté ;
- réservé au Storage interne, invitations/administration Auth contrôlées et
  tâches internes ;
- jamais exporté par un barrel universel.

Le projet n’a actuellement ni `@supabase/supabase-js` ni `@supabase/ssr`.
L’ajout de dépendances devra être explicite en 10E-B, après validation humaine,
sans réutiliser le client Storage HTTP comme client de session improvisé.

## Gestion recommandée des sessions Next.js

1. le navigateur soumet les identifiants à Supabase Auth ;
2. le callback n’accepte qu’une URL de retour interne allow-listée ;
3. la session est matérialisée par des cookies `HttpOnly` lorsque le flux le
   permet, `Secure` en production et `SameSite=Lax` ou plus strict ;
4. un composant serveur ou middleware rafraîchit la session sans exposer les
   jetons ;
5. les pages lisent l’identité côté serveur ;
6. les mutations revalident identité et permission ;
7. la déconnexion efface les cookies et la session ;
8. expiration/révocation produisent `session_expired` ou `unauthenticated` ;
9. les pages privées sont `no-store` et ne doivent pas être mises en cache
   entre utilisateurs ;
10. les actions destructives revalident le rôle au dernier moment.

Les tokens ne doivent pas apparaître dans `localStorage`, les logs, les URLs de
retour ou les DTO métier.

## Défense en profondeur pour les pages

- middleware/proxy futur : rejet rapide et rafraîchissement de session ;
- layout serveur administratif : barrière commune et récupération de
  l’identité ;
- page/loader serveur : permission et périmètre propres à la ressource ;
- route ou action : contrôle final obligatoire ;
- service métier : invariants et, pour les opérations critiques, permission
  explicite transmise sous forme d’acteur vérifié.

Masquer un menu ou rediriger une page n’empêche jamais un appel API direct.

## Protection des routes et mutations

Un module central devra fournir conceptuellement :

- `getAuthenticatedUser()` ;
- `requireAuthenticatedUser()` ;
- `requirePermission(permission)` ;
- `requireResourceAccess(resource, actor)`.

Chaque mutation devra :

1. lire la session depuis les cookies serveur ;
2. vérifier l’utilisateur Auth ;
3. relire la ligne `User` active du backend courant ;
4. calculer les permissions côté serveur ;
5. revalider le payload ;
6. vérifier le rattachement métier de la ressource ;
7. exécuter et auditer avec l’ID utilisateur métier ;
8. retourner une erreur normalisée.

Le serveur ne doit accepter ni rôle, ni `isAdmin`, ni identité d’acteur depuis
le navigateur. `x-user-id` doit être supprimé du chemin de production.

## Accès futur aux fichiers privés

Flux recommandé :

1. session Auth valide ;
2. utilisateur métier actif ;
3. permission `files.read` ;
4. chargement de l’AssetFile par ID et rattachement à son AssetUnit ;
5. exclusion des lignes `deletedAt != null` sauf permission administrative
   dédiée ;
6. résolution LOCAL ou SUPABASE server-only ;
7. URL signée de 300 secondes, bornée entre 60 et 3 600 secondes ;
8. retour du DTO minimal.

L’URL n’est ni persistée ni journalisée. Le renouvellement se fait par nouveau
rendu serveur ou endpoint recevant seulement l’ID AssetFile, jamais bucket ou
storageKey. Une URL expirée doit produire un message utilisateur neutre.

## Autorisation future de purge

La première implémentation Auth ne doit pas exposer la purge. Une phase
ultérieure pourra imposer :

- `super_admin` uniquement ;
- présentation d’un DRY_RUN avant EXECUTE ;
- confirmation forte et non réutilisable ;
- entrée limitée à `assetFileId` ;
- relecture de la ligne, du rôle et de la session juste avant EXECUTE ;
- refus si session expirée ou rôle révoqué ;
- bucket, key, provider et `filePath` relus uniquement en base ;
- journal d’audit serveur ;
- protection anti-rejeu.

Une commande d’administration server-only est la surface initiale la plus
sûre. Action manuelle, tâche planifiée, worker et outbox restent des options
futures. Aucun cron ne doit être choisi automatiquement.

## Analyse RLS PostgreSQL

### Classification recommandée

| Tables | Lecture | Écriture |
|---|---|---|
| `users`, `audit_logs`, `sensitive_action_approvals` | rôle administratif | service interne / super_admin |
| `asset_files` | utilisateur autorisé par contexte | gestionnaire/admin selon action |
| `asset_units`, `asset_entries` | authentifiée | admin |
| `asset_movements`, lignes | authentifiée | gestionnaire/admin, validation admin |
| `asset_documents`, lignes | authentifiée | admin |
| référentiels | authentifiée | admin |
| migrations Prisma | aucune exposition API | rôle de migration uniquement |

Prisma utilise une connexion serveur commune, pas la connexion de l’utilisateur
Auth. Selon le rôle PostgreSQL réellement associé à cette URL, il peut
contourner ou ne jamais bénéficier des policies RLS. Même avec RLS activée,
les mutations Prisma doivent donc être traitées comme privilégiées et
autorisées dans l’application. Avant toute policy, il faut vérifier en lecture
seule `current_user`, les privilèges et `rolbypassrl`, puis définir deux rôles
distincts si nécessaire : migration/admin et runtime à privilèges minimaux.

RLS ne doit pas donner une fausse garantie : une requête service role ou une
connexion propriétaire contourne généralement la politique conçue pour un JWT
utilisateur. L’adoption d’une connexion utilisateur directe demanderait une
architecture différente et n’est pas recommandée pour la migration initiale.

## Analyse RLS Storage

### Modèle 1 — Tout par le serveur

Bucket privé, upload, signature et suppression via services server-only.
Simple, compatible LOCAL, permissions centralisées. C’est le modèle recommandé
à court terme.

### Modèle 2 — Accès direct utilisateur

Le navigateur upload/lit selon policies Storage et JWT. Il réduit la charge
serveur, mais exige une convention de clés liée à l’identité, des policies
rigoureuses et une autorisation par AssetUnit difficile à exprimer sans source
de vérité synchronisée.

### Modèle 3 — Hybride

Lecture directe ou upload direct, suppression interne. Il peut être utile plus
tard, mais augmente les chemins de sécurité.

Recommandation : conserver le modèle 1. Aucune policy utilisateur n’est
nécessaire pour la première intégration Auth ; les URLs signées sont émises
seulement après autorisation applicative.

## Compatibilité SQLite

La session Auth peut être identique avec `APP_DATABASE_PROVIDER=sqlite` :
l’identité est externe, mais le rôle et le profil sont chargés dans le SQLite
actif. Cela préserve les services métier.

Conséquences :

- Supabase Auth devient une dépendance réseau pour un mode SQLite sécurisé ;
- une panne Auth doit fermer l’accès en recette/production ;
- un mode développement hors ligne éventuel doit être explicite, non déployable
  et sans identité `DIRECTION` automatique ;
- les mêmes `externalAuthId` doivent être provisionnés dans les backends
  concernés si un utilisateur doit basculer de l’un à l’autre ;
- l’absence de profil produit `forbidden`, pas une création automatique ;
- les tests utilisent des clients et sessions factices sans secret réel.

## Amorçage du premier super administrateur

Options :

1. création manuelle dans Supabase Dashboard, puis liaison contrôlée à une ligne
   `User` existante ;
2. invitation administrative, puis promotion server-only auditée ;
3. script ponctuel server-only à garde-fous d’environnement ;
4. seed : déconseillé pour un compte réel.

Recommandation : créer/inviter manuellement le premier compte dans le Dashboard,
valider son email, relever son UUID sans l’exposer, puis exécuter une liaison
ponctuelle contrôlée et auditée vers la ligne `DIRECTION`. Ne jamais créer une
route publique de promotion, un mot de passe codé en dur ou un super-admin au
démarrage.

## Inscriptions et invitations

Au lancement :

- inscription publique désactivée ;
- invitations ou création manuelle réservées au super_admin ;
- vérification email obligatoire ;
- récupération de mot de passe activée avec URLs de retour allow-listées ;
- invitations expirées non réutilisables ;
- comptes inactifs/refusés par la ligne métier, même si la session Auth existe ;
- suppression/désactivation Auth accompagnée d’une révocation de session.

## Cookies, redirections, CSRF et cache

- n’accepter que des chemins de retour internes connus ;
- refuser schémas, hôtes et doubles slashs externes ;
- cookies `Secure`, `HttpOnly` lorsque compatible, `SameSite` contrôlé, path
  minimal ;
- aucune session dans une query string ;
- rotation après connexion et élévation de privilège ;
- mutations non GET et protection Origin/Host ou jeton CSRF selon le mécanisme ;
- pages privées en rendu dynamique/no-store ;
- ne pas mettre en cache un DTO contenant une URL signée entre utilisateurs ;
- éviter le préchargement d’une mutation ou route privée ;
- une redirection de middleware ne remplace pas le contrôle de route.

## Journalisation et audit futurs

Peuvent être journalisés côté serveur :

- ID Auth pseudonyme et ID métier ;
- rôle effectif et permission ;
- action et ressource par ID ;
- résultat normalisé ;
- environnement et horodatage ;
- changement de rôle ou révocation.

Sont interdits :

- JWT, mot de passe, service role, cookie et Authorization ;
- URL signée complète et paramètres de signature ;
- URL PostgreSQL ;
- contenu de fichier ;
- configuration complète ;
- storageKey dans un log client.

Un journal d’audit append-only pourra être défini plus tard. Aucune table n’est
créée dans cette phase.

## Erreurs normalisées

| Code | Message utilisateur | Diagnostic serveur |
|---|---|---|
| `unauthenticated` | Connexion requise | session absente |
| `session_expired` | Session expirée | validation/refresh refusé |
| `forbidden` | Accès refusé | rattachement non autorisé |
| `insufficient_role` | Droits insuffisants | permission manquante |
| `resource_not_found` | Ressource introuvable | absent ou masqué |
| `invalid_request` | Requête invalide | validation normalisée |
| `storage_unavailable` | Fichier indisponible | catégorie Storage |
| `internal_error` | Erreur interne | corrélation serveur |

Les erreurs Supabase et Prisma brutes restent exclusivement internes.

## Matrice de tests future

### Auth et session

- connexion valide, mauvais mot de passe, utilisateur inexistant ;
- email non validé, utilisateur désactivé ou supprimé ;
- session absente, expirée, révoquée et rafraîchie ;
- déconnexion et suppression des cookies ;
- callback avec retour autorisé ou open redirect ;
- panne Supabase Auth avec fermeture sûre.

### Autorisations

- non connecté ;
- chacun des quatre rôles ;
- permission positive et négative par opération ;
- rôle modifié ou révoqué pendant une session ;
- appel direct d’une route sans passer par l’UI ;
- ID acteur, rôle ou `isAdmin` forgés côté client ;
- profil absent, doublon `externalAuthId`, mauvais provider.

### Pages et cache

- redirection d’une page privée ;
- layout protégé ;
- page non mise en cache entre utilisateurs ;
- navigation et préchargement sans fuite ;
- mode SQLite et PostgreSQL.

### Fichiers

- accès autorisé/interdit ;
- fichier supprimé logiquement ou indisponible ;
- LOCAL sans initialisation Supabase ;
- SUPABASE et URL expirée ;
- renouvellement par ID uniquement ;
- aucune fuite bucket, key, filePath brut ou URL signée dans les logs.

### Mutations

- création, modification, suppression logique ;
- validation document/mouvement ;
- payload invalide ;
- CSRF/Origin ;
- session expirée entre page et mutation ;
- audit avec acteur serveur.

### Purge future

- non connecté ou mauvais rôle ;
- DRY_RUN et EXECUTE ;
- confirmation absente/rejouée ;
- session expirée ou rôle révoqué avant EXECUTE ;
- seule entrée client : AssetFile ID ;
- aucune métadonnée Storage fournie par le client.

### Frontière client/serveur

- absence de service role dans le bundle ;
- aucun import privilégié depuis `"use client"` ;
- aucun client admin sérialisé ;
- aucune variable secrète `NEXT_PUBLIC_*`.

## Migration progressive recommandée

### Phase 10E-B — Fondations Auth

- ajouter les dépendances officielles nécessaires ;
- centraliser configuration et clients navigateur/session/admin ;
- garantir les frontières server-only ;
- définir les erreurs et doubles de test ;
- ne protéger encore aucune page et ne créer aucun utilisateur réel.

Critère d’arrêt : secret importable côté client, configuration ambiguë ou mode
SQLite cassé.

### Phase 10E-C — Session, connexion et déconnexion

- callback, cookies, refresh, login/logout ;
- tests sans rôle métier privilégié ;
- inscription publique toujours désactivée.

Rollback : retirer les routes/pages Auth sans toucher aux données métier ni aux
utilisateurs Auth.

### Phase 10E-D — Protection du back-office

- groupe/layout administratif ;
- middleware/proxy comme préfiltre ;
- no-store et redirections sûres ;
- suppression du fallback implicite en environnement protégé.

Rollback : feature flag serveur contrôlé uniquement en développement ; jamais
une ouverture silencieuse en production.

### Phase 10E-E — Rôles et permissions

- liaison `externalAuthId` ;
- helpers de permission ;
- unicité/qualité de liaison décidée ;
- amorçage super_admin séparé et audit.

Rollback : revenir aux données métier intactes, sans supprimer les comptes Auth.

### Phase 10E-F — Mutations et fichiers privés

- protéger chaque route et loader ;
- rattachement métier avant URL signée ;
- contrôles CSRF/Origin ;
- tests de non-régression LOCAL.

Rollback : désactiver la surface concernée, pas rétablir l’identité implicite.

### Phase 10E-G — Validation recette

- utilisateur synthétique/invité dédié ;
- matrice de rôles ;
- aucune production ;
- nettoyage des sessions et fixtures autorisées.

### Phase ultérieure — Purge administrative

- décision explicite ;
- super_admin, DRY_RUN, confirmation forte, audit ;
- éventuellement commande interne avant UI.

## Plan de rollback

| Étape | Rollback sûr |
|---|---|
| clients/config | retirer imports et variables sans toucher aux comptes |
| login/callback | désactiver routes Auth et effacer cookies applicatifs |
| protection pages | désactiver le déploiement fautif, pas ouvrir en production |
| rôles/profils | conserver les lignes et revenir à la dernière lecture stable |
| policies futures | restaurer la version de policy testée, bucket toujours privé |
| mutations | refuser temporairement les mutations plutôt que contourner Auth |
| purge | laisser le service interne non exposé |

Les données métier, le backend LOCAL et les utilisateurs Auth ne sont jamais
supprimés comme mécanisme de rollback.

## Registre des risques

| Risque | Gravité | Probabilité | Impact | Mitigation | Phase |
|---|---|---:|---|---|---|
| service role dans le navigateur | bloquant | faible | contrôle total | modules server-only + scan bundle | 10E-B |
| identité `DIRECTION` implicite | bloquant | élevée | administration sans login | supprimer fallback protégé | 10E-C/D |
| route protégée seulement visuellement | bloquant | élevée | mutation directe | helper serveur sur chaque route | 10E-D/F |
| confiance dans rôle client | bloquant | moyenne | élévation | rôle relu en base | 10E-E |
| Prisma contourne RLS | élevé | élevée | policies inefficaces | autorisation applicative + rôle DB minimal | 10E-F/RLS |
| inscription publique | élevé | moyenne | comptes non autorisés | désactiver, invitation contrôlée | 10E-C |
| élévation de privilège | bloquant | moyenne | contrôle admin | super_admin + audit + revalidation | 10E-E |
| URL signée persistée | élevé | faible | fuite durable | mémoire seulement, tests | 10E-F |
| purge exposée trop tôt | bloquant | faible | perte physique | rester interne | phase ultérieure |
| session expirée | moyen | élevée | erreurs/rejeu | refresh + revalidation mutation | 10E-C/F |
| SQLite dépendant du réseau | moyen | élevée | indisponibilité locale | décision explicite + mode dev fermé | 10E-B/C |
| utilisateur Auth sans profil | élevé | moyenne | accès incohérent | fail closed + provisionnement | 10E-E |
| profil sans utilisateur Auth | moyen | élevée | compte dormant | inventaire et liaison explicite | 10E-E |
| doublon `externalAuthId` | élevé | moyenne | identité ambiguë | contrainte/contrôle d’unicité | 10E-E |
| rôle obsolète dans JWT | élevé | moyenne | droit révoqué encore actif | relecture DB critique | 10E-E/F |
| policy Storage incorrecte | bloquant | moyenne | fuite/suppression | serveur uniquement, tests policies | futur |
| open redirect | élevé | moyenne | phishing/token | allow-list interne | 10E-C |
| cache privé partagé | élevé | moyenne | fuite inter-utilisateur | no-store, cache par identité | 10E-D |
| lecture GET non protégée | élevé | élevée | fuite de données/URL | protéger loaders et GET | 10E-D/F |

## Fichiers prévus pour Phase 10E-B

Sous réserve des décisions humaines ci-dessous, le périmètre exact recommandé
est :

### Nouveaux fichiers

- `lib/auth/config.js`
- `lib/auth/errors.js`
- `lib/auth/supabase-browser-client.js`
- `lib/auth/supabase-server-client.js`
- `lib/auth/supabase-admin-client.js`
- `scripts/test-auth-foundations.mjs`
- `SUPABASE_PHASE10E_B_AUTH_FOUNDATIONS_REPORT.md`

### Fichiers modifiés

- `package.json`
- `package-lock.json`
- `.env.example` — noms et documentation uniquement, jamais de valeur réelle.

10E-B ne doit pas encore modifier :

- `app/layout.js`, une page ou une route ;
- `lib/request-user.js` ou les règles métier ;
- les schémas/migrations Prisma ;
- les modules de purge ;
- les policies Supabase.

Si les bibliothèques nécessaires sont déjà disponibles au moment de
l’implémentation, les deux fichiers package ne devront pas être modifiés
inutilement.

## Variables d’environnement futures

Noms proposés, sans valeur :

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` — serveur uniquement ;
- `APP_AUTH_PROVIDER=SUPABASE` — explicite ;
- `APP_AUTH_REQUIRED=true|false` — `false` interdit hors développement
  contrôlé ;
- `APP_AUTH_SITE_URL` ou allow-list de retours serveur ;
- éventuellement `APP_AUTH_COOKIE_PREFIX` non sensible.

Les variables Storage existantes restent séparées. Aucune variable
`NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY` ne doit exister.

## Limites et décisions humaines requises

1. Supabase Auth protège-t-il aussi le mode SQLite ? Recommandation : oui pour
   tout environnement partagé ; éventuel bypass seulement en développement
   local explicite.
2. L’inscription publique est-elle désactivée ? Recommandation : oui.
3. Les quatre rôles de lancement sont-ils le mapping des rôles existants ?
   Recommandation : oui, sans nouvel enum immédiat.
4. Qui gère les utilisateurs ? Recommandation : `DIRECTION/super_admin`.
5. Qui génère des URLs signées ? Recommandation : tout utilisateur possédant
   `files.read` et un droit sur la ressource, via serveur uniquement.
6. Qui pourra lancer une purge ? Recommandation : super_admin seulement, dans
   une phase ultérieure.
7. Accès Storage direct ou serveur ? Recommandation : serveur uniquement.
8. Prisma conserve-t-il une connexion privilégiée ? Recommandation : oui
   temporairement, avec autorisation applicative obligatoire et étude d’un rôle
   runtime minimal.
9. Faut-il une table de profils ? Recommandation : réutiliser d’abord `User` ;
   une table séparée n’est pas nécessaire sans besoin démontré.
10. Comment créer le premier super_admin ? Recommandation : Dashboard/invitation
    manuelle puis liaison server-only auditée.
11. Faut-il rendre `externalAuthId` unique ? Recommandation : oui avant
    généralisation, après audit des lignes et migration dédiée.
12. La purge doit-elle rester commande interne après Auth ? Recommandation :
    oui jusqu’à validation d’un workflow administratif fort.

## États protégés finaux

### SQLite

- SHA-256 :
  `8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec`
- aucune écriture.

### Production — `immos`

- `asset_units = 12`
- `asset_files = 0`
- aucune écriture ni modification de schéma.

### Recette — `immos_recipe_phase8`

- total métier = 253
- `asset_units = 13`
- `asset_files = 0`
- FK orphelines = 0
- aucune écriture.

### Supabase Storage

- bucket `asset-files` privé ;
- vide ;
- aucune policy modifiée ;
- aucune URL signée générée.

### JPEG historiques

- trois fichiers présents ;
- tailles et SHA-256 inchangés ;
- aucune ouverture en écriture.

## Confirmations finales

- aucun code applicatif modifié ;
- aucun utilisateur Auth créé ou invité ;
- aucune connexion Auth réelle ;
- aucune policy ou RLS modifiée ;
- aucune donnée PostgreSQL ou SQLite modifiée ;
- aucun objet Storage créé, supprimé ou lu par URL signée ;
- aucun upload et aucune purge ;
- aucune dépendance installée ;
- aucun build ou serveur démarré ;
- aucun commit, push ou tag ;
- Phase 10E-B non commencée.
