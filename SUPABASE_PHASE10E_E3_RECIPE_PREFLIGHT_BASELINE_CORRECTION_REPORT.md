# Phase 10E-E3 — Correction de la référence du prévol Recipe

## Résumé

La baseline obsolète du prévol a été corrigée sans modification de données :

- recette `immos_recipe_phase8` : **253** lignes métier ;
- production `immos` : **222** lignes métier.

Le prévol réel, exécuté deux fois sans contournement, a confirmé les états
protégés. L’application PostgreSQL Recipe a ensuite atteint l’état `Ready` et a
été arrêtée sans navigation fonctionnelle ni mutation.

La recette fonctionnelle d’autorisation 10E-E n’a pas été exécutée.

## Origine de la valeur obsolète

`scripts/preflight-postgresql-recipe.mjs` initialisait :

```text
RECIPE_EXPECTED_TOTAL_ROWS || "222"
```

Cette valeur provenait de l’ancienne parité avec la production. Elle n’avait pas
été actualisée après les validations recette ayant porté le total à 253.

La référence production `222` était correcte. Les rapports 10D-D à 10E-F
confirment de façon répétée :

- recette : 253 lignes, 13 `asset_units`, 0 `asset_files`, 0 FK orpheline ;
- production : 222 lignes, 12 `asset_units`, 0 `asset_files`.

## Correction

Une baseline centralisée et non modifiable a été créée dans
`scripts/postgresql-recipe-protected-baseline.mjs` :

- `recipeTotal=253` ;
- `productionTotal=222` ;
- `recipeAssetUnits=13` ;
- `recipeAssetFiles=0` ;
- `productionAssetUnits=12` ;
- `productionAssetFiles=0` ;
- `recipeForeignKeyOrphans=0`.

Le prévol n’accepte plus une valeur recette fournie indirectement par
`RECIPE_EXPECTED_TOTAL_ROWS`. Une variable locale ne peut donc pas déplacer la
baseline protégée.

Les contrôles existants de provider, client Prisma, port 5432, SSL, schéma
recette, séparation recette/production et blocage par défaut sont conservés.

Le prévol vérifie désormais directement, en lecture seule :

- les deux totaux ;
- les deux comptes `asset_units` ;
- les deux comptes `asset_files` ;
- les principales relations recette susceptibles de produire une FK
  orpheline : fichiers, mouvements, entrées de documents et lignes de
  documents.

## Fichiers créés

- `scripts/postgresql-recipe-protected-baseline.mjs` ;
- `SUPABASE_PHASE10E_E3_RECIPE_PREFLIGHT_BASELINE_CORRECTION_REPORT.md`.

## Fichiers modifiés

- `scripts/preflight-postgresql-recipe.mjs` ;
- `scripts/test-postgresql-recipe-guard.mjs` ;
- `SUPABASE_PHASE10E_E2_CONTROLLED_REMOTE_RECIPE_HOLD_REPORT.md` :
  remplacement de la commande PowerShell utilisant `System.Web.HttpUtility`,
  indisponible sur cet environnement, par l’orchestration Node validée.

Aucun schéma Prisma, migration ou fichier métier n’est modifié.

## Tests

### Baseline et garde-fous

Le test local confirme explicitement :

- 253/222 accepté ;
- l’ancienne baseline 222/222 refusée ;
- toute divergence de total refusée ;
- toute divergence `asset_units` ou `asset_files` refusée ;
- toute FK orpheline refusée ;
- configuration client incohérente refusée ;
- contournement non implicite ;
- contournement refusé hors développement ;
- échec réseau bloquant par défaut.

### Suite locale

Résultat : **180/180 tests réussis, 0 échec**.

Aucun de ces tests n’a contacté Supabase.

## Build et TypeScript

Commande :

```text
npm.cmd run build:sqlite
```

Résultats :

- build SQLite réussi ;
- compilation Next.js réussie ;
- TypeScript intégré réussi ;
- 19 pages générées ;
- avertissement NFT/Turbopack Prisma préexistant et non bloquant.

Il n’existe pas de script TypeScript autonome dans `package.json`.

## Prévol PostgreSQL Recipe réel

Le premier essai d’orchestration a été refusé avant réseau, car
`System.Web.HttpUtility` n’existe pas dans ce PowerShell. Le garde-fou
`schema=immos_recipe_phase8` a fonctionné ; aucune connexion ni donnée n’a été
touchée.

L’orchestration corrigée avec l’API URL de Node.js a ensuite lancé le prévol
avec :

- `RECIPE_SKIP_PREFLIGHT=0` ;
- client `recipe` ;
- connexion session 5432 ;
- `sslmode=require` ;
- schéma `immos_recipe_phase8`.

Résultat réel avant démarrage :

```text
RECIPE_PREFLIGHT_OK
recette total=253, asset_units=13, asset_files=0, FK orphelines=0
production total=222, asset_units=12, asset_files=0
```

Le même prévol a été répété après l’arrêt de l’application et a produit
exactement les mêmes résultats.

## Démarrage Recipe

Commande :

```text
npm.cmd run dev:postgresql:recipe
```

Résultats :

- prévol normal réussi sans contournement ;
- Next.js 16.2.6 démarré sur le port 3000 ;
- état `Ready` atteint en 5,8 secondes ;
- aucune page fonctionnelle appelée ;
- aucun scénario Auth/autorisation exécuté ;
- l’instance et ses 7 processus descendants arrêtés après vérification.

## Intégrité et sécurité

- aucune insertion, mise à jour ou suppression SQL ;
- aucune réinitialisation ou copie de schéma ;
- aucune écriture SQLite ;
- aucune opération Storage ;
- aucune opération Supabase Auth ;
- aucune migration créée ;
- aucun schéma Prisma modifié ;
- aucun contrôle du prévol affaibli ;
- `RECIPE_SKIP_PREFLIGHT` non utilisé pour les validations réelles ;
- aucun secret enregistré dans les fichiers ou ce rapport ;
- aucun commit ;
- aucun push ;
- aucun tag.

## Conclusion

La référence du prévol est corrigée et les états protégés 253/222 sont validés
en lecture seule. Le démarrage PostgreSQL Recipe fonctionne à nouveau.

La recette fonctionnelle d’autorisation 10E-E reste à exécuter séparément.
