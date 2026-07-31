# Phase 10E-B — Fondations Supabase Auth server-only

## Conclusion

**Phase 10E-B réussie avec build omis de façon justifiée**

Les fondations Supabase Auth sont disponibles sans modifier le comportement
métier. Les clients navigateur, session serveur et administration sont séparés,
les helpers de session n’appliquent encore aucun rôle et aucun module n’est
raccordé aux pages ou routes existantes.

## État Git initial

- HEAD : `b1bd83da955f55cbee8a773684eea1dc0933587c`
- message : `feat: add deferred asset file purge service`
- aucun fichier suivi modifié au prévol ;
- seuls les rapports historiques connus étaient non suivis ;
- rapport 10E-A relu intégralement ;
- aucun commit, push ou tag.

## Architecture créée

Le dossier `lib/supabase/` sépare cinq responsabilités :

1. validation des variables publiques et utilisateur serveur ;
2. validation server-only de la service role ;
3. client navigateur utilisant uniquement les variables publiques ;
4. client serveur lié aux cookies de la session utilisateur ;
5. client d’administration server-only sans persistance de session ;
6. helpers stables de lecture et rafraîchissement.

Les nouveaux modules ne sont importés par aucune page, route, action ou
composant existant. Ils n’activent donc ni Auth, ni protection, ni changement
du comportement courant.

## Fichiers créés

- `lib/supabase/auth-errors.js`
- `lib/supabase/auth-config.js`
- `lib/supabase/auth-server-config.js`
- `lib/supabase/browser-client.js`
- `lib/supabase/server-client.js`
- `lib/supabase/admin-client.js`
- `lib/supabase/session.js`
- `scripts/test-auth-foundations.mjs`
- `SUPABASE_PHASE10E_B_SERVER_ONLY_AUTH_FOUNDATION_REPORT.md`

## Fichiers modifiés

- `package.json`
- `package-lock.json`
- `.env.example`

Aucun schéma Prisma, migration, fichier `.env`, page, route, composant, service
métier, provider Storage ou service de purge n’a été modifié.

## Dépendances ajoutées

Deux dépendances officielles uniquement :

- `@supabase/ssr` `^0.12.4`
- `@supabase/supabase-js` `^2.111.0`

Aucune autre dépendance directe n’a été ajoutée.

`npm audit` signale trois vulnérabilités de gravité élevée dans la chaîne
existante Next.js/PostCSS/Sharp. Il ne signale pas les deux paquets Supabase
comme source de ces avis. Aucun `npm audit fix` n’a été exécuté, car une mise à
jour automatique de Next et de ses dépendances dépasserait la portée ciblée de
cette phase.

## Configuration et variables

### Navigateur

Le client navigateur exige :

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### Serveur utilisateur

Le client de session accepte les noms canoniques serveur :

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

Lorsque ces alias ne sont pas définis, il utilise les valeurs publiques
validées :

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### Administration

Le client administrateur exige en plus :

- `SUPABASE_SERVICE_ROLE_KEY`

`.env.example` contient uniquement les noms, commentaires et valeurs vides.
Aucune vraie configuration n’a été écrite.

## Validation des variables

Les helpers :

- retirent uniquement les espaces périphériques ;
- refusent une valeur vide ;
- exigent une URL HTTP ou HTTPS ;
- refusent une URL contenant identifiant ou mot de passe ;
- retirent les slashs finaux de l’URL ;
- refusent les retours à la ligne dans les clés ;
- nomment la variable absente sans afficher sa valeur ;
- retournent des objets figés.

Les erreurs normalisées utilisent
`SupabaseAuthConfigurationError` avec le code
`auth_configuration_error`.

## Client navigateur

`createSupabaseBrowserAuthClient()` :

- utilise `createBrowserClient()` de `@supabase/ssr` ;
- reçoit seulement URL et clé anon publiques ;
- accepte une factory injectée pour les tests ;
- ne référence ni service role, ni module administrateur, ni configuration
  server-only.

Une factory locale facultative réutilise un seul client navigateur.

## Client serveur authentifié

`createSupabaseServerAuthClient()` :

- est protégé par `import "server-only"` ;
- utilise `createServerClient()` de `@supabase/ssr` ;
- accepte un cookie store Next.js ;
- adapte `getAll()` et `setAll()` ;
- utilise la clé anon, jamais la service role ;
- possède une garde contre un runtime navigateur ;
- accepte client et cookie store injectés pour les tests.

`getSupabaseServerAuthClient()` résout paresseusement `cookies()` depuis
`next/headers`. Dans un Server Component en lecture seule, un refus d’écriture
du cookie store est toléré. Le branchement effectif du rafraîchissement des
cookies dans le futur callback ou middleware est réservé à 10E-C.

## Client service role

`createSupabaseAdminAuthClient()` :

- est server-only ;
- refuse un environnement navigateur ;
- valide la configuration avant construction ;
- utilise `@supabase/supabase-js` ;
- configure :
  - `persistSession: false`
  - `autoRefreshToken: false`
  - `detectSessionInUrl: false`
- n’est importé par aucun composant client ;
- ne représente jamais l’utilisateur connecté ;
- est injectable et peut être construit paresseusement par une factory.

Il n’est raccordé à aucune invitation, création d’utilisateur, route ou
opération métier.

## Helpers de session

Le module `lib/supabase/session.js` expose uniquement :

### `getCurrentSession()`

- utilise `auth.getSession()` ;
- retourne la session ou `null` ;
- ne calcule aucun rôle.

### `getCurrentUser()`

- utilise `auth.getUser()` pour récupérer un utilisateur vérifié côté
  Supabase ;
- retourne l’utilisateur Auth ou `null` ;
- ne cherche pas encore le profil métier.

### `refreshSession()`

- utilise `auth.refreshSession()` ;
- retourne la session renouvelée ou `null`.

Chaque helper accepte un client ou une factory injectée. Les erreurs SDK sont
converties en `SupabaseAuthOperationError` sans message brut :

- `session_read_failed`
- `user_read_failed`
- `session_refresh_failed`

Aucune vérification de rôle, liaison `externalAuthId` ou protection de route
n’est implémentée.

## Frontière serveur/client

Les contrôles confirment :

- zéro import de `lib/supabase` dans les composants `"use client"` actuels ;
- zéro import du client admin ou serveur dans un composant client ;
- zéro occurrence de `SUPABASE_SERVICE_ROLE_KEY` dans le client navigateur ;
- `admin-client.js`, `server-client.js`, `auth-server-config.js` et
  `session.js` sont server-only ;
- aucun barrel universel n’exporte les modules privilégiés ;
- aucun secret ou client n’est sérialisé.

## Tests ajoutés

Commande :

`node --test scripts/test-auth-foundations.mjs`

Résultat :

- 12 tests ;
- 12 réussis ;
- 0 échec ;
- aucun test ignoré.

Couverture :

1. configuration publique valide ;
2. aliases serveur canoniques ;
3. variables manquantes et URL invalide ;
4. client navigateur et arguments publics ;
5. réutilisation de la factory navigateur ;
6. adaptation lecture/écriture des cookies ;
7. cookie store invalide ;
8. options sûres du client service role ;
9. service role manquante et garde navigateur ;
10. lecture de session, utilisateur et refresh ;
11. session absente et erreurs normalisées ;
12. frontière client/server-only.

Les URL, clés, utilisateurs, cookies et tokens utilisés sont explicitement
factices (`example.invalid`, `test-*`, `fake-*`). Toutes les factories et
méthodes Auth sont simulées. Aucun appel Auth ou réseau réel n’est effectué par
les tests.

## Tests historiques

Les suites historiques ont été relancées :

- Storage et interface privée : 75/75 ;
- purge différée : 51/51 ;
- historique total : 126/126.

Total avec les fondations Auth :

- **138/138 tests réussis**
- 0 échec
- 0 test ignoré.

Aucun test n’a utilisé :

- PostgreSQL production ou recette ;
- le SQLite protégé ;
- le bucket réel ;
- les JPEG historiques ;
- `public/uploads/assets` réel ;
- une vraie clé Supabase.

## Contrôles statiques

`node --check` réussit pour les huit modules/scripts JavaScript créés.

`git diff --check` réussit. Les avertissements Git concernent uniquement la
conversion future LF/CRLF sur Windows et ne signalent aucune erreur de contenu.

Le projet ne contient aucun script `lint` ou `typecheck`. Aucune commande ni
dépendance n’a été inventée pour les simuler.

## Build

Aucun build n’a été exécuté :

- `build:postgresql` cible la production et était interdit ;
- le build SQLite n’apporte pas de validation supplémentaire aux clients Auth
  injectés ;
- les 138 tests et contrôles syntaxiques couvrent directement le changement ;
- aucune page ni route n’importe encore ces fondations.

## Scan de secrets

Le scan des fichiers créés ou modifiés confirme :

- aucune vraie service role ;
- aucune vraie anon key ;
- aucun JWT ;
- aucun token réel ;
- aucune URL PostgreSQL ;
- aucune URL signée ou query de signature ;
- aucun header Authorization réel ;
- aucun contenu de `.env`.

Les seules valeurs ressemblant à des identifiants sont des valeurs factices
non réutilisables limitées aux tests.

## États protégés finaux

### Git

- HEAD toujours :
  `b1bd83da955f55cbee8a773684eea1dc0933587c`
- aucun commit, push ou tag.

### SQLite

- SHA-256 :
  `8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec`
- aucune écriture.

### Production — `immos`

- `asset_units = 12`
- `asset_files = 0`
- aucune écriture ou modification de schéma.

### Recette — `immos_recipe_phase8`

- total métier = 253
- `asset_units = 13`
- `asset_files = 0`
- FK orphelines = 0
- aucune écriture.

### Supabase Storage

- bucket `asset-files` privé ;
- 0 objet ;
- aucune policy modifiée ;
- aucun upload, delete ou URL signée.

### JPEG historiques

Les trois fichiers sont présents et inchangés :

- `4ea6fafc0e1dfec5b1763203715f20c00b2b84720c8ff9158a47a06c440fad4a`
- `ff1a9c1a9ccf30932426389687755d2065074eacaa56948451e03903dac3bd83`
- `d360445ca40c9e7c6afc77bc7d97a2c30c9f58b766cfb5de50db422bd5d393ec`

## Confirmations

- aucun utilisateur créé ou invité ;
- aucun email envoyé ;
- aucune connexion Auth réelle ;
- aucune route ou page protégée ;
- aucune page Login ou Logout ;
- aucun middleware ;
- aucun rôle actif ;
- aucune liaison au profil métier ;
- aucune policy ou RLS modifiée ;
- aucune base ou donnée modifiée ;
- aucun changement Storage ;
- aucune modification de la purge ;
- aucun commit ;
- aucun push ;
- aucun tag ;
- Phase 10E-C non commencée.
