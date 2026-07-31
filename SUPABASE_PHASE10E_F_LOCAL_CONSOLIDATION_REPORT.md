# Phase 10E-F — Consolidation locale avant reprise Supabase

## Statut

Consolidation locale réussie.

**La Phase 10E-E reste BLOQUÉE PAR LA CONNECTIVITÉ RÉSEAU — NON VALIDÉE.**

Cette phase ne comporte aucune connexion PostgreSQL distante, aucune écriture
Supabase et aucune validation implicite via `RECIPE_SKIP_PREFLIGHT`.

## État Git

- HEAD : `b1bd83da955f55cbee8a773684eea1dc0933587c`
- dernier commit : `feat: add deferred asset file purge service`
- aucun fichier supprimé ;
- modifications non commitées attendues des phases 10E-B à 10E-E2 ;
- rapports historiques non suivis conservés ;
- `git diff --check` : réussi ;
- aucun commit, push ou tag.

### Fichiers suivis modifiés

- `.env.example` ;
- `package.json`, `package-lock.json` ;
- 23 Route Handlers sous `app/api` ;
- `app/components/app-shell.js` ;
- pages privées `app/page.js`, `app/parc/page.js`,
  `app/parc/[id]/page.js`, `app/documents/page.js`,
  `app/mouvements/page.js`, `app/referentiels/page.js` ;
- `app/globals.css` ;
- `lib/reference-api.js`, `lib/request-user.js` ;
- `scripts/preflight-postgresql-recipe.mjs` ;
- `scripts/run-next-with-database.mjs` ;
- `scripts/test-postgresql-recipe-guard.mjs`.

### Fichiers applicatifs créés

- `app/connexion/actions.js` ;
- `app/connexion/login-form.js` ;
- `app/connexion/page.js` ;
- `app/components/access-denied.js` ;
- `lib/authorization.js` ;
- `lib/authorization-http.js` ;
- `lib/authorization-page.js` ;
- modules Auth sous `lib/supabase/` ;
- `proxy.js` ;
- `scripts/manage-recipe-auth-link.mjs` ;
- `scripts/test-app-authorization.mjs` ;
- `scripts/test-auth-foundations.mjs` ;
- `scripts/test-auth-session-flow.mjs` ;
- `scripts/test-recipe-auth-link.mjs`.

### Rapports 10E concernés

- `SUPABASE_PHASE10E_A_AUTH_AND_ADMIN_ACCESS_AUDIT_PLAN.md` ;
- `SUPABASE_PHASE10E_B_SERVER_ONLY_AUTH_FOUNDATION_REPORT.md` ;
- `SUPABASE_PHASE10E_C_LOGIN_LOGOUT_AND_SESSION_FLOW_REPORT.md` ;
- `SUPABASE_PHASE10E_C1_REAL_AUTH_VALIDATION_REPORT.md` ;
- `SUPABASE_PHASE10E_D_AUTHORIZATION_REPORT.md` ;
- `SUPABASE_PHASE10E_D1_ROLE_PROJECTION_CORRECTION_REPORT.md` ;
- `SUPABASE_PHASE10E_E1_RECIPE_PREFLIGHT_DEVELOPER_EXPERIENCE_REPORT.md` ;
- `SUPABASE_PHASE10E_E2_CONTROLLED_REMOTE_RECIPE_HOLD_REPORT.md` ;
- présent rapport 10E-F.

## Revue du diff

Les changements relus se limitent à :

- dépendances officielles Supabase Auth SSR ;
- clients navigateur, serveur utilisateur et administrateur séparés ;
- connexion, déconnexion, cookies et redirections internes sûres ;
- projection applicative des rôles ;
- gardes centralisées pour pages et API ;
- suppression de la confiance historique dans `x-user-id` ;
- état d’accès refusé ;
- bouton de déconnexion ;
- tests Auth/autorisation ;
- outil recette dry-run/confirmation ;
- amélioration du prévol PostgreSQL Recipe.

La normalisation mécanique de métadonnées de plateformes optionnelles dans
`package-lock.json` accompagne l’installation npm réalisée en 10E-B. Les deux
dépendances fonctionnelles ajoutées sont exclusivement `@supabase/ssr` et
`@supabase/supabase-js`. Aucune autre dépendance applicative n’est introduite.

Aucune modification inattendue n’est détectée dans :

- les schémas Prisma ;
- les migrations ;
- les données SQLite ;
- les fichiers Storage ;
- les règles métier ;
- les permissions définies après 10E-D1.

## Audit des secrets

- `.env.local` est couvert par `/.env*` dans `.gitignore` ;
- `.env.local` n’est pas suivi par Git ;
- 173 fichiers applicatifs, scripts, manifests et rapports 10E ont été scannés ;
- aucun JWT, bearer token, service-role réelle, URL signée ou valeur de mot de
  passe de recette n’a été détecté ;
- aucun secret n’est sérialisé dans les composants clients.

Le seul motif d’URL avec identifiants est l’URL PostgreSQL locale factice
`127.0.0.1` du test d’indisponibilité réseau. Ses identifiants sont explicitement
factices et non réutilisables ; elle ne cible aucun environnement Supabase.

## Autorisation locale

Projection confirmée dans `lib/authorization.js` et par tests :

| Rôle historique | Projection | `users.manage` |
|---|---|---:|
| `DIRECTION` | `admin` | oui |
| `INVENTORY_MANAGER` | `gestionnaire` | non |
| `MAINTENANCE_MANAGER` | `gestionnaire` restreint | non |
| `BASIC_USER` | `lecture_seule` | non |

Autres propriétés confirmées :

- un utilisateur Auth sans ligne `User` liée par `externalAuthId` reçoit
  `not_authorized` ;
- plusieurs liaisons sont refusées de manière fermée ;
- une ligne inactive ou supprimée est refusée ;
- un utilisateur non authentifié reçoit 401 côté API ;
- une page privée redirige l’utilisateur non authentifié vers `/connexion`
  avec un `returnTo` interne normalisé ;
- aucun rôle, `isAdmin`, `userId`, header ou metadata client n’accorde un droit ;
- toutes les pages métier auditées possèdent la garde serveur ;
- toutes les API privées auditées possèdent la garde serveur ; `/api/health`
  reste publique ;
- les routes utilisateurs et rôles exigent `users.manage`.

## Expérience utilisateur

Vérifications locales et statiques :

- bouton `Déconnexion` présent dans `AppShell` ;
- déconnexion implémentée par Server Action POST, jamais par GET ;
- action utilisant le client de session utilisateur et non le service-role ;
- page `/connexion` dynamique ;
- état connecté et bouton de déconnexion présents sur la page de connexion ;
- état d’accès refusé rendu par un composant dédié ;
- messages techniques et secrets non exposés ;
- redirections externes, `//`, backslashes et contrôles refusés ;
- rafraîchissement centralisé par le proxy, sans rôle ni protection métier
  délégués au proxy ;
- build des pages protégées sans erreur serveur.

Les tests mockés valident la conservation/actualisation des cookies, la
déconnexion contrôlée et l’absence de boucle conceptuelle. La persistance réelle
après rafraîchissement et la destruction réelle de la session exigent Supabase
Auth et restent à valider manuellement.

## Tests

Commande locale principale :

```text
node --test scripts/test-file-storage-abstraction.mjs scripts/test-asset-file-deletion-plan.mjs scripts/test-auth-foundations.mjs scripts/test-auth-session-flow.mjs scripts/test-app-authorization.mjs scripts/test-recipe-auth-link.mjs
```

Résultat : **180/180 réussis, 0 échec**.

Contrôle local supplémentaire :

```text
node scripts/test-postgresql-recipe-guard.mjs
```

Résultats :

- configuration incohérente refusée ;
- contournement réseau explicitement averti en développement ;
- contournement refusé hors développement ;
- message d’indisponibilité réseau validé localement ;
- recette distante explicitement déclarée non validée.

Aucun test exécuté ne contacte PostgreSQL, Storage ou Supabase Auth.

## Build et TypeScript

Commande :

```text
npm.cmd run build:sqlite
```

Résultats :

- build Next.js 16.2.6 : réussi ;
- compilation : réussie ;
- TypeScript intégré : réussi ;
- 19 pages générées ;
- avertissement NFT/Turbopack Prisma préexistant, non bloquant.

Il n’existe pas de script autonome `typecheck` ni `lint` dans `package.json`.
Aucun build PostgreSQL n’a été exécuté.

## Intégrité SQLite

SHA-256 recalculé après tests et build :

`8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec`

Résultat : strictement identique à l’empreinte protégée.

Aucune commande d’écriture SQLite n’a été exécutée.

## Checklist manuelle restant à exécuter

Uniquement après rétablissement du port 5432 et réussite du prévol normal :

- [ ] vérifier `TcpTestSucceeded : True` ;
- [ ] exécuter le prévol avec `RECIPE_SKIP_PREFLIGHT=0` ;
- [ ] confirmer production 12/0 en lecture seule ;
- [ ] confirmer recette 253/13/0 et 0 FK orpheline ;
- [ ] confirmer bucket privé et vide ;
- [ ] connecter le compte Auth sans liaison et constater le refus applicatif ;
- [ ] vérifier successivement DIRECTION, INVENTORY_MANAGER,
  MAINTENANCE_MANAGER et BASIC_USER avec liaisons temporaires contrôlées ;
- [ ] confirmer que seul DIRECTION accède aux utilisateurs/rôles ;
- [ ] confirmer les 401 et 403 réels ;
- [ ] rafraîchir une session réelle et vérifier sa persistance ;
- [ ] cliquer sur le bouton Déconnexion ;
- [ ] vérifier la redirection vers `/connexion` ;
- [ ] recharger et confirmer que la session n’est plus reconnue ;
- [ ] ouvrir directement une page privée et confirmer la redirection ;
- [ ] vérifier l’absence de boucle et d’ancien état utilisateur ;
- [ ] retirer toute liaison `externalAuthId` temporaire ;
- [ ] répéter tous les contrôles protégés.

Aucun de ces points manuels n’est déclaré réussi par la présente consolidation.

## Conclusion

- consolidation locale : réussie ;
- anomalie bloquante locale : aucune ;
- secret suivi : aucun ;
- migration ou schéma Prisma modifié : aucun ;
- SQLite : inchangée ;
- données Supabase : non contactées et non modifiées ;
- Phase 10E-E : **BLOQUÉE PAR LA CONNECTIVITÉ RÉSEAU — NON VALIDÉE** ;
- aucun commit ;
- aucun push ;
- aucun tag.
