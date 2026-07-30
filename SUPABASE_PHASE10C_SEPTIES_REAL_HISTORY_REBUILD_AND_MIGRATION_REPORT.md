# Phase 10C septies — Reconstruction réelle et migration finale de la vraie recette

## Conclusion

**Phase 10C réussie et clôturée sur la vraie recette.**

La procédure validée en environnement isolé a été appliquée exactement à `immos_recipe_phase8` :

1. sauvegarde séparée de `_prisma_migrations` ;
2. vérification stricte de toutes les préconditions ;
3. suppression transactionnelle des deux seules lignes de baseline ;
4. résolution propre de `00000000000001_recipe_baseline` ;
5. constat d’une seule migration en attente ;
6. déploiement de `20260729120000_add_asset_file_storage_metadata` uniquement ;
7. validation complète de l’historique, du schéma et des données.

Les 253 lignes métier ont été conservées. Production, SQLite, Storage, les sauvegardes et les trois JPEG sont inchangés.

## Commit de départ et état Git initial

- HEAD : `bd0430be274b672d0c19bf3a5ca49f8d17bc12d3`
- Dernier commit : `bd0430b feat: add recipe-specific prisma migration history`
- Aucun fichier suivi modifié.
- Fichiers non suivis : uniquement les rapports Phase 10C connus.
- `git diff --check` : réussi.

## Intégrité des migrations locales

`git diff HEAD -- prisma/postgresql-recipe/migrations/` : aucune différence.

| Fichier | Taille | SHA-256 |
|---|---:|---|
| `00000000000001_recipe_baseline/migration.sql` | 23 299 octets | `db9d1d7abc508c5ebbe80b15990cd93f89409c034c27fd531bbe5163b2773787` |
| `20260729120000_add_asset_file_storage_metadata/migration.sql` | 754 octets | `27a0d72af6b17913fbbd009dae66466f5063c60a57ac2757a8fc8b2addc2d5b0` |
| `migration_lock.toml` | 24 octets | `1db17a8d051aa136110736752c5e1f8b7ed92b6ea8e803112fbbe2497047c210` |

Contrôles :

- `provider = "postgresql"` ;
- baseline recette présente ;
- migration AssetFile présente ;
- aucune référence exacte au schéma production `"immos"` ;
- aucun secret ;
- aucun chemin absolu ;
- aucun SQL temporaire.

## Dump principal

- Fichier :
  `backups/phase10c/immos_recipe_phase8_before_phase10c_20260729_164842.dump`
- Taille initiale et finale : 86 900 octets
- SHA-256 initial et final :
  `59125d7433656b9e0a10556420fc33b235d764ac2aa53ddfa11c3e186f72086e`
- `pg_restore 17.10 --list` : code 0
- Catalogue : 174 entrées
- Dump hors Git, non stagé et non modifié.

## Sauvegarde dédiée de `_prisma_migrations`

Fichier :

`backups/phase10c-history/immos_recipe_phase8_prisma_migrations_before_phase10c_septies_20260730_123335.dump`

Caractéristiques :

- format PostgreSQL custom ;
- table unique :
  `immos_recipe_phase8._prisma_migrations` ;
- structure et données incluses ;
- taille : 2 879 octets ;
- SHA-256 :
  `5f0cd67504107901f364afc5e032edd347f8a226df94ff90ee5e83d522bba334` ;
- durée de création : 44 048 ms ;
- code `pg_dump` : 0 ;
- `pg_restore --list` : code 0 ;
- catalogue : 18 entrées ;
- une entrée `TABLE DATA` ;
- flux SQL restaurable : code 0 ;
- ancienne baseline présente une fois ;
- baseline recette présente une fois ;
- migration AssetFile absente ;
- fichier hors Git et non stagé.

Aucun secret n’est stocké dans les deux lignes sauvegardées ; leurs champs `logs` étaient vides.

## État production initial

Schéma `immos` :

- `current_schema()` : `immos` ;
- `asset_units` : 12 ;
- `asset_files` : 0 ;
- FK orphelines : 0 ;
- colonnes Phase 10B : absentes ;
- enum `StorageProvider` : absent ;
- migration recette enregistrée : aucune ;
- historique :
  `00000000000000_baseline`.

## État recette initial

Schéma `immos_recipe_phase8` :

- `current_schema()` : `immos_recipe_phase8` ;
- total métier : 253 ;
- `asset_units` : 13 ;
- `asset_files` : 0 ;
- FK orphelines : 0 ;
- `file_path` : présent ;
- colonnes Phase 10B : absentes ;
- enum `StorageProvider` : absent ;
- aucune migration échouée.

### Historique Prisma initial complet

| Migration | Checksum | Début UTC | Fin UTC | Étapes | Rollback | Logs |
|---|---|---|---|---:|---|---|
| `00000000000000_baseline` | `ed0457f…ad545` | 2026-07-28 16:05:32.810872 | 2026-07-28 16:05:35.000094 | 1 | aucun | aucun |
| `00000000000001_recipe_baseline` | `db9d1d7a…b2773787` | 2026-07-30 07:51:15.821923 | 2026-07-30 07:51:15.821923 | 0 | aucun | aucun |

Nombre total exact : 2.

La migration `20260729120000_add_asset_file_storage_metadata` était absente.

## Contrôle du ciblage

- hôte masqué : `aws-…se.com` ;
- port : 5432 ;
- datasource : PostgreSQL ;
- schéma ciblé : `immos_recipe_phase8` ;
- `current_schema()` : `immos_recipe_phase8` ;
- fichier Prisma :
  `prisma/postgresql-recipe/schema.prisma` ;
- dossier de migrations :
  `prisma/postgresql-recipe/migrations`.

Aucune commande d’écriture n’a utilisé le schéma `immos`.

## Préconditions transactionnelles

Sous verrou exclusif sur `_prisma_migrations`, les assertions suivantes ont été vérifiées :

- schéma courant exact ;
- deux migrations au total ;
- ancienne baseline : exactement une ligne ;
- checksum ancienne baseline exact ;
- baseline recette : exactement une ligne ;
- checksum baseline recette exact ;
- migration AssetFile : zéro ligne ;
- migration échouée, annulée ou avec logs : zéro ;
- `asset_units` : 13 ;
- `asset_files` : 0 ;
- FK orphelines : 0 ;
- total métier : 253.

Toute différence aurait levé une exception et provoqué un rollback.

## SQL exact exécuté

La transaction a utilisé :

```sql
BEGIN ISOLATION LEVEL SERIALIZABLE;

LOCK TABLE "immos_recipe_phase8"."_prisma_migrations"
IN ACCESS EXCLUSIVE MODE;

-- Assertions strictes sur le schéma, les deux noms, les checksums,
-- leur état, les comptes métier et les FK.

DELETE FROM "immos_recipe_phase8"."_prisma_migrations"
WHERE "migration_name" IN (
  '00000000000000_baseline',
  '00000000000001_recipe_baseline'
);

-- Assertion : exactement deux lignes supprimées et zéro restante.
-- Nouvelle validation des unités, fichiers et FK.

COMMIT;
```

Ni `TRUNCATE`, ni suppression de table, ni modification métier.

## Résultat de la transaction

- code de sortie : 0 ;
- durée : 2 059 ms ;
- lignes supprimées : exactement 2 ;
- migrations restantes : 0 ;
- `asset_units` : 13 ;
- `asset_files` : 0 ;
- FK orphelines : 0.

### Validation immédiate après commit

- historique recette : vide ;
- total métier : 253 ;
- colonnes Phase 10B : absentes ;
- enum : absent ;
- production : inchangée.

## Migrate resolve

Commande masquée :

```text
prisma migrate resolve --applied 00000000000001_recipe_baseline \
  --schema prisma/postgresql-recipe/schema.prisma
```

- début : `2026-07-30T12:38:14.9170281+03:00`
- fin : `2026-07-30T12:39:33.2457659+03:00`
- durée : 78 329 ms
- code de sortie : 0.

Résultat :

- une seule baseline enregistrée ;
- checksum :
  `db9d1d7abc508c5ebbe80b15990cd93f89409c034c27fd531bbe5163b2773787` ;
- `finished_at` renseigné ;
- `rolled_back_at` nul ;
- `applied_steps_count` : 0 ;
- baseline SQL non exécutée ;
- ancienne baseline absente ;
- migration AssetFile absente ;
- données métier inchangées.

## Migrate status avant deploy

Résultat strict :

- deux migrations locales trouvées ;
- aucune migration inconnue ;
- aucune migration échouée ;
- aucune divergence signalée ;
- exactement une migration en attente :
  `20260729120000_add_asset_file_storage_metadata`.

Le code de statut était 1 uniquement parce qu’une migration restait en attente.

## Migrate deploy

Commande masquée :

```text
prisma migrate deploy \
  --schema prisma/postgresql-recipe/schema.prisma
```

- début : `2026-07-30T12:41:53.5687665+03:00`
- fin : `2026-07-30T12:42:13.1274454+03:00`
- durée : 19 559 ms
- code de sortie : 0.

Migration appliquée, et elle seule :

`20260729120000_add_asset_file_storage_metadata`

La baseline n’a pas été exécutée. Aucune autre migration n’a été appliquée.

## Historique Prisma final

| Migration | Checksum | Étapes | Terminée | Rollback | Logs |
|---|---|---:|---|---|---|
| `00000000000001_recipe_baseline` | `db9d1d7a…b2773787` | 0 | oui | aucun | aucun |
| `20260729120000_add_asset_file_storage_metadata` | `27a0d72a…dc2d5b0` | 1 | oui | aucun | aucun |

- ancienne baseline : absente ;
- migrations totales : 2 ;
- migrations échouées : 0 ;
- checksums conformes ;
- ordre cohérent ;
- statut Prisma final : base à jour.

## Validation du schéma AssetFile

### Enum

`StorageProvider` est présent dans `immos_recipe_phase8` :

- `LOCAL`
- `SUPABASE`

Aucune autre valeur.

L’enum est absent de production.

### Colonnes nouvelles

| Colonne SQL | Type SQL | Nullable | Valeur par défaut finale |
|---|---|---|---|
| `storage_provider` | `StorageProvider` | oui | aucune |
| `storage_bucket` | `text` | oui | aucune |
| `storage_key` | `text` | oui | aucune |
| `updated_at` | `timestamptz` | non | aucune |

Contrôles :

- `file_path` toujours présent, obligatoire et non renommé ;
- aucune colonne historique supprimée ;
- aucun `stored_file_name` ;
- aucune URL persistée.

### Index nouveaux

Tous non uniques :

1. `asset_files_storage_provider_idx`
   - `storage_provider`
2. `asset_files_storage_key_idx`
   - `storage_key`
3. `asset_files_storage_provider_storage_bucket_storage_key_idx`
   - `storage_provider`
   - `storage_bucket`
   - `storage_key`

Tous les index historiques sont conservés. Aucun index unique inattendu n’a été ajouté.

### Contraintes

- PK `asset_files_pkey` inchangée ;
- FK `asset_files_asset_unit_id_fkey` inchangée ;
- type FK inchangé ;
- contrainte MIME historique conservée ;
- FK orphelines : 0.

La règle réelle, historique et inchangée est :

- `ON UPDATE CASCADE`
- `ON DELETE RESTRICT`

La formulation inverse `onDelete = CASCADE / onUpdate = RESTRICT` présente dans la demande ne correspond pas au schéma historique ni aux migrations validées. Aucune règle n’a été modifiée pour la faire correspondre artificiellement.

## Validation des données métier

| Mesure | Avant | Après |
|---|---:|---:|
| Total métier | 253 | 253 |
| `asset_units` | 13 | 13 |
| `asset_files` | 0 | 0 |
| FK orphelines | 0 | 0 |

- aucune ligne créée ;
- aucune ligne supprimée ;
- aucun identifiant métier modifié ;
- aucune donnée métier altérée ;
- aucune ligne `asset_files` créée.

La migration ne comporte aucune opération sur les séquences métier.

## Prisma validate, generate et statut final

| Commande | Code | Durée |
|---|---:|---:|
| `prisma validate` | 0 | 5 047 ms |
| `prisma generate` | 0 | 6 693 ms |
| `prisma migrate status` | 0 | 10 533 ms |

Résultats :

- schéma valide ;
- client Prisma 6.19.3 généré ;
- enum `StorageProvider` généré ;
- `LOCAL` et `SUPABASE` générés ;
- champs Storage et `updatedAt` générés ;
- `filePath` toujours généré ;
- base à jour ;
- aucun P1001 ;
- aucun P2028.

## Build PostgreSQL

`npm run build:postgresql` n’a pas été exécuté.

Audit :

- la commande appelle `run-next-with-database.mjs postgresql build` ;
- le mode `postgresql` sélectionne le client Prisma normal ;
- il utilise la connexion PostgreSQL production ;
- il ne sélectionne pas le client recette ;
- le mode recette distinct impose d’autres garde-fous et n’est pas la commande demandée.

Le build n’aurait donc pas validé la vraie recette et aurait quitté le ciblage strict de cette phase. Cette omission ne constitue pas un échec de migration.

## État protégé final

### Production `immos`

- `asset_units` : 12 ;
- `asset_files` : 0 ;
- FK orphelines : 0 ;
- enum `StorageProvider` : absent ;
- colonnes Phase 10B : absentes ;
- migrations recette enregistrées : 0 ;
- historique inchangé :
  `00000000000000_baseline`.

### Recette `immos_recipe_phase8`

- total métier : 253 ;
- `asset_units` : 13 ;
- `asset_files` : 0 ;
- FK orphelines : 0 ;
- ancienne baseline : absente ;
- baseline recette : présente ;
- migration AssetFile : présente ;
- historique Prisma à jour ;
- enum conforme ;
- colonnes conformes ;
- index conformes ;
- `filePath` conservé ;
- FK historique conservée.

### SQLite

- SHA-256 initial et final :
  `8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec`
- aucune migration appliquée.

### Storage

- bucket `asset-files` privé ;
- 0 objet ;
- aucune écriture ;
- aucune policy modifiée.

### Sauvegardes

Dump principal :

- 86 900 octets ;
- SHA-256 :
  `59125d7433656b9e0a10556420fc33b235d764ac2aa53ddfa11c3e186f72086e`.

Sauvegarde historique :

- 2 879 octets ;
- SHA-256 :
  `5f0cd67504107901f364afc5e032edd347f8a226df94ff90ee5e83d522bba334`.

Les deux fichiers sont intacts, lisibles, hors Git et non stagés.

### JPEG historiques

- 2 405 379 octets —
  `4ea6fafc0e1dfec5b1763203715f20c00b2b84720c8ff9158a47a06c440fad4a`
- 2 107 645 octets —
  `ff1a9c1a9ccf30932426389687755d2065074eacaa56948451e03903dac3bd83`
- 1 501 619 octets —
  `d360445ca40c9e7c6afc77bc7d97a2c30c9f58b766cfb5de50db422bd5d393ec`

Tous inchangés.

## Nettoyage et environnement final

- processus Node : 0 ;
- processus `psql` : 0 ;
- processus `pg_dump` : 0 ;
- processus `pg_restore` : 0 ;
- port 3000 libre ;
- port 3018 libre ;
- aucun cluster local créé pendant cette phase ;
- aucun schéma temporaire ;
- aucun fichier temporaire contenant un secret ;
- aucune URL complète enregistrée ;
- aucun artefact de build.

## État Git final

- HEAD :
  `bd0430be274b672d0c19bf3a5ca49f8d17bc12d3`
- dernier commit inchangé ;
- aucun fichier Prisma, migration, application ou configuration modifié ;
- seuls les rapports Phase 10C, dont le présent rapport, sont non suivis ;
- `git diff --check` : réussi ;
- aucun commit ;
- aucun push ;
- aucun tag.

## Confirmations finales

- ancienne baseline supprimée uniquement de l’historique recette ;
- baseline SQL non exécutée ;
- baseline recette uniquement résolue ;
- une seule migration AssetFile déployée ;
- aucune donnée métier altérée ;
- aucune migration appliquée à production ;
- aucune migration appliquée à SQLite ;
- aucune ligne `asset_files` créée ;
- aucun objet Storage créé ;
- aucune policy modifiée ;
- aucun secret exposé ;
- aucun commit ;
- aucun push ;
- aucun tag ;
- Phase 10D non commencée.
