# Phase 10F-E1 — Création transactionnelle de StorageProvider et alignement de PostgreSQL Production

## Statut

**PHASE 10F-E1 VALIDÉE — PARITÉ STRUCTURELLE COMPLÈTE**

La parité demandée pour le type `StorageProvider` et les quatre colonnes
Storage de `asset_files` est établie entre SQLite, PostgreSQL Recipe et
PostgreSQL Production.

L’unique transaction d’écriture a créé le type enum exact dans `immos`, puis
les quatre colonnes exactes. Aucun enregistrement métier n’a été créé, modifié
ou supprimé.

## Cause de l’arrêt 10F-E

La Phase 10F-E autorisait uniquement quatre `ALTER TABLE ... ADD COLUMN`.
Production ne contenait pas `immos."StorageProvider"` ; la première colonne ne
pouvait donc pas être créée avec le même type que Recipe.

La Phase 10F-E s’est correctement arrêtée avant toute écriture. Aucun
contournement en `text` n’a été appliqué.

## État Git initial

- branche : `master` ;
- HEAD : `6244fdc58b6e908ea3a7483a9e3a0abe313aaf84` ;
- message : `feat(auth): secure Supabase authorization and recipe validation` ;
- aucun fichier suivi modifié ;
- rapports et scripts historiques non suivis conservés ;
- `.env.local` et `prisma/dev.db` confirmés ignorés par Git ;
- aucun schéma Prisma modifié ;
- aucune migration créée.

## État initial protégé

### SQLite

- SHA-256 :
  `9645a17ea36adfba0c8964fbf536c47a323d22f606896112f4ed62334882d5ed` ;
- runtime par défaut inchangé ;
- quatre colonnes Storage déjà présentes ;
- aucune ouverture en écriture pendant 10F-E1.

### PostgreSQL Recipe

- schéma : `immos_recipe_phase8` ;
- total métier : 253 ;
- `asset_units` : 13 ;
- `asset_files` : 0 ;
- FK orphelines : 0 ;
- enum et quatre colonnes présents.

### PostgreSQL Production

- schéma : `immos` ;
- total métier : 222 ;
- `asset_units` : 12 ;
- `asset_files` : 0 ;
- FK orphelines : 0 ;
- enum absent ;
- quatre colonnes Storage absentes.

### Storage

- bucket : `asset-files` ;
- privé ;
- vide.

## Définition exacte extraite de Recipe

Le type a été lu directement dans `pg_type`, `pg_namespace` et `pg_enum`, dans
l’ordre de `enumsortorder`.

| Position | Valeur |
|---:|---|
| 1 | `LOCAL` |
| 2 | `SUPABASE` |

Définition :

```sql
immos_recipe_phase8."StorageProvider" AS ENUM ('LOCAL', 'SUPABASE')
```

La définition a été comparée au DMMF du client Prisma PostgreSQL. Les valeurs,
leur casse et leur ordre sont strictement identiques.

La seule colonne de table Recipe dépendant directement de ce type est :

```text
immos_recipe_phase8.asset_files.storage_provider
```

Deux index Recipe utilisent également cette colonne. Ils ont été recensés
séparément comme index et non comme colonnes de table dépendantes.

## Définition exacte des quatre colonnes

| Colonne | PostgreSQL | Prisma | Nullable | Défaut |
|---|---|---|---:|---|
| `storage_provider` | enum du schéma actif `StorageProvider` | `StorageProvider?` | oui | aucun |
| `storage_bucket` | `text` | `String?` | oui | aucun |
| `storage_key` | `text` | `String?` | oui | aucun |
| `updated_at` | `timestamptz(3)` | `DateTime @updatedAt @db.Timestamptz(3)` | non | aucun |

La table Production contenait zéro `asset_files`. La colonne `updated_at`
non-nullable a donc pu être ajoutée directement, sans `UPDATE`, backfill ou
valeur par défaut.

Les trois index Storage déclarés dans Recipe n’ont pas été ajoutés : les seules
mutations autorisées par 10F-E1 étaient la création du type et quatre
`ADD COLUMN`. Tous les index historiques Production ont été conservés
strictement à l’identique.

## Protections de cible

Le script `scripts/phase10f-e1-align-production.mjs` impose :

- client généré `generated/prisma-postgresql` dont tous les modèles ciblent
  `immos` ;
- URL directe sur le port 5432 ;
- `sslmode=require` ;
- paramètre `schema=immos` ;
- `current_schema() = 'immos'` ;
- table `immos.asset_files` présente ;
- confirmation d’exécution exacte :
  `PHASE10F_E1_CONFIRM_PRODUCTION=ALIGN_IMMOS_STORAGE_COLUMNS` ;
- mode `INSPECT` read-only par défaut ;
- mode `EXECUTE` explicitement demandé ;
- verrou transactionnel consultatif dédié ;
- refus d’un état partiellement aligné ;
- refus d’un enum existant incompatible ;
- refus de toute divergence des structures historiques ;
- refus de totaux autres que 222/12/0 et 253/13/0 ;
- refus de toute FK orpheline.

Le paramètre de connexion imposait TLS. Le signal `pg_stat_ssl` observé derrière
le pooler Supabase n’a pas été utilisé comme autorité, car le TLS peut être
terminé par le pooler ; cette limite est cohérente avec le prévol Recipe
historique, qui impose le port 5432 et `sslmode=require`.

## Sauvegarde logique avant écriture

Le mode `INSPECT`, exécuté dans une transaction `READ ONLY`, a figé :

- 13 colonnes historiques de `immos.asset_files` ;
- types, nullabilité, valeurs par défaut et ordre ;
- contraintes et index ;
- nombre de lignes ;
- checksum logique des colonnes historiques ;
- checksum logique de chacune des 15 tables métier ;
- totaux métier des deux schémas ;
- FK orphelines des deux schémas ;
- définition et dépendance de l’enum Recipe.

Résultats de référence :

- checksum historique `asset_files` :
  `d41d8cd98f00b204e9800998ecf8427e` ;
- snapshot Production :
  `6c1a21a146da2061f3129893bfadfec5db73eea401e21a3e6dae8a1046d60478` ;
- snapshot Recipe :
  `b95142975274d20e8884cbb0ad687ac8b9cfa8128b1564501a979ab0323fab57`.

Ces empreintes sont des contrôles logiques de structure/données ; elles ne
contiennent ni URL, ni secret, ni contenu d’environnement.

## SQL transactionnel exécuté

La transaction Prisma interactive a fourni le `BEGIN`, le `COMMIT` et le
rollback automatique sur toute exception.

Les seules mutations exécutées ont été :

```sql
CREATE TYPE "immos"."StorageProvider" AS ENUM ('LOCAL', 'SUPABASE');

ALTER TABLE "immos"."asset_files"
  ADD COLUMN "storage_provider" "immos"."StorageProvider";

ALTER TABLE "immos"."asset_files"
  ADD COLUMN "storage_bucket" text;

ALTER TABLE "immos"."asset_files"
  ADD COLUMN "storage_key" text;

ALTER TABLE "immos"."asset_files"
  ADD COLUMN "updated_at" timestamptz(3) NOT NULL;
```

Aucun `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `DROP`, `CREATE INDEX`,
`ALTER COLUMN` ou autre DDL n’a été exécuté.

## Contrôles avant COMMIT

Toujours dans la même transaction :

- enum Production présent ;
- valeurs `LOCAL`, `SUPABASE`, dans cet ordre ;
- quatre colonnes présentes ;
- types, schémas de type, précision, nullabilité et défauts exacts ;
- total de colonnes passé de 13 à 17, sans cinquième colonne inattendue ;
- 13 colonnes historiques inchangées ;
- contraintes historiques inchangées ;
- index historiques inchangés ;
- `asset_files` resté à 0 ;
- checksum historique inchangé ;
- snapshot des 15 tables Production inchangé ;
- snapshot des 15 tables Recipe inchangé ;
- totaux et FK inchangés.

La transaction a ensuite été commitée avec succès.

## Contrôles après COMMIT

### Production

- total métier : 222 ;
- `asset_units` : 12 ;
- `asset_files` : 0 ;
- FK orphelines : 0 ;
- enum conforme ;
- quatre colonnes conformes ;
- checksum logique inchangé.

### Recipe

- total métier : 253 ;
- `asset_units` : 13 ;
- `asset_files` : 0 ;
- FK orphelines : 0 ;
- enum et colonnes inchangés ;
- snapshot logique inchangé.

### SQLite

- SHA-256 final :
  `9645a17ea36adfba0c8964fbf536c47a323d22f606896112f4ed62334882d5ed` ;
- aucun changement.

### Storage et Auth

- bucket `asset-files` privé et vide ;
- aucune requête Storage d’écriture ;
- aucune opération Auth ;
- aucun utilisateur, rôle, cookie ou session modifié.

### JPEG historiques

Les trois fichiers sont présents et leurs empreintes historiques restent :

- `4ea6fafc0e1dfec5b1763203715f20c00b2b84720c8ff9158a47a06c440fad4a` ;
- `ff1a9c1a9ccf30932426389687755d2065074eacaa56948451e03903dac3bd83` ;
- `d360445ca40c9e7c6afc77bc7d97a2c30c9f58b766cfb5de50db422bd5d393ec`.

## Validation Prisma Production

Une transaction explicitement `READ ONLY` a exécuté :

- `assetFile.count` ;
- `assetFile.findMany` sans `select` ;
- `assetFile.findFirst` sans `select` ;
- `AssetUnit.findFirst` avec `assetFiles` ;
- lecture individuelle `AssetUnit` avec `assetFiles` ;
- sélection explicite des colonnes historiques ;
- sélection explicite des quatre colonnes Storage.

Résultat :

- sept groupes de lecture réussis ;
- zéro P2022 ;
- zéro ligne fichier, conformément à l’état protégé ;
- aucune mutation Prisma.

## Matrice des 13 scénarios

Le diagnostic a utilisé :

- SQLite en mode fichier `mode=ro` ;
- Recipe dans une transaction `READ ONLY` ;
- Production dans une transaction `READ ONLY` ;
- une garde Prisma refusant toutes les opérations mutantes.

Résultat :

- **13/13 scénarios compatibles** sur les trois runtimes ;
- **0 P2022** ;
- **0 autre incompatibilité** ;
- empreinte SQLite identique avant/après.

Scénarios couverts :

1. profil Auth et rôle ;
2. compteurs du tableau de bord ;
3. liste, recherche, filtres, tri et pagination des immobilisations ;
4. détail sans fichiers ;
5. détail avec relation fichiers implicite ;
6. compteur de fichiers ;
7. liste implicite de toutes les colonnes fichier ;
8. lecture individuelle implicite fichier ;
9. sélection historique explicite ;
10. référentiels ;
11. entrées ;
12. mouvements ;
13. documents.

## Tests, TypeScript et build

- tests historiques : **181/181 réussis** ;
- tests d’alignement 10F-C/10F-D : **6/6 réussis** ;
- tests spécifiques 10F-E1 : **5/5 réussis** ;
- total local : **192/192 réussis**, 0 échec ;
- syntaxe des scripts : réussie ;
- `git diff --check` : réussi ;
- build SQLite : réussi ;
- TypeScript intégré au build Next.js : réussi en 4,1 secondes ;
- 19 pages générées ;
- avertissement NFT/Turbopack Prisma historique, non bloquant ;
- prévol PostgreSQL Recipe réel sans contournement : réussi ;
- prévol Production dédié : mode `INSPECT` réussi en lecture seule.

Un premier jet du test statique 10F-E1 a produit un faux positif sur la méthode
JavaScript `hash.update`. Le test a été restreint aux cinq littéraux DDL, puis
les 5/5 tests ont réussi. Aucun code métier ni DDL n’a été modifié pour masquer
ce résultat.

## Contrôle d’idempotence

Le diagnostic a été relancé en mode `INSPECT`, donc sans mutation.

Résultat :

```text
ALREADY_ALIGNED
```

Il a confirmé :

- enum Production déjà présent et strictement conforme ;
- quatre colonnes déjà présentes et conformes ;
- Production 222/12/0 ;
- Recipe 253/13/0 ;
- zéro FK orpheline ;
- mêmes snapshots logiques ;
- aucune action supplémentaire nécessaire.

## Stratégie de rollback

Aucun rollback destructif n’a été exécuté.

En cas de régression future, l’ordre recommandé est :

1. revenir temporairement au runtime SQLite aligné, dont l’empreinte est connue ;
2. diagnostiquer Production en lecture seule ;
3. restaurer Production depuis une sauvegarde PostgreSQL validée si nécessaire ;
4. ne considérer `DROP COLUMN` ou `DROP TYPE` qu’après sauvegarde, analyse des
   dépendances et phase dédiée.

Un `DROP COLUMN`/`DROP TYPE` immédiat est déconseillé, car il rendrait le retour
arrière potentiellement destructif et casserait de nouveau le contrat Prisma.

## Fichiers créés ou modifiés

Créés :

- `scripts/phase10f-e1-align-production.mjs` ;
- `scripts/test-phase10f-e1-production-alignment.mjs` ;
- `SUPABASE_PHASE10F_E1_POSTGRESQL_ENUM_AND_COLUMNS_ALIGNMENT_REPORT.md`.

Modifié :

- `scripts/diagnose-read-only-functional-parity.mjs` afin d’ajouter Production
  à la matrice read-only existante.

Aucun fichier Prisma, migration, package, environnement, base SQLite, JPEG ou
code métier n’a été modifié.

## Audit des secrets

- aucune valeur de `.env.local` copiée ;
- aucune URL de connexion rapportée ;
- aucun mot de passe, JWT, token, cookie, service role ou header
  d’autorisation exposé ;
- les sorties de validation ne contiennent que des états normalisés, totaux,
  empreintes logiques et définitions structurelles publiques.

## Confirmations finales

- aucune donnée métier modifiée ;
- aucune mutation Recipe ;
- aucune mutation SQLite ;
- aucune écriture Storage ;
- aucune modification Auth ;
- aucune migration créée ;
- aucun schéma Prisma modifié ;
- aucun `prisma migrate` ;
- aucun `prisma db push` ;
- aucun secret exposé ;
- aucun commit ;
- aucun push ;
- aucun tag.

## Conclusion

**PHASE 10F-E1 VALIDÉE — PARITÉ STRUCTURELLE COMPLÈTE**
