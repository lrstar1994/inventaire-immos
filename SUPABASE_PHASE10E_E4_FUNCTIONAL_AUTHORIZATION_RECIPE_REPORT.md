# Phase 10E-E4 — Recette fonctionnelle d’autorisation PostgreSQL Supabase

## Statut

**PHASE 10E-E VALIDÉE**

La recette réelle a validé l’authentification, le refus par défaut, les quatre
profils applicatifs, la persistance de session et la déconnexion sur le seul
schéma `immos_recipe_phase8`. La production, SQLite et Storage sont restés
inchangés.

## Git et périmètre

- HEAD initial et final :
  `b1bd83da955f55cbee8a773684eea1dc0933587c`
- aucun commit, push ou tag ;
- aucun schéma Prisma ni migration créé ou modifié ;
- aucun paramètre global Supabase Auth, aucune policy et aucun bucket modifié ;
- `RECIPE_SKIP_PREFLIGHT` n’a pas été utilisé.

Le répertoire contenait avant E4 les changements non commités attendus des
phases 10E précédentes. Les changements propres à E4 sont :

- création de `scripts/validate-recipe-authorization-live.mjs` ;
- correction ciblée de `lib/supabase/session.js` ;
- ajout d’un test de régression dans `scripts/test-auth-foundations.mjs` ;
- création du présent rapport.

## États avant recette

Le prévol PostgreSQL réel, sans contournement, a confirmé :

- recette `immos_recipe_phase8` : 253 lignes métier, 13 `asset_units`,
  0 `asset_files`, 0 FK orpheline ;
- production `immos` : 222 lignes métier, 12 `asset_units`,
  0 `asset_files`.

Le bucket `asset-files` était privé et vide. L’empreinte SQLite était :

`8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec`

## Protocole réel

L’application a été lancée avec :

```text
npm.cmd run dev:postgresql:recipe
```

Le prévol normal a réussi avant le démarrage. La recette a utilisé uniquement
le compte Auth dédié fourni par les variables locales ignorées par Git. Aucune
valeur d’identifiant, mot de passe, cookie ou token n’a été affichée ou
enregistrée.

Une liaison `externalAuthId` temporaire a été appliquée successivement à une
ligne existante de chacun des quatre rôles de recette. Chaque liaison a été
retirée avant la suivante. Le rôle historique et toutes les autres données des
lignes ont été conservés.

Les mutations autorisées ont été appelées avec un corps volontairement invalide :
une réponse HTTP 400 a démontré que l’autorisation avait été franchie, tout en
empêchant toute écriture métier. Les refus de permission ont produit HTTP 403.

## Résultats par scénario

### A — Non authentifié

- accès à une page privée : redirection HTTP 307 vers `/connexion` ;
- `returnTo` interne conservé ;
- aucune boucle et aucune erreur serveur.

### B — Authentifié sans liaison

- connexion Supabase réelle réussie ;
- cookies de session créés sans être affichés ;
- accès Inventaire Immos refusé proprement ;
- aucune attribution automatique de rôle ou de liaison.

### C — BASIC_USER

- page privée et lecture autorisées : HTTP 200 ;
- écriture refusée : HTTP 403 ;
- utilisateurs et rôles refusés : HTTP 403 ;
- `users.manage` absent.

### D — MAINTENANCE_MANAGER

- page privée et lecture autorisées : HTTP 200 ;
- une mutation historiquement autorisée a atteint la validation : HTTP 400,
  sans écriture ;
- écriture AssetFile non permise : HTTP 403 ;
- administration des utilisateurs refusée : HTTP 403 ;
- `users.manage` absent.

### E — INVENTORY_MANAGER

- page privée et lecture autorisées : HTTP 200 ;
- une mutation d’inventaire autorisée a atteint la validation : HTTP 400,
  sans écriture ;
- utilisateurs et rôles refusés : HTTP 403 ;
- `users.manage` absent.

### F — DIRECTION

- page privée autorisée : HTTP 200 ;
- routes utilisateurs et rôles autorisées : HTTP 200 ;
- `users.manage` présent uniquement pour ce rôle.

### G — Session et déconnexion

- utilisateur reconnu après rechargement ;
- bouton de déconnexion présent sur la page privée ;
- déconnexion réelle avec le client de session utilisateur ;
- session supprimée ;
- nouvelle ouverture d’une page privée redirigée vers la connexion ;
- seconde situation sans session traitée sans erreur fatale ;
- aucun client service-role utilisé pour login ou logout.

## Anomalie trouvée et correction

La première requête réelle sans cookie a révélé que le SDK renvoie
`AuthSessionMissingError`. Le helper traitait alors cette absence normale comme
une indisponibilité technique et affichait un refus incorrect au lieu de
rediriger vers la connexion.

La correction est strictement ciblée :

- `AuthSessionMissingError` est normalisée en utilisateur/session absente ;
- les autres erreurs Auth restent des erreurs techniques fermées ;
- aucun message brut, token ou secret n’est exposé ;
- un test de régression couvre `getCurrentUser()` et
  `getCurrentSession()`.

Après correction, le scénario non authentifié réel a produit la redirection
attendue.

## Liaisons temporaires et restauration

- une seule liaison temporaire active à la fois ;
- refus préalable si le compte ou la cible était déjà lié ailleurs ;
- retrait exact après chaque profil ;
- restauration de la valeur `authProvider` initiale ;
- contrôle final : 0 liaison temporaire restante ;
- aucun rôle modifié ;
- aucune ligne créée ou supprimée.

## Tests et contrôles

- tests Auth ciblés après correction : 46/46 réussis ;
- suite locale complète : **181/181 réussis**, 0 échec ;
- garde-fous Recipe ciblés : 4/4 groupes réussis ;
- build SQLite : réussi ;
- TypeScript intégré au build Next.js : réussi ;
- 19 pages générées ;
- avertissement NFT/Turbopack Prisma déjà connu, non bloquant ;
- aucun script autonome `lint` ou `typecheck` n’existe dans `package.json` ;
- `git diff --check` : aucune erreur, seulement les avertissements de fin de
  ligne Windows ;
- serveur de développement arrêté ; aucun listener restant sur 3000/3001.

## Scan de secrets

Les 78 fichiers modifiés ou non suivis ont été comparés aux valeurs sensibles
locales sans afficher ces valeurs :

- correspondance sensible détectée : 0 ;
- `.env.local` confirmé ignoré par Git ;
- aucun mot de passe, JWT, token, cookie, service role, URL PostgreSQL
  authentifiée ou URL signée enregistré dans le diff ou le rapport.

## États après recette

Le prévol PostgreSQL final, réel et sans contournement, a confirmé :

- recette : 253 lignes métier, 13 `asset_units`, 0 `asset_files`,
  0 FK orpheline ;
- production : 222 lignes métier, 12 `asset_units`, 0 `asset_files`.

Storage :

- bucket `asset-files` privé ;
- 0 objet.

SQLite :

- SHA-256 inchangé :
  `8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec`.

JPEG historiques :

- trois fichiers présents ;
- empreintes conformes aux trois références protégées ;
- aucune ouverture en écriture.

## Conclusion

**PHASE 10E-E VALIDÉE**

Les refus 401/redirection et 403, les permissions des quatre rôles, l’unicité
de `users.manage` pour DIRECTION, la session réelle et la déconnexion sont
validés. Tous les états temporaires ont été restaurés. Aucun commit, push ou tag
n’a été effectué.
