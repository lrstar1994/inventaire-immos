# Phase 10E-E2 — Mise en attente contrôlée de la recette distante

## Statut

**PHASE 10E-E BLOQUÉE PAR LA CONNECTIVITÉ RÉSEAU — NON VALIDÉE.**

Le Session pooler Supabase est résolu, mais le port TCP 5432 reste
inaccessible depuis le réseau actuel. Aucun contournement ne peut transformer
cet état en validation de recette.

## Audit statique de `RECIPE_SKIP_PREFLIGHT`

L’audit de `.env.example`, `scripts/run-next-with-database.mjs`,
`scripts/preflight-postgresql-recipe.mjs` et
`scripts/test-postgresql-recipe-guard.mjs` confirme :

- la valeur documentée par défaut est `RECIPE_SKIP_PREFLIGHT=0` ;
- seul `RECIPE_SKIP_PREFLIGHT=1` active le mode ;
- le lanceur n’autorise le marqueur interne de développement que pour `dev` ;
- le mode est refusé pour `build`, `start` et toute exécution non marquée comme
  développement ;
- les validations du backend PostgreSQL, du client `recipe`, du client Prisma
  généré, du port 5432, de `sslmode=require` et du schéma
  `immos_recipe_phase8` sont exécutées avant le contournement ;
- seules les requêtes distantes (schéma réellement actif et totaux protégés)
  sont ignorées ;
- l’avertissement indique désormais explicitement :
  `LA RECETTE DISTANTE N'EST PAS VALIDEE DANS CE MODE.` ;
- le prévol reste bloquant par défaut lorsque PostgreSQL est inaccessible.

`RECIPE_SKIP_PREFLIGHT=1` permet uniquement de démarrer l’environnement de
développement pour diagnostiquer des éléments ne nécessitant pas PostgreSQL.
Il est interdit pour la recette d’autorisation.

## Tests locaux exécutés

Aucun accès distant n’a été tenté.

Commandes :

```powershell
node --check scripts/preflight-postgresql-recipe.mjs
node --check scripts/run-next-with-database.mjs
node --check scripts/test-postgresql-recipe-guard.mjs
node scripts/test-postgresql-recipe-guard.mjs
git diff --check -- .env.example scripts/preflight-postgresql-recipe.mjs scripts/run-next-with-database.mjs scripts/test-postgresql-recipe-guard.mjs
```

Résultats :

- configuration client incohérente refusée avant réseau ;
- contournement explicite accepté en développement avec avertissement ;
- contournement refusé hors développement ;
- indisponibilité simulée sur `127.0.0.1` : échec bloquant et diagnostic clair ;
- mention « recette distante non validée » vérifiée ;
- syntaxe : réussie ;
- `git diff --check` ciblé : réussi ;
- 0 échec.

## Procédure exacte de reprise

### 1. Test TCP

Depuis PowerShell, extraire l’hôte sans afficher l’URL ni ses identifiants :

```powershell
$directLine = Get-Content -LiteralPath '.env.local' |
  Where-Object { $_ -match '^\s*SUPABASE_DIRECT_URL\s*=' } |
  Select-Object -First 1
$directValue = ($directLine -replace '^\s*SUPABASE_DIRECT_URL\s*=\s*', '').Trim().Trim('"').Trim("'")
$directUri = [Uri]$directValue
Test-NetConnection -ComputerName $directUri.Host -Port 5432 -InformationLevel Detailed
```

Condition obligatoire : `TcpTestSucceeded : True`. Sinon, arrêter
immédiatement. Ne pas activer le contournement.

### 2. Prévol sans contournement

Charger les variables locales sans les afficher, construire la cible recette
avec l’API URL de Node.js, puis lancer uniquement le prévol :

```powershell
@'
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { loadSupabaseEnv } from './scripts/supabase-env.mjs';
const loaded = await loadSupabaseEnv();
const recipeUrl = new URL(loaded.SUPABASE_DIRECT_URL);
recipeUrl.searchParams.set('schema', 'immos_recipe_phase8');
const result = spawnSync(
  process.execPath,
  [path.resolve('scripts/preflight-postgresql-recipe.mjs')],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...loaded,
      SUPABASE_DATABASE_URL: recipeUrl.toString(),
      APP_DATABASE_PROVIDER: 'postgresql',
      APP_PRISMA_CLIENT: 'recipe',
      APP_DATABASE_RECIPE_PHASE8: 'true',
      RECIPE_PREFLIGHT_DEVELOPMENT: '1',
      RECIPE_SKIP_PREFLIGHT: '0'
    },
    stdio: 'inherit'
  }
);
process.exit(result.status ?? 1);
'@ | node --input-type=module -
```

Condition obligatoire : résultat `RECIPE_PREFLIGHT_OK`, schéma
`immos_recipe_phase8`, totaux attendus recette/production. Au moindre écart,
arrêter sans lancer Next.js.

### 3. Contrôles d’état avant recette

Effectuer exclusivement les lectures déjà validées :

```powershell
node scripts/verify-postgresql-write-recipe.mjs
node scripts/verify-supabase-structure.mjs
Get-FileHash -Algorithm SHA256 -LiteralPath '.\prisma\dev.db'
Get-ChildItem -LiteralPath '.\public\uploads\assets' -File -Recurse |
  Where-Object Name -ne '.gitkeep' |
  Get-FileHash -Algorithm SHA256
```

Vérifier avant toute liaison :

- production : `asset_units=12`, `asset_files=0` ;
- recette : 253 lignes métier, `asset_units=13`, `asset_files=0`,
  FK orphelines 0 ;
- aucune association temporaire `externalAuthId` ;
- bucket `asset-files` privé et vide ;
- SQLite SHA-256
  `8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec` ;
- trois JPEG aux empreintes historiques attendues.

### 4. Lancement PostgreSQL Recipe

Dans un nouveau PowerShell :

```powershell
$env:RECIPE_SKIP_PREFLIGHT = '0'
npm.cmd run dev:postgresql:recipe
```

Ne poursuivre que si le prévol normal réussit. Conserver le serveur uniquement
pendant la recette, puis l’arrêter avec `Ctrl+C`.

### 5. Scénario de recette d’autorisation

Utiliser le compte Auth de recette déjà préparé, sans afficher ses
identifiants :

1. compte Auth connecté mais sans `externalAuthId` : accès Inventaire Immos
   refusé sans déconnexion Supabase ;
2. liaison contrôlée au profil `DIRECTION` : accès admin et `users.manage` ;
3. retrait exact de la liaison ;
4. liaison au profil `INVENTORY_MANAGER` : fonctions historiques autorisées,
   administration utilisateurs/rôles refusée en 403 ;
5. retrait exact ;
6. liaison au profil `MAINTENANCE_MANAGER` : permissions historiques
   restreintes, `users.manage` refusé ;
7. retrait exact ;
8. liaison au profil `BASIC_USER` : lecture permise, toute mutation refusée ;
9. validation réelle de la déconnexion depuis un profil autorisé ;
10. après déconnexion, accès direct à une page privée redirigé vers
    `/connexion`, sans état utilisateur résiduel ;
11. retrait final de toute association temporaire.

Chaque liaison doit commencer par le dry-run de
`scripts/manage-recipe-auth-link.mjs`, puis utiliser la confirmation exacte
`--confirm=RECIPE_ONLY`. Aucun rôle ne doit être modifié.

### 6. Contrôles après recette

Répéter exactement les contrôles de l’étape 3 et vérifier :

- production inchangée à 12/0 ;
- recette revenue à 253/13/0, FK orphelines 0 ;
- aucune association temporaire restante ;
- bucket toujours privé et vide ;
- SQLite et JPEG inchangés ;
- aucun secret dans Git, les logs ou le rapport.

### 7. Arrêt immédiat en cas d’écart

Si un contrôle diverge :

1. arrêter le scénario et le serveur ;
2. ne pas déplacer l’association vers un autre profil ;
3. ne lancer aucune migration, correction automatique ou contournement ;
4. retirer uniquement la liaison `externalAuthId` exacte créée par la recette,
   après dry-run et contrôle du schéma ;
5. répéter les lectures protégées ;
6. consigner l’écart sans secret ;
7. déclarer la recette interrompue et attendre une décision humaine.

## Fichiers

Créé :

- `SUPABASE_PHASE10E_E2_CONTROLLED_REMOTE_RECIPE_HOLD_REPORT.md`

Modifiés pendant 10E-E2 :

- `scripts/preflight-postgresql-recipe.mjs` : mention explicite que le mode de
  contournement ne valide pas la recette distante ;
- `scripts/test-postgresql-recipe-guard.mjs` : assertion correspondante.

Les autres modifications visibles appartiennent aux phases précédentes.

## États et confirmations

- aucune écriture SQLite ;
- aucune connexion ou écriture PostgreSQL ;
- aucune écriture Storage ;
- aucune écriture Supabase Auth ;
- aucune association `externalAuthId` créée ;
- SQLite inchangée, SHA-256 conforme ;
- aucune migration créée ou modifiée ;
- aucun schéma Prisma modifié ;
- aucune permission, aucun rôle et aucune règle métier modifiés ;
- aucun commit ;
- aucun push ;
- aucun tag.

## Conclusion

**PHASE 10E-E BLOQUÉE PAR LA CONNECTIVITÉ RÉSEAU — NON VALIDÉE.**

La reprise est prête, mais elle ne doit commencer qu’après un test TCP 5432
réussi et un prévol complet exécuté avec `RECIPE_SKIP_PREFLIGHT=0`.
