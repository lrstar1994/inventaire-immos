# Phase 10F-UX — Validation visuelle de la session, du sidebar et de l’utilisateur connecté

## Statut

**PHASE 10F-UX VALIDÉE APRÈS CORRECTION — SESSION, SIDEBAR ET IDENTITÉ UTILISATEUR CONFORMES**
## Résumé

La validation a reproduit puis corrigé deux anomalies visuelles :

1. le shell privé était monté dans le layout racine, y compris sans autorisation, et affichait l’identité de démonstration codée en dur `Judi Randria / Direction` ;
2. les protections serveur refusaient correctement les mutations interdites, mais certaines commandes d’écriture restaient visibles pour `BASIC_USER`.

Le shell est désormais calculé côté serveur à partir de l’utilisateur applicatif réellement lié à la session Supabase par `User.externalAuthId`. Sans utilisateur applicatif actif et autorisé, aucun sidebar, header privé ou utilisateur fictif n’est rendu.

Les commandes d’écriture sont projetées depuis les permissions serveur. Elles ne remplacent pas les protections des API, qui restent obligatoires et ont été revalidées en 401/403.

## État Git initial

- branche : `master` ;
- HEAD : `6244fdc58b6e908ea3a7483a9e3a0abe313aaf84` ;
- message : `feat(auth): secure Supabase authorization and recipe validation` ;
- rapports et scripts historiques non suivis déjà présents ;
- aucun secret suivi ;
- aucune modification Prisma ou migration.

## Audit de la session et de l’identité

### Composants concernés

- layout racine : `app/layout.js` ;
- shell, sidebar, header et logout : `app/components/app-shell.js` ;
- lien actif client : `app/components/active-nav-link.js` ;
- page publique de connexion : `app/connexion/page.js` ;
- actions serveur login/logout : `app/connexion/actions.js` ;
- client Auth serveur : `lib/supabase/server-client.js` ;
- lecture session/utilisateur Auth : `lib/supabase/session.js` ;
- rafraîchissement limité : `proxy.js` et `lib/supabase/session-refresh.js` ;
- autorisation applicative : `lib/authorization.js` ;
- garde des pages : `lib/authorization-page.js` ;
- garde des API : `lib/authorization-http.js`.

### Source de session

La session provient du client Supabase serveur associé aux cookies Auth. `getCurrentUser()` vérifie l’utilisateur auprès de Supabase Auth ; le service-role n’est pas utilisé pour représenter la session.

Le proxy ne protège pas globalement les pages : il reste limité au rafraîchissement technique de `/connexion`. Les pages privées appliquent leur garde serveur.

### Source de l’identité affichée

Flux validé :

```text
session Supabase Auth
→ auth.users.id
→ User.externalAuthId
→ User actif unique
→ projection applicative nom/rôle/permissions
→ AppShell serveur
→ sidebar
```

Le nom affiché provient désormais de `User.name`. Le libellé de rôle visible est dérivé du rôle historique de cette même ligne :

- `DIRECTION` → `Direction` ;
- `INVENTORY_MANAGER` → `Gestionnaire inventaire` ;
- `MAINTENANCE_MANAGER` → `Gestionnaire maintenance` ;
- `BASIC_USER` → `Lecture seule`.

L’adresse email Auth, l’UUID Auth, les métadonnées Auth et les tokens ne sont pas rendus dans le shell.

## Résultat anonyme

Route publique réelle du projet : `/connexion` — le projet ne possède pas de route `/login`.

Contrôles réussis :

- `/connexion` sans session : aucun sidebar et aucun header privé ;
- aucune identité résiduelle ou de démonstration ;
- accès direct à `/parc` : redirection vers `/connexion?returnTo=%2Fparc` ;
- aucun contenu métier privé visible ;
- rafraîchissement anonyme conforme ;
- retour navigateur après logout : page privée non réaffichée ;
- nouvel accès direct après logout : nouvelle redirection ;
- aucun flash du shell privé observé.

## Comparaison Auth / liaison / identité UI

La recette a utilisé le compte Auth dédié existant. Son UUID n’a jamais été affiché. Il a été lié successivement, et exclusivement dans `immos_recipe_phase8`, aux quatre lignes User de recette déjà prévues.

Pour chaque profil, les contrôles ont confirmé :

- l’ID Auth courant correspond exactement à `User.externalAuthId` ;
- une seule ligne User correspond ;
- `User.id` est celui de la cible explicitement choisie ;
- le nom UI égale `User.name` ;
- le rôle UI correspond au rôle de la ligne ;
- aucune valeur du profil précédent ne subsiste.

Toutes les liaisons temporaires ont été retirées. Diagnostic final :

```text
temporaryMembershipsRemaining = 0
```

## Résultats par rôle

### DIRECTION

- identité UI : `Direction` ;
- rôle UI : `Direction` ;
- sidebar et header visibles ;
- cinq modules de lecture visibles ;
- logout visible ;
- accès utilisateurs et rôles autorisé ;
- `users.manage` confirmé ;
- aucune identité de démonstration.

### INVENTORY_MANAGER

- identité UI : `Responsable inventaire` ;
- rôle UI : `Gestionnaire inventaire` ;
- aucune trace du profil DIRECTION ;
- modules métier en lecture visibles ;
- commandes d’inventaire autorisées disponibles ;
- API utilisateurs : 403 ;
- API rôles : 403 ;
- `users.manage` absent.

### MAINTENANCE_MANAGER

- identité UI : `Responsable maintenance` ;
- rôle UI : `Gestionnaire maintenance` ;
- aucune trace du profil précédent ;
- lecture des modules visible ;
- création de mouvement et upload autorisés selon les permissions historiques ;
- gestion complète d’immobilisation, référentiels et utilisateurs non accordée ;
- API utilisateurs : 403 ;
- API rôles : 403 ;
- `users.manage` absent.

### BASIC_USER

- identité UI : `Utilisateur simple` ;
- rôle UI : `Lecture seule` ;
- aucune trace des trois comptes précédents ;
- sidebar limité aux modules consultables ;
- création d’entrée masquée ;
- formulaire de création de document masqué ;
- création/gestion de mouvement masquée ;
- formulaires et boutons de modification des référentiels masqués ;
- fiche bien : sauvegarde, upload, suppression et définition de fichier principal absents ;
- mutation directe testée : 403 ;
- API utilisateurs : 403 ;
- `users.manage` absent.

## Matrice des menus et protections

Les cinq entrées actuelles du sidebar sont des zones de lecture. Tous les rôles actifs possèdent `app.read`, elles restent donc visibles pour les quatre rôles. Les permissions d’écriture sont appliquées aux commandes internes.

| Zone | DIRECTION | INVENTORY_MANAGER | MAINTENANCE_MANAGER | BASIC_USER | Protection directe |
|---|---|---|---|---|---|
| Dashboard | visible | visible | visible | visible | garde page + lecture |
| Immobilisations | lecture/écriture | lecture/écriture | lecture, upload autorisé | lecture seule | garde page + API |
| Documents | lecture/écriture | lecture/écriture | lecture | lecture | garde page + API |
| Mouvements | création/gestion | création/gestion | création restreinte | lecture | garde page + API |
| Catégories | lecture/écriture | lecture/écriture | lecture | lecture | API `referentials.write` |
| Localisations | lecture/écriture | lecture/écriture | lecture | lecture | API `referentials.write` |
| Fournisseurs | lecture/écriture | lecture/écriture | lecture | lecture | API `referentials.write` |
| Marques | pas de module autonome | pas de module autonome | pas de module autonome | pas de module autonome | contrat article/modèle existant |
| Modèles/articles | lecture/écriture | lecture/écriture | lecture | lecture | API `referentials.write` |
| Utilisateurs/rôles | API autorisée | masqué/refusé | masqué/refusé | masqué/refusé | `users.manage`, 403 sinon |

Il n’existe pas encore de page autonome « Utilisateurs » dans le sidebar. Les Route Handlers `/api/users` et `/api/roles` sont réservés à `DIRECTION`.

Le sidebar reflète les permissions, mais ne constitue jamais la protection : les accès directs ont confirmé les refus serveur.

## Persistance, changement de compte et logout

### Persistance

Avec DIRECTION :

- rafraîchissement : identité et rôle conservés ;
- accès direct à `/parc` dans un nouvel onglet : session reconnue ;
- navigation entre cinq modules puis retour dashboard : shell unique et cohérent ;
- aucune duplication du sidebar ;
- aucune erreur d’hydratation ;
- aucun faux utilisateur temporaire.

### Logout

Résultat réel :

- mutation serveur de déconnexion exécutée ;
- redirection vers `/connexion?lang=fr&status=signed-out` ;
- sidebar et header supprimés ;
- ancien nom et ancien rôle absents ;
- bouton Retour : accès privé non restauré ;
- accès direct à `/parc` après logout : redirection vers la connexion ;
- seconde déconnexion couverte par les tests existants ;
- aucun appel service-role.

### Changement successif

Les profils DIRECTION, INVENTORY_MANAGER, MAINTENANCE_MANAGER et BASIC_USER ont été testés avec déconnexion complète et liaison exacte entre les scénarios.

À chaque transition :

- cookies/session précédents invalidés par logout ;
- nouvelle session reconnue ;
- nouvelle liaison `externalAuthId` relue côté serveur ;
- nom, rôle, initiales et commandes recalculés ;
- aucune identité ni permission héritée.

## Responsive

Contrôles visuels Playwright :

| Largeur | Sidebar | Identité | Logout | Débordement horizontal |
|---|---|---|---|---|
| Desktop 1440 px | visible | visible | visible | aucun |
| Tablette 900 px | visible | visible | visible | aucun |
| Mobile 390 px | visible | visible | visible | aucun |

Une anomalie mobile a été corrigée : le CSS masquait auparavant simultanément l’identité et le header, donc le logout. Le header compact, l’identité et le bouton de déconnexion restent maintenant accessibles sur mobile.

## Anomalies et corrections

### Identité codée en dur et shell public

Avant :

- `AppShell` rendu pour toutes les routes ;
- sidebar visible sur la connexion ;
- identité statique `Judi Randria / Direction` ;
- risque de confusion et de fuite d’identité entre comptes.

Après :

- `AppShell` est un composant serveur ;
- `getCurrentAppUser()` détermine l’accès ;
- aucun shell si le statut n’est pas `authorized` ;
- nom et rôle issus de la ligne User liée ;
- aucune identité de secours privilégiée.

### Actions visibles en lecture seule

Avant :

- le serveur refusait correctement la mutation ;
- `BASIC_USER` voyait néanmoins « Créer l’entrée » et d’autres commandes.

Après :

- les pages serveur calculent les permissions ;
- seuls des booléens d’interface non sensibles sont transmis aux composants ;
- les actions interdites sont absentes ;
- les API continuent de contrôler la permission indépendamment.

### Responsive

Avant :

- identité et logout masqués sous 760 px.

Après :

- identité et logout accessibles sur mobile ;
- largeur 390 px sans débordement.

## Tests

Nouveau fichier :

- `scripts/test-session-sidebar-current-user.mjs`

Il couvre :

- absence du shell sans autorisation ;
- absence d’identité codée en dur ;
- source `User.name` et `externalAuthId` ;
- menus calculés depuis les permissions ;
- projection serveur des permissions d’écriture ;
- masquage client des commandes ;
- logout par mutation ;
- responsive ;
- absence d’identité de démonstration.

Résultats réellement exécutés :

- suite locale principale avec tests UX : **191/191 réussis** ;
- tests d’alignement 10F-C/D/E1 : **11/11 réussis** ;
- total exécuté pertinent : **202/202 réussis**, 0 échec ;
- tests ciblés finaux Auth/UX : **31/31 réussis** ;
- build SQLite : réussi ;
- TypeScript : réussi pendant le build ;
- 19 pages générées.

Une commande exploratoire trop large a inclus sept scripts de diagnostic ou de validation réelle qui ne font pas partie de la suite locale : certains exigent des variables de mode spécifiques ou un accès distant hors sandbox. Cette commande n’est pas comptée comme suite de tests. Aucun de ces scripts n’a modifié une donnée ; la suite documentée et pertinente a ensuite réussi intégralement.

L’avertissement Turbopack/NFT Prisma déjà connu reste non bloquant.

## Sécurité et secrets

- aucun mot de passe affiché ;
- aucun token, JWT ou cookie affiché ;
- aucune service-role key dans le navigateur ;
- aucun UUID Auth rendu dans l’interface ;
- aucun rôle reçu du navigateur utilisé comme autorité ;
- aucune stack Prisma/Supabase exposée à l’utilisateur ;
- `.env.local` reste ignoré par Git ;
- aucune valeur sensible ajoutée au diff ou au rapport.

## États finaux

- SQLite : SHA-256 `9645a17ea36adfba0c8964fbf536c47a323d22f606896112f4ed62334882d5ed` ;
- Recipe : 253 lignes métier, 13 `asset_units`, 0 `asset_files`, 0 FK orpheline ;
- Production : 222 lignes métier, 12 `asset_units`, 0 `asset_files`, inchangée ;
- Storage : bucket `asset-files` privé et vide ;
- Auth : compte existant uniquement, aucune création ou modification globale ;
- liaisons Auth temporaires Recipe : 0 ;
- trois JPEG historiques : inchangés ;
- port 3000 : libre ;
- runtime par défaut : SQLite ;
- migration Prisma : aucune ;
- modification de schéma Prisma : aucune ;
- commit : aucun ;
- push : aucun ;
- tag : aucun.

## Fichiers créés

- `scripts/test-session-sidebar-current-user.mjs` ;
- `scripts/diagnose-phase10f-ux-final-state.mjs` ;
- `SUPABASE_PHASE10F_UX_SESSION_SIDEBAR_CURRENT_USER_REPORT.md`.

## Fichiers modifiés

- `lib/authorization.js` ;
- `app/components/app-shell.js` ;
- `app/globals.css` ;
- `app/parc/page.js` ;
- `app/parc/asset-park.js` ;
- `app/parc/[id]/page.js` ;
- `app/parc/[id]/asset-unit-detail.js` ;
- `app/documents/page.js` ;
- `app/documents/document-manager.js` ;
- `app/mouvements/page.js` ;
- `app/mouvements/movement-manager.js` ;
- `app/referentiels/page.js` ;
- `app/referentiels/reference-manager.js` ;
- `scripts/test-app-authorization.mjs`.

## Conclusion

**PHASE 10F-UX VALIDÉE APRÈS CORRECTION — SESSION, SIDEBAR ET IDENTITÉ UTILISATEUR CONFORMES**
