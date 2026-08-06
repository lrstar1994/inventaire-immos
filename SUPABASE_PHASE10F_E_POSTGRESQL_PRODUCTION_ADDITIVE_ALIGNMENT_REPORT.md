# Phase 10F-E — Alignement additif contrôlé de PostgreSQL Production

## Statut

**PHASE 10F-E NON VALIDÉE — ARRÊT AVANT ÉCRITURE**

L’intervention a été arrêtée pendant le prévol, avant toute mutation. Le type
PostgreSQL `immos."StorageProvider"` requis par la colonne
`asset_files.storage_provider` est absent du schéma de production.

Les contraintes de la phase autorisent exclusivement les quatre opérations
`ALTER TABLE ... ADD COLUMN` et interdisent toute autre modification. Il est
donc impossible de créer la colonne avec son type exact sans exécuter au
préalable un `CREATE TYPE`, opération non autorisée dans cette phase.

Aucun contournement en `text` n’a été appliqué : il aurait créé une divergence
avec PostgreSQL Recipe et avec le contrat Prisma PostgreSQL.

## État Git initial

- branche : `master` ;
- HEAD : `6244fdc58b6e908ea3a7483a9e3a0abe313aaf84` ;
- message : `feat(auth): secure Supabase authorization and recipe validation` ;
- aucun fichier suivi modifié avant l’audit ;
- rapports et scripts historiques non suivis conservés ;
- `.env.local`, `prisma/dev.db` et la sauvegarde SQLite 10F-D confirmés ignorés
  par Git.

## Contrôles initiaux

### SQLite

- fichier : `prisma/dev.db` ;
- SHA-256 attendu et obtenu :
  `9645a17ea36adfba0c8964fbf536c47a323d22f606896112f4ed62334882d5ed` ;
- taille : 507 904 octets ;
- aucune ouverture en écriture ;
- runtime par défaut inchangé.

### PostgreSQL Recipe

Contrôle distant exécuté dans une transaction explicitement `READ ONLY` :

- schéma : `immos_recipe_phase8` ;
- total métier : 253 ;
- `asset_units` : 13 ;
- `asset_files` : 0 ;
- FK orphelines : 0 ;
- quatre colonnes Storage présentes.

### PostgreSQL Production

Contrôle distant exécuté dans la même transaction `READ ONLY` :

- schéma : `immos` ;
- total métier : 222 ;
- `asset_units` : 12 ;
- `asset_files` : 0 ;
- FK orphelines : 0 ;
- quatre colonnes Storage absentes.

### Storage

- bucket : `asset-files` ;
- privé : oui ;
- objets : 0 ;
- inspection strictement en lecture.

## Définition attendue des quatre colonnes

| Colonne | Définition PostgreSQL Recipe | Nullabilité | Défaut |
|---|---|---:|---|
| `storage_provider` | enum `StorageProvider` (`LOCAL`, `SUPABASE`) | nullable | aucun |
| `storage_bucket` | `text` | nullable | aucun |
| `storage_key` | `text` | nullable | aucun |
| `updated_at` | `timestamptz(3)` | non nullable | aucun |

Le schéma Recipe contient le type
`immos_recipe_phase8."StorageProvider"` avec exactement les valeurs `LOCAL` et
`SUPABASE`.

Le schéma Production ne contient aucun type
`immos."StorageProvider"`.

## Cause de l’arrêt

La première commande additive fidèle aurait dû référencer :

```sql
ALTER TABLE "immos"."asset_files"
  ADD COLUMN "storage_provider" "immos"."StorageProvider";
```

Cette commande ne peut pas réussir tant que le type
`immos."StorageProvider"` n’existe pas.

Le brouillon préparé en Phase 10F-C anticipait explicitement ce cas avec un
`CREATE TYPE ... AS ENUM ('LOCAL', 'SUPABASE')`. La présente phase interdit
cependant toute opération autre que les quatre `ADD COLUMN`. Ce brouillon n’a
donc pas été exécuté.

Créer `storage_provider` en `text` n’a pas été retenu, car cela ne produirait
pas la parité structurelle demandée et ne respecterait pas le modèle Prisma
PostgreSQL.

## Opérations exécutées

Opérations distantes :

- lecture de l’identité et des schémas ;
- lecture des totaux protégés ;
- lecture des FK orphelines ;
- lecture de `information_schema.columns` ;
- lecture de `pg_type`, `pg_namespace` et `pg_enum` ;
- lecture des index `asset_files` ;
- lecture de la configuration du bucket et listing borné à un objet.

Opérations explicitement non exécutées :

- aucun `CREATE TYPE` ;
- aucun `ALTER TABLE` ;
- aucun `INSERT`, `UPDATE`, `DELETE` ou `TRUNCATE` ;
- aucun `CREATE INDEX` ;
- aucun changement de contrainte ;
- aucun appel Prisma de mutation ;
- aucune migration Prisma ;
- aucun `prisma migrate` ;
- aucun `prisma db push`.

## Diagnostics Prisma, tests et build

Les diagnostics Prisma post-alignement, les tests ciblés et le build
TypeScript n’ont pas été lancés. Leur précondition — l’alignement effectif des
quatre colonnes — n’était pas satisfaite, et l’arrêt immédiat était obligatoire.

Les résultats validés de la Phase 10F-D restent la dernière référence :

- 187/187 tests réussis ;
- build SQLite réussi ;
- TypeScript réussi ;
- diagnostics P2022 réussis sur SQLite alignée et PostgreSQL Recipe.

## État final et absence d’impact

- SQLite : empreinte inchangée ;
- PostgreSQL Production : 222 / 12 / 0, quatre colonnes toujours absentes ;
- PostgreSQL Recipe : 253 / 13 / 0, FK orphelines = 0, inchangé ;
- Storage : bucket privé et vide ;
- Auth : aucune opération ;
- Prisma : aucun schéma modifié, aucune migration créée ;
- Git : aucun commit, aucun push, aucun tag.

## Décision humaine requise

Une phase corrigée doit autoriser explicitement, dans une transaction unique et
après les mêmes prévols :

1. la création exacte du type `immos."StorageProvider"` avec les seules valeurs
   `LOCAL` et `SUPABASE` ;
2. les quatre `ALTER TABLE ... ADD COLUMN` ;
3. les contrôles structurels, logiques et Prisma avant commit de la transaction.

Sans cette autorisation explicite, la parité structurelle complète ne peut pas
être obtenue de manière fidèle.

## Conclusion

**PHASE 10F-E NON VALIDÉE — ARRÊT AVANT ÉCRITURE**

Aucune donnée, aucun schéma protégé, aucun objet Storage et aucun état Auth n’a
été modifié.
