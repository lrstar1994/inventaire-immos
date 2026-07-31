# Phase 10E-D1 — Vérification de la projection des rôles

## Statut

Phase 10E-D1 réussie : contradiction documentaire corrigée et séparation des
rôles renforcée par des tests explicites.

## Origine de la contradiction

La section d’architecture initiale du rapport 10E-D associait par erreur
`INVENTORY_MANAGER` à `admin`. Cette phrase provenait de la rédaction
pré-implémentation. La matrice finale du même rapport et le code implémenté
étaient, eux, restrictifs.

## Projection réellement présente avant correction

Le code de `lib/authorization.js` contenait déjà :

- `DIRECTION` → `admin` ;
- `INVENTORY_MANAGER` → `gestionnaire` ;
- `MAINTENANCE_MANAGER` → `gestionnaire` ;
- `BASIC_USER` → `lecture_seule`.

`INVENTORY_MANAGER` ne possédait pas `users.manage`. Aucun changement du code
de projection ou des permissions n’a donc été nécessaire.

## Audit des helpers

- `getCurrentAppUser()` lit le rôle uniquement depuis la ligne `User` associée
  au `user.id` Auth vérifié ;
- `requireRole()` compare le rôle applicatif projeté et retourne
  `insufficient_role`/403 en cas d’écart ;
- `requirePermission()` recalcule l’utilisateur autorisé puis vérifie la
  permission serveur ;
- aucun rôle, `isAdmin`, `userId`, header ou metadata envoyé par le client ne
  peut modifier le résultat.

## Routes utilisateurs et rôles

Les handlers suivants exigent tous
`authorizeApiRequest(APP_PERMISSIONS.USERS_MANAGE)` avant lecture ou mutation :

- `app/api/users/route.js` ;
- `app/api/users/[id]/route.js` ;
- `app/api/roles/route.js`.

Seul `DIRECTION` possède cette permission. Les contrôles historiques
`canManageUsers()` restent également en défense supplémentaire sur les
mutations.

## Projection finale

- `DIRECTION` → `admin`
- `INVENTORY_MANAGER` → `gestionnaire`
- `MAINTENANCE_MANAGER` → `gestionnaire`, avec permissions historiques plus
  restreintes
- `BASIC_USER` → `lecture_seule`

## Matrice finale

| Rôle historique | Rôle applicatif | Lecture | Biens/documents | Mouvements | Fichiers | Référentiels | `users.manage` |
|---|---|---:|---:|---:|---:|---:|---:|
| `DIRECTION` | `admin` | oui | écriture | création/gestion | upload/gestion | écriture | **oui** |
| `INVENTORY_MANAGER` | `gestionnaire` | oui | écriture | création/gestion | upload/gestion | écriture | **non** |
| `MAINTENANCE_MANAGER` | `gestionnaire` | oui | non | création seulement | upload seulement | non | **non** |
| `BASIC_USER` | `lecture_seule` | oui | non | non | lecture | non | **non** |

## Fichiers créés et modifiés

Créé :

- `SUPABASE_PHASE10E_D1_ROLE_PROJECTION_CORRECTION_REPORT.md`

Modifiés :

- `SUPABASE_PHASE10E_D_AUTHORIZATION_REPORT.md` : correction de la projection
  contradictoire ;
- `scripts/test-app-authorization.mjs` : preuves restrictives supplémentaires.

Le code d’autorisation, les routes, les schémas et les données ne sont pas
modifiés par 10E-D1.

## Tests renforcés

Cinq tests explicites supplémentaires démontrent :

1. `users.manage` appartient uniquement à `DIRECTION` ;
2. `requireRole(admin)` refuse `INVENTORY_MANAGER` ;
3. les routes utilisateurs et rôles acceptent `DIRECTION` et produisent 403
   pour les trois autres rôles ;
4. les valeurs `role`, `isAdmin`, `user_metadata` et `app_metadata` du client
   n’accordent aucun droit ;
5. les ensembles exacts de permissions historiques des deux gestionnaires
   restent inchangés.

Les résultats complets, le build et les états protégés sont consignés après les
contrôles finaux ci-dessous.

## Résultats des contrôles

- tests historiques et nouveaux : **171/171 réussis, 0 échec** ;
- nouveaux tests 10E-D1 : 5 ;
- build SQLite : réussi ;
- compilation TypeScript intégrée au build : réussie ;
- `git diff --check` : réussi ;
- lint autonome : non exécuté, aucun script `lint` n’existe ;
- typecheck autonome : non exécuté, aucun script `typecheck` n’existe ;
- build PostgreSQL : non exécuté, inutile pour une correction documentaire et
  des tests unitaires de projection ;
- avertissement NFT/Turbopack préexistant conservé, sans échec du build.

## Scan de secrets

Le scan ciblé des deux rapports et du test modifié ne détecte :

- aucun JWT ;
- aucune URL PostgreSQL ;
- aucun bearer token ;
- aucune clé Supabase réelle.

## États protégés avant/après

| État | Avant | Après |
|---|---:|---:|
| SQLite SHA-256 | `8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec` | identique |
| production `asset_units` | 12 | 12 |
| production `asset_files` | 0 | 0 |
| recette lignes métier | 253 | 253 |
| recette `asset_units` | 13 | 13 |
| recette `asset_files` | 0 | 0 |
| recette FK orphelines | 0 | 0 |
| bucket privé | oui | oui |
| objets Storage | 0 | 0 |

Les trois JPEG historiques restent inchangés :

- `4ea6fafc0e1dfec5b1763203715f20c00b2b84720c8ff9158a47a06c440fad4a`
- `ff1a9c1a9ccf30932426389687755d2065074eacaa56948451e03903dac3bd83`
- `d360445ca40c9e7c6afc77bc7d97a2c30c9f58b766cfb5de50db422bd5d393ec`

## Limites restantes

- aucune attribution réelle de rôle n’a été testée ;
- aucune association `externalAuthId` n’a été créée ;
- la recette réelle des profils reste volontairement différée ;
- la contrainte d’unicité future de `externalAuthId` reste hors périmètre.

## Confirmations

- aucun compte créé ;
- aucun rôle attribué ;
- aucune association Auth modifiée ;
- aucune donnée métier modifiée ;
- aucune migration ;
- aucun paramètre global Supabase Auth modifié ;
- aucune policy, RLS ou donnée Storage modifiée ;
- aucun commit ;
- aucun push ;
- aucun tag ;
- recette réelle 10E-E non commencée.
