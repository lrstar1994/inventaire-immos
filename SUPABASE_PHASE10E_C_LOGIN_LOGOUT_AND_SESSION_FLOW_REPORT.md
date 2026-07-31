# Phase 10E-C — Connexion, déconnexion et cycle de session Supabase Auth

## Conclusion

**Phase 10E-C réussie avec validation réelle différée faute de compte Auth de recette**

La page publique `/connexion`, les mutations serveur de connexion et
déconnexion, le rafraîchissement SSR des cookies et l’état minimal de session
sont prêts. Aucun compte réel n’a été créé ou utilisé. Le back-office, ses
routes et ses mutations métier ne sont pas encore protégés.

## HEAD initial et final

- HEAD initial : `b1bd83da955f55cbee8a773684eea1dc0933587c`
- HEAD final : `b1bd83da955f55cbee8a773684eea1dc0933587c`
- message : `feat: add deferred asset file purge service`
- aucun commit, push ou tag.

## État Git initial

Le prévol a confirmé :

- le HEAD attendu ;
- les modifications non commitées de 10E-B sur `.env.example`,
  `package.json` et `package-lock.json` ;
- les modules et tests Auth 10E-B non suivis attendus ;
- les rapports historiques connus ;
- aucune divergence applicative inattendue ;
- `git diff --check` conforme.

## Fondations 10E-B relues

Les modules suivants ont été relus intégralement :

- configuration publique et serveur ;
- client navigateur ;
- client serveur avec cookies ;
- client service-role server-only ;
- helpers `getCurrentUser()`, `getCurrentSession()` et `refreshSession()` ;
- erreurs normalisées ;
- 12 tests Auth et rapport 10E-B.

Confirmations avant implémentation :

- une action de login/logout doit utiliser le client serveur avec session ;
- le cookie store Next.js expose `getAll()` et `set()` à l’adaptateur
  `@supabase/ssr` ;
- le SDK peut écrire les cookies renouvelés par `setAll()` lorsque le contexte
  serveur l’autorise ;
- `getCurrentUser()` appelle réellement `auth.getUser()` et ne fait pas
  confiance uniquement à un contenu local ;
- la service role n’est nécessaire ni au login, ni au logout, ni au refresh.

## Architecture retenue

Flux de connexion :

1. page publique `/connexion` ;
2. composant client minimal avec `useActionState` ;
3. Server Action `loginAction` ;
4. service server-only `executeLogin()` ;
5. client Supabase SSR lié aux cookies ;
6. `auth.signInWithPassword()` ;
7. écriture des cookies par le SDK ;
8. redirection serveur vers un chemin interne validé.

Flux de déconnexion :

1. formulaire POST via Server Action ;
2. client de session utilisateur ;
3. `auth.signOut({ scope: "local" })` ;
4. mise à jour/suppression des cookies par le SDK ;
5. redirection vers `/connexion`.

Le client service-role n’est importé dans aucun de ces flux.

## Fichiers créés en 10E-C

- `app/connexion/actions.js`
- `app/connexion/login-form.js`
- `app/connexion/page.js`
- `lib/supabase/auth-copy.js`
- `lib/supabase/auth-flow.js`
- `lib/supabase/safe-redirect.js`
- `lib/supabase/session-refresh.js`
- `proxy.js`
- `scripts/test-auth-session-flow.mjs`
- `SUPABASE_PHASE10E_C_LOGIN_LOGOUT_AND_SESSION_FLOW_REPORT.md`

## Fichiers modifiés en 10E-C

- `app/globals.css` — styles limités au formulaire Auth ;
- `lib/supabase/server-client.js` — commentaire actualisé sur le contexte
  d’écriture des cookies.

Les modifications 10E-B restent présentes et non commitées :

- `.env.example`
- `package.json`
- `package-lock.json`
- `lib/supabase/*` fondations ;
- `scripts/test-auth-foundations.mjs`
- rapport 10E-B.

Aucune dépendance supplémentaire n’a été ajoutée en 10E-C.

## Page de connexion

Chemin retenu : `/connexion`.

Le dépôt ne possède :

- aucun segment de locale ;
- aucun routage `/fr` ou `/en` ;
- aucune dépendance ou structure `next-intl`.

Créer `/fr/connexion` aurait introduit une convention concurrente. La route
française existante est donc respectée. Les textes FR/EN sont centralisés dans
`auth-copy.js`, et la variante anglaise peut être sélectionnée par
`?lang=en`. La langue est conservée lors de la déconnexion.

La page :

- est publique ;
- utilise un rendu `force-dynamic` ;
- possède un titre explicite ;
- ne charge aucune donnée métier ;
- ne crée aucun client privilégié ;
- ne sérialise ni cookie, ni token, ni metadata ;
- affiche le formulaire si aucun utilisateur n’est vérifié ;
- affiche un état connecté minimal sinon.

## Formulaire

Le composant contient uniquement :

- email, `type="email"`, `autocomplete="email"` ;
- mot de passe, `type="password"`,
  `autocomplete="current-password"` ;
- destination interne cachée déjà normalisée ;
- locale cachée ;
- bouton de soumission désactivé pendant la mutation ;
- erreur accessible avec `role="alert"` et `aria-live`.

Il ne contient :

- aucune inscription ;
- aucun rôle ;
- aucun choix de backend ;
- aucun fournisseur social ;
- aucun lien magique ;
- aucune conservation manuelle du mot de passe.

## Action de connexion

`loginAction` est une Server Action. Elle délègue à `executeLogin()` puis
effectue une redirection serveur uniquement en cas de succès.

Validation :

- email et mot de passe doivent être des chaînes ;
- email requis, format général contrôlé, maximum 254 caractères ;
- mot de passe requis, maximum 1 024 caractères ;
- destination maximum 2 048 caractères et strictement interne.

Le mot de passe est transmis directement au SDK puis abandonné. Il n’est ni
persisté, ni journalisé, ni retourné.

Résultats publics :

- succès : `{ success: true, returnTo }`, sans session ni token ;
- entrée ou identifiants invalides : message générique ;
- indisponibilité technique : message générique distinct, sans détail SDK.

## Protection contre l’énumération

Les statuts Auth 400, 401, 403 et 422 produisent tous :

- code public `invalid_credentials` ;
- texte : « Adresse email ou mot de passe incorrect. »

Cela couvre uniformément :

- email inexistant ;
- mauvais mot de passe ;
- compte non confirmé ;
- compte refusé ou désactivé.

Aucun ID Auth, statut administratif, code détaillé, date ou message Supabase
brut n’est envoyé au composant.

## Redirections sûres

`normalizeInternalReturnPath()` :

- accepte un chemin commençant par un seul `/` ;
- refuse chaîne vide ou trop longue ;
- refuse `//`, protocole, domaine et URL absolue ;
- refuse backslash et caractères de contrôle ;
- décode une fois afin de bloquer un `//` ou backslash encodé ;
- utilise `/` comme repli.

Les tests couvrent les URL absolues, `//evil.example`, backslashes, caractères
de contrôle et valeurs encodées dangereuses.

## Déconnexion

`logoutAction` :

- est une mutation Server Action, jamais une route GET ;
- utilise le client de session utilisateur ;
- appelle `signOut({ scope: "local" })` ;
- redirige vers la page publique ;
- ne retourne aucune erreur brute.

Une absence de session, une session expirée ou une erreur SDK produit un état
public contrôlé. Aucun client service-role n’est appelé.

## État connecté

La page affiche seulement :

- « Connecté » ;
- éventuellement l’adresse email Auth ;
- un bouton de déconnexion.

Elle n’affiche pas :

- UUID Auth ;
- rôle ;
- JWT ;
- metadata ou app_metadata ;
- timestamps de token ;
- cookies.

Décision : un utilisateur déjà connecté reste sur la page avec cet état
minimal. Cela évite une boucle de redirection et permet de tester la
déconnexion.

## Rafraîchissement de session

Next.js 16 utilise la convention `proxy.js`. Le proxy ajouté :

- ne correspond qu’à `/connexion` ;
- ne protège aucune page ;
- ne calcule aucune autorisation ;
- utilise le client SSR utilisateur et la clé anon ;
- appelle `auth.getUser()` afin de valider l’utilisateur et permettre au SDK
  de renouveler les cookies ;
- recopie uniquement les cookies fournis par `@supabase/ssr` vers la requête et
  la réponse ;
- ne sérialise aucune donnée utilisateur.

Le périmètre est volontairement réduit. L’extension du matcher et la protection
du back-office appartiennent à 10E-D.

## Cookies

- aucun stockage parallèle ;
- aucun `localStorage` applicatif ;
- aucun format de cookie inventé ;
- lecture/écriture via l’adaptateur officiel `@supabase/ssr` ;
- options fournies par le SDK préservées, dont HttpOnly/SameSite/Secure selon
  le contexte ;
- aucune valeur de cookie dans les logs, props ou résultats.

## CSRF et mutations

Login et logout utilisent des Server Actions POST. Next.js applique ses
contrôles Server Action, notamment la cohérence Origin/Host. Les cookies SDK
conservent leurs attributs SameSite.

Aucune mutation Auth par GET et aucun système CSRF parallèle n’ont été ajoutés.
Les protections des mutations métier restent hors périmètre et obligatoires en
10E-D/10E-F.

## Cache

- page de connexion dynamique ;
- lecture utilisateur exécutée côté serveur par requête ;
- aucun cache global de session ;
- aucun email ou résultat Auth généré statiquement ;
- aucun token placé dans un cache ou DTO.

Le cache global du reste de l’application n’est pas désactivé.

## Internationalisation

Les textes sont centralisés pour :

- connexion ;
- email ;
- mot de passe ;
- soumission et attente ;
- déconnexion ;
- identifiants incorrects ;
- indisponibilité ;
- session expirée ;
- utilisateur déjà connecté ;
- déconnexion réussie.

Langues : français par défaut et anglais. Aucun framework d’i18n n’a été ajouté
car le projet n’en possède pas actuellement.

## Comportement non connecté

- formulaire public ;
- aucune donnée métier ;
- aucune création de compte ;
- aucune autorisation accordée ;
- une erreur de configuration ou Auth affiche uniquement une indisponibilité.

## Rôles et protection globale

- aucun rôle lu ou attribué ;
- aucune liaison `externalAuthId` ;
- aucun `user_metadata` ou `app_metadata` utilisé ;
- aucune page existante protégée ;
- aucune mutation métier autorisée parce qu’un utilisateur est connecté ;
- `getRequestUser()` et les anciennes règles métier n’ont pas été modifiés ;
- la purge reste sans route, action, UI, cron ou worker.

## Tests ajoutés

Commande :

`node --test scripts/test-auth-session-flow.mjs`

Résultat :

- 11 nouveaux tests ;
- 11 réussis ;
- 0 échec.

Couverture :

1. entrées absentes, non textuelles, invalides ou trop longues ;
2. retour interne valide ;
3. retours externes et dangereux ;
4. login réussi sans token dans le résultat ;
5. cookies transmis par l’adaptateur ;
6. résultat identique pour les échecs utilisateur ;
7. erreur réseau assainie ;
8. logout valide, absent/expiré et erreur SDK ;
9. refresh et copie exacte des cookies SDK ;
10. structure accessible et minimale de l’interface ;
11. textes FR/EN sans inscription.

Toutes les méthodes Supabase sont mockées. Aucune requête Auth réelle, aucun
email et aucune création d’utilisateur.

## Résultats globaux

Suites relancées :

- tests antérieurs 10E-C : 138/138 ;
  - Storage/UI : 75 ;
  - purge : 51 ;
  - fondations Auth 10E-B : 12 ;
- nouveaux tests 10E-C : 11/11 ;
- **total final : 149/149** ;
- 0 échec ;
- 0 test ignoré.

## Contrôles statiques réellement exécutés

- `node --check` sur tous les nouveaux modules sans JSX ;
- `node --check` sur les Server Actions, proxy et script de test ;
- inspection statique des deux fichiers JSX ;
- scan des imports `"use client"` ;
- `git diff --check` ;
- scan de secrets ;
- tests ciblés et historiques.

Le projet ne contient aucun script `lint` ou `typecheck`. Ils ne sont donc pas
annoncés comme exécutés et aucun script artificiel n’a été ajouté.

## Build

Le build est omis :

- `build:postgresql` cible la production et est interdit ;
- aucun compte Auth réel n’existe pour une validation fonctionnelle ;
- le build SQLite ne démontre pas le cycle Auth distant ;
- il pourrait exiger une configuration Auth réelle absente ;
- 149 tests, contrôles syntaxiques, inspection JSX et scans couvrent les
  contrats ajoutés.

Risque résiduel : le rendu complet Next.js avec une vraie configuration et une
session réelle devra être validé sur recette après création humaine d’un
compte dédié.

## Avis npm audit

Les trois avis élevés relevés en 10E-B concernent la chaîne
Next.js/PostCSS/Sharp déjà présente. 10E-C ne modifie ni `package.json`, ni
`package-lock.json`, ni une version de dépendance au-delà des modifications
10E-B déjà non commitées.

- aucun nouvel avis attribuable à 10E-C ;
- aucun `npm audit fix` ;
- aucun `npm audit fix --force` ;
- aucune mise à niveau automatique.

L’application n’est pas déclarée exempte de vulnérabilités.

## Scan de secrets

Résultat sur les fichiers 10E-B/10E-C :

- aucune vraie service role ou anon key ;
- aucun JWT réel ;
- aucun access token ou refresh token réel ;
- aucun mot de passe réel ;
- aucun header Authorization réel ;
- aucun cookie réel ;
- aucune URL signée ;
- aucune URL PostgreSQL ;
- aucun contenu `.env`.

Les chaînes `fake-*`, `test-*` et `example.invalid` sont exclusivement des
valeurs de test explicites et non réutilisables.

## États protégés finaux

### SQLite

- SHA-256 :
  `8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec`
- aucune écriture.

### Production — `immos`

- `asset_units = 12`
- `asset_files = 0`
- aucune écriture.

### Recette — `immos_recipe_phase8`

- total métier = 253
- `asset_units = 13`
- `asset_files = 0`
- FK orphelines = 0
- aucune écriture.

### Storage

- bucket `asset-files` privé ;
- 0 objet ;
- aucune policy modifiée ;
- aucun upload, delete ou URL signée.

### JPEG historiques

Les trois empreintes restent :

- `4ea6fafc0e1dfec5b1763203715f20c00b2b84720c8ff9158a47a06c440fad4a`
- `ff1a9c1a9ccf30932426389687755d2065074eacaa56948451e03903dac3bd83`
- `d360445ca40c9e7c6afc77bc7d97a2c30c9f58b766cfb5de50db422bd5d393ec`

## Limites de validation

Aucun compte Auth de recette n’a été supposé ou créé. Les éléments suivants ne
sont donc pas encore démontrés contre le service réel :

- acceptation d’identifiants existants ;
- cookies réels émis par le projet Supabase ;
- renouvellement réel d’un refresh token ;
- révocation réelle après logout ;
- configuration Dashboard confirmant l’inscription publique désactivée.

## Plan de validation réelle future

Après création manuelle et contrôlée d’un compte de recette :

1. vérifier que l’inscription publique est désactivée ;
2. utiliser uniquement le compte recette autorisé ;
3. valider login et redirection interne ;
4. inspecter les attributs des cookies sans afficher leur valeur ;
5. valider `getUser()` et le refresh ;
6. valider logout puis refus de la session ;
7. ne créer aucune donnée métier ;
8. ne pas attribuer de rôle pendant cette validation ;
9. supprimer/révoquer le compte selon la décision humaine.

## Confirmations finales

- aucun utilisateur créé ;
- aucune invitation ;
- aucun email envoyé ;
- aucune interface ou action d’inscription publique ;
- aucun rôle attribué ou activé ;
- aucune protection globale du back-office ;
- aucune mutation métier autorisée par Auth ;
- aucune policy ou RLS modifiée ;
- aucune purge exposée ou modifiée ;
- aucune donnée métier modifiée ;
- aucune dépendance ajoutée en 10E-C ;
- aucun commit ;
- aucun push ;
- aucun tag ;
- Phase 10E-D non commencée.
