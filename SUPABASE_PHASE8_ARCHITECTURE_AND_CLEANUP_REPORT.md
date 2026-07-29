# Phase 8 — Sécurisation Prisma et nettoyage contrôlé

Date : 2026-07-29
Commit courant : `36a446d1c38d1e032830ed8f591b77407d4acd21`
Commit créé : aucun

## Résultat

- Deux clients PostgreSQL indépendants sont désormais générés.
- Le client normal encode statiquement `@@schema("immos")`.
- Le client recette encode statiquement `@@schema("immos_recipe_phase8")`.
- La sélection applicative est explicite avec `APP_PRISMA_CLIENT`.
- Une garde contrôle `current_schema()` avant chaque écriture Prisma PostgreSQL.
- Les 14 lignes accidentelles ont été supprimées de `immos` dans une transaction atomique.
- `immos`, `immos_recipe_phase8` et SQLite sont à nouveau identiques sur 15/15 tables.
- Aucun test HTTP n'a été relancé.

## Architecture Prisma avant

| Schéma source | Provider | Générateur / sortie | Schéma PostgreSQL statique |
|---|---|---|---|
| `prisma/schema.prisma` | SQLite | `generated/prisma-lot6` | sans objet |
| `prisma/postgresql/schema.prisma` | PostgreSQL | `generated/prisma-postgresql` | `immos` |

Le démarrage de recette réutilisait `generated/prisma-postgresql` en changeant
uniquement `schema=` dans l'URL. Cette stratégie était incorrecte, car les
annotations `@@schema("immos")` des modèles restaient prioritaires.

Clients générés historiques présents avant cette phase :

- `generated/prisma`
- `generated/prisma-lot3`
- `generated/prisma-lot4`
- `generated/prisma-lot4b`
- `generated/prisma-lot5`
- `generated/prisma-lot5b`
- `generated/prisma-lot5c`
- `generated/prisma-lot6`
- `generated/prisma-postgresql`

Les instanciations Prisma ont été recensées dans :

- la couche applicative `lib/prisma.js` ;
- `prisma/seed.js` ;
- les scripts de diagnostic, migration, comparaison et recette sous `scripts/`.

Les scripts administratifs conservent une cible explicite. La couche applicative
est maintenant centralisée dans la factory.

## Architecture Prisma après

| Usage | Schéma source | Client généré | Schéma statique |
|---|---|---|---|
| SQLite | `prisma/schema.prisma` | `generated/prisma-lot6` | `main` |
| PostgreSQL normal | `prisma/postgresql/schema.prisma` | `generated/prisma-postgresql` | `immos` |
| PostgreSQL recette | `prisma/postgresql-recipe/schema.prisma` | `generated/prisma-recipe` | `immos_recipe_phase8` |

Le schéma recette contient 27 annotations
`@@schema("immos_recipe_phase8")`, couvrant les modèles et enums PostgreSQL.
Le schéma normal conserve ses 27 annotations `@@schema("immos")`.

## Sélection et protections

La factory `lib/prisma-client-factory.js` accepte explicitement :

- `provider=sqlite`, `clientSelection=sqlite` ;
- `provider=postgresql`, `clientSelection=normal` ;
- `provider=postgresql`, `clientSelection=recipe`.

Protections :

1. le client normal refuse une URL dont `schema` n'est pas `immos` ;
2. le client recette refuse une URL dont `schema` n'est pas
   `immos_recipe_phase8` ;
3. le démarrage recette exige le port 5432 et `sslmode=require` ;
4. avant chaque écriture PostgreSQL, la garde exécute `current_schema()` ;
5. le journal de garde contient uniquement provider, nom du client, schéma
   attendu et schéma réel ;
6. toute divergence bloque l'écriture avant son exécution ;
7. le client est mis en cache avec une clé distincte par provider et sélection.

Validation indépendante effectuée :

| Client | Schéma attendu | `current_schema()` | Lecture fournisseurs |
|---|---|---|---:|
| normal | `immos` | `immos` | 5 avant nettoyage |
| recette | `immos_recipe_phase8` | `immos_recipe_phase8` | 4 |

## Nettoyage de `immos`

Campagne : `PG-RECIPE-PHASE8-20260729025413`.

Le script a vérifié avant transaction :

- `current_schema()=immos` ;
- 6 lignes métier exactement ;
- 8 audits exactement ;
- préfixe de campagne sur chaque nom métier ;
- correspondance de chaque audit avec un identifiant métier de campagne.

Lignes supprimées :

| Table | Identifiant | Nature |
|---|---|---|
| `suppliers` | `cms5hqxbq0000v59ws1hoghhs` | fournisseur |
| `locations` | `cms5hrfzy0005v59w8r9cbxep` | racine |
| `locations` | `cms5hrgui0009v59wlha3q8i0` | enfant |
| `asset_categories` | `cms5hrkrj000ev59wg4r8sl8r` | racine |
| `asset_categories` | `cms5hrls8000iv59w4a6uis6p` | enfant |
| `asset_items` | `cms5hrnef000mv59wnej2rner` | article |
| `audit_logs` | `cms5hqyhu0002v59wqfqi2dn0` | création fournisseur |
| `audit_logs` | `cms5hrdus0004v59wjsv21mqh` | modification fournisseur |
| `audit_logs` | `cms5hrgdw0007v59wfza1my7w` | création emplacement |
| `audit_logs` | `cms5hrh87000bv59w5go6ke0p` | création emplacement |
| `audit_logs` | `cms5hrjwl000dv59wlc8dxf1j` | modification emplacement |
| `audit_logs` | `cms5hrl9l000gv59wdpky9ybd` | création catégorie |
| `audit_logs` | `cms5hrm5v000kv59w5k58ut58` | création catégorie |
| `audit_logs` | `cms5hrns2000ov59w8v9h96q4` | création article |

Ordre : audits, article, catégories enfant/racine, emplacements enfant/racine,
fournisseur.

Résultat : `COMMIT`, 14 suppressions. Aucune ligne historique n'a été ciblée.

## Validation finale

### `immos`

- 15 tables ;
- 222 lignes ;
- comparaison SQLite : 15/15 identiques ;
- 12 références historiques d'audit conservées ;
- `asset_files=0`.

### `immos_recipe_phase8`

- conservé ;
- 222 lignes ;
- comparaison avec `immos` : 15/15 identiques ;
- 0 violation de clé étrangère ;
- `asset_files=0`.

### SQLite

- SHA-256 :
  `8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec`.
- inchangée.

### Storage

- bucket `asset-files` privé ;
- limite 10 Mio ;
- types autorisés inchangés ;
- zéro objet ;
- aucune politique publique.

### Validation technique

- schéma Prisma normal : valide ;
- schéma Prisma recette : valide ;
- génération `generated/prisma-recipe` : réussie ;
- build SQLite : réussi ;
- build PostgreSQL normal : réussi ;
- avertissement Turbopack déjà connu, non traité.

## Fichiers créés ou modifiés par cette phase

- `prisma/postgresql-recipe/schema.prisma`
- `generated/prisma-recipe/` — généré localement, non destiné au commit
- `lib/prisma-client-factory.js`
- `lib/prisma.js`
- `scripts/run-next-with-database.mjs`
- `scripts/validate-prisma-client-isolation.mjs`
- `scripts/cleanup-immos-phase8-accident.mjs`
- `package.json`
- `SUPABASE_PHASE8_ARCHITECTURE_AND_CLEANUP_REPORT.md`

Le schéma temporaire n'a pas été supprimé, aucun serveur n'a été démarré et aucun
test HTTP n'a été exécuté.
