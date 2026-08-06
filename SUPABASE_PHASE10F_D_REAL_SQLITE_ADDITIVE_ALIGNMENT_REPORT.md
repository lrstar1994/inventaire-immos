# Phase 10F-D — Alignement additif contrôlé de la base SQLite réelle

## Statut

**PHASE 10F-D VALIDÉE — SQLITE RÉELLE ALIGNÉE ET ROLLBACK DISPONIBLE**

La vraie base SQLite locale a reçu exactement quatre colonnes additives sur
`asset_files`. Les données métier, index, clés étrangères et contraintes
historiques sont inchangés. Les 13 scénarios de lecture sont compatibles,
aucune erreur `P2022` ne subsiste et une sauvegarde binaire historique vérifiée
est conservée hors Git.

## État Git initial

- branche : `master` ;
- HEAD : `6244fdc58b6e908ea3a7483a9e3a0abe313aaf84` ;
- commit : `6244fdc feat(auth): secure Supabase authorization and recipe validation` ;
- aucun fichier suivi modifié ;
- rapports historiques et travaux 10F-A/B/C non suivis déjà connus ;
- aucun diff dans `prisma/` ;
- aucune migration nouvelle ;
- `.env.local` ignoré et non suivi ;
- runtime par défaut : SQLite.

## État initial de SQLite

- chemin réel :
  `E:\projet_la_residence\app-inventaire-immos-avant-toute-instruction\prisma\dev.db` ;
- taille : 507 904 octets ;
- attribut Windows : `Archive` ;
- empreinte historique :
  `8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec` ;
- intégrité : `ok` ;
- tables applicatives et historique Prisma : 16 tables ;
- total métier : 222 ;
- `asset_units` : 12 ;
- `asset_files` : 0 ;
- FK orphelines : 0.

Comptes par table avant intervention :

| Table | Lignes |
|---|---:|
| `users` | 5 |
| `suppliers` | 4 |
| `locations` | 4 |
| `asset_categories` | 3 |
| `asset_items` | 5 |
| `asset_entries` | 10 |
| `asset_units` | 12 |
| `asset_files` | 0 |
| `asset_movements` | 11 |
| `asset_movement_lines` | 13 |
| `asset_documents` | 14 |
| `asset_document_entries` | 19 |
| `asset_document_lines` | 26 |
| `sensitive_action_approvals` | 2 |
| `audit_logs` | 94 |

`asset_files` possédait les 13 colonnes historiques attendues. Les quatre
colonnes Storage étaient absentes.

## Sauvegarde complète

- chemin :
  `backups/phase10f-d/dev-before-asset-files-alignment-20260731T100041732Z.db` ;
- création UTC : `2026-07-31T10:00:43.2833566Z` ;
- mécanisme : copie binaire `Copy-Item`, sans écrasement d’un fichier existant ;
- taille source/sauvegarde : 507 904 / 507 904 octets ;
- empreinte source/sauvegarde :
  `8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec` ;
- attribut source/sauvegarde : `Archive` / `Archive` ;
- ouverture read-only : réussie ;
- intégrité : `ok` ;
- FK : 0 erreur ;
- tables : 16 ;
- `asset_units` : 12 ;
- `asset_files` : 0 ;
- fichier ignoré par `/.gitignore` via `/backup*/` ;
- sauvegarde conservée à la fin de la phase.

Un serveur Next préexistant sur le port 3000 maintenait momentanément la base
ouverte. Il a été identifié par le PID propriétaire du port et arrêté avant la
vérification de la sauvegarde. Aucune modification SQLite n’avait alors eu
lieu.

## Définition appliquée

| Colonne | Type SQLite | Nullabilité | Défaut |
|---|---|---|---|
| `storage_provider` | `TEXT` | nullable | aucun |
| `storage_bucket` | `TEXT` | nullable | aucun |
| `storage_key` | `TEXT` | nullable | aucun |
| `updated_at` | `DATETIME` | non nulle | aucun |

Correspondance Prisma :

- `storageProvider: StorageProvider?` ;
- `storageBucket: String?` ;
- `storageKey: String?` ;
- `updatedAt: DateTime @updatedAt`.

Correspondance PostgreSQL Recipe :

- enum `StorageProvider` nullable ;
- `text` nullable ;
- `text` nullable ;
- `timestamptz(3) NOT NULL`.

## Adaptation du garde 10F-C

`scripts/align-asset-files-sqlite-copy.mjs` conserve son mode copie et ajoute un
mode réel explicitement borné :

- `--confirm-real-sqlite-phase10f-d` obligatoire ;
- `--verified-backup` obligatoire ;
- chemin cible devant être exactement `prisma/dev.db`, y compris après
  résolution ;
- sauvegarde devant être sous `backups/phase10f-d` ;
- empreinte historique exacte obligatoire pour la sauvegarde ;
- intégrité, FK et structure historique de la sauvegarde vérifiées ;
- comparaison logique de la cible avec la sauvegarde ;
- refus d’une cible différente ou d’une URL PostgreSQL ;
- refus d’un alignement partiel ;
- quatre instructions `ADD COLUMN` uniquement ;
- transaction locale et rollback automatique en cas d’écart.

## Commandes SQL exécutées

Uniquement sur `prisma/dev.db`, après validation de la sauvegarde :

```sql
ALTER TABLE "asset_files" ADD COLUMN "storage_provider" TEXT;
ALTER TABLE "asset_files" ADD COLUMN "storage_bucket" TEXT;
ALTER TABLE "asset_files" ADD COLUMN "storage_key" TEXT;
ALTER TABLE "asset_files" ADD COLUMN "updated_at" DATETIME NOT NULL;
```

Aucun `DROP`, `RENAME`, remplacement de table ou changement d’une colonne
historique n’a été exécuté.

## Contrôles immédiatement après modification

- empreinte candidate :
  `9645a17ea36adfba0c8964fbf536c47a323d22f606896112f4ed62334882d5ed` ;
- intégrité : `ok` ;
- colonnes `asset_files` : 17, soit 13 historiques + exactement 4 nouvelles ;
- total métier : 222 ;
- `asset_units` : 12 ;
- `asset_files` : 0 ;
- FK orphelines : 0.

Checksums avant/après :

| Contrôle | Empreinte | Résultat |
|---|---|---|
| données historiques `asset_files` | `4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945` | identique |
| index `asset_files` | `81902e5c91410e830b83d4a4d75f02e52fe2aef3f306c0e6bc12aa9755cb3882` | identique |
| FK `asset_files` | `1b01fe965d24630a50ee7f0d487a5b5d8a2330885fce84201acab39ac3c5bdf0` | identique |

Les cinq index historiques, dont la clé primaire automatique, sont présents.
La FK `asset_unit_id → asset_units.id`, `ON UPDATE CASCADE`,
`ON DELETE RESTRICT`, est inchangée.

## Compatibilité Prisma réelle

Le client `generated/prisma-lot6` a lu la vraie base alignée en mode read-only.
Ont réussi sans `P2022` :

- `assetFile.count()` ;
- `assetFile.findMany()` implicite ;
- `assetFile.findFirst()` implicite ;
- une unité avec relation `assetFiles` ;
- une unité individuelle incluant `assetFiles` ;
- le `select` historique ;
- le `select` des quatre colonnes Storage.

## Matrice de parité

La vraie SQLite était en `mode=ro`. Recipe était dans une transaction vérifiée
`READ ONLY`. Le diagnostic possédait en plus un garde refusant les mutations
Prisma.

| Scénario | Résultat |
|---|---|
| profil Auth, statut et rôle | PARITÉ CONFIRMÉE |
| compteurs du tableau de bord | PARITÉ CONFIRMÉE |
| liste/recherche/filtre/tri/pagination des unités | PARITÉ CONFIRMÉE |
| détail d’unité sans fichiers | PARITÉ CONFIRMÉE |
| unité avec relation `assetFiles` | PARITÉ CONFIRMÉE |
| compteur de fichiers | PARITÉ CONFIRMÉE |
| liste implicite de fichiers | PARITÉ CONFIRMÉE |
| lecture implicite d’un fichier | PARITÉ CONFIRMÉE |
| sélection historique explicite | PARITÉ CONFIRMÉE |
| référentiels | PARITÉ CONFIRMÉE |
| entrées | PARITÉ CONFIRMÉE |
| mouvements | PARITÉ CONFIRMÉE |
| documents | PARITÉ CONFIRMÉE |

Résultat : **13/13 compatibles, 0 `P2022`, 0 autre blocage**.

## Idempotence

Le mécanisme réel a été relancé avec la même confirmation et la même sauvegarde.

- résultat : `ALREADY_ALIGNED` ;
- aucune instruction SQL rejouée ;
- empreinte avant/après :
  `9645a17ea36adfba0c8964fbf536c47a323d22f606896112f4ed62334882d5ed` ;
- aucun changement de données, index ou FK.

## Rollback validé sans restauration définitive

Une copie distincte de la sauvegarde a été créée sous `tmp`, ouverte avec le
client Prisma en lecture seule, puis supprimée :

- utilisateurs lus : 5 ;
- unités lues : 12 ;
- fichiers comptés : 0 ;
- vraie SQLite alignée inchangée pendant cette preuve.

Procédure exacte de restauration, **non exécutée** :

1. arrêter l’application et vérifier que le port 3000 est libre ;
2. vérifier que la SQLite alignée a l’empreinte candidate connue ;
3. vérifier que la sauvegarde a l’empreinte historique et `integrity_check=ok` ;
4. créer une nouvelle sauvegarde de l’état aligné avant retour arrière ;
5. après validation humaine explicite, remplacer atomiquement
   `prisma/dev.db` par une copie de la sauvegarde historique ;
6. rouvrir en read-only, contrôler intégrité, FK et totaux 222/12/0 ;
7. exécuter les tests compatibles avec l’ancien schéma.

Le rollback ramènerait aussi la limitation `P2022` des lectures implicites avec
le client actuel. Il doit donc inclure le retour applicatif au point de
sauvegarde Git approprié ou des lectures historiques explicites.

## Tests, TypeScript et build

- tests historiques : **181/181 réussis** ;
- tests d’alignement/protection : **6/6 réussis** ;
- total : **187/187 réussis**, 0 échec ;
- syntaxe ciblée : réussie ;
- `git diff --check` : réussi ;
- build SQLite : réussi ;
- TypeScript intégré au build : réussi en 861 ms ;
- 19 pages générées ;
- avertissement NFT/Turbopack Prisma historique, non bloquant ;
- prévol Recipe réel sans contournement : `RECIPE_PREFLIGHT_OK`.

Les fixtures des tests 10F-C utilisent désormais la sauvegarde historique
vérifiée comme source non alignée. La vraie SQLite est vérifiée avec sa nouvelle
empreinte alignée.

## Démarrage du runtime SQLite

Le build a été lancé avec `npm run build:sqlite`, puis le runtime construit avec
le provider SQLite explicite. Le smoke test n’a envoyé que des GET :

| Chemin | Statut | Attendu |
|---|---:|---|
| `/connexion` | 200 | page publique |
| `/` | 307 | redirection interne connexion |
| `/parc` | 307 | redirection interne connexion |
| `/documents` | 307 | redirection interne connexion |
| `/mouvements` | 307 | redirection interne connexion |
| `/referentiels` | 307 | redirection interne connexion |
| `/api/health` | 200 | santé disponible |
| `/api/asset-units` | 401 | API privée refusée sans session |

Le premier essai en mode développement avait dépassé le délai pendant la
compilation webpack de `/connexion`, sans erreur applicative. Le smoke final a
donc utilisé le build validé via `next start`.

Le serveur et tout son arbre de processus ont été arrêtés. Aucun processus
n’écoute sur le port 3000. Les logs temporaires ont été supprimés.

## États distants finaux

### PostgreSQL Recipe

- transaction de contrôle : read-only ;
- 253 lignes métier ;
- 13 `asset_units` ;
- 0 `asset_files` ;
- 0 FK orpheline ;
- quatre colonnes Storage présentes ;
- aucune mutation.

### PostgreSQL production

- transaction de contrôle : read-only ;
- 222 lignes métier ;
- 12 `asset_units` ;
- 0 `asset_files` ;
- quatre colonnes Storage toujours absentes ;
- aucune mutation.

### Storage et Auth

- bucket `asset-files` privé ;
- 0 objet ;
- aucune écriture Storage ;
- aucune opération Auth exécutée ;
- aucun paramètre Auth modifié.

### JPEG historiques

- trois fichiers présents ;
- empreintes de référence conformes ;
- aucune écriture.

## Scan de secrets

- aucune valeur Supabase réelle présente dans les fichiers 10F ;
- aucun JWT, cookie, token, mot de passe ou URL signée ajouté ;
- `.env.local` non suivi ;
- aucune valeur sensible reproduite dans le rapport.

## Fichiers créés ou modifiés

Créé :

- `scripts/smoke-sqlite-runtime-readonly.mjs` ;
- `SUPABASE_PHASE10F_D_REAL_SQLITE_ADDITIVE_ALIGNMENT_REPORT.md`.

Modifiés :

- `scripts/align-asset-files-sqlite-copy.mjs` : garde réelle 10F-D, sans
  changement des quatre opérations additives ;
- `scripts/test-phase10f-c-sqlite-alignment.mjs` : fixtures historiques
  réorientées vers la sauvegarde et contrôle de la nouvelle empreinte réelle.

Conservés des phases précédentes :

- diagnostic de parité 10F-B/C ;
- SQL additif SQLite ;
- brouillon PostgreSQL non exécuté ;
- rapports 10F-A/B/C.

Fichiers locaux ignorés :

- vraie SQLite alignée `prisma/dev.db` ;
- sauvegarde historique sous `backups/phase10f-d`.

## Confirmation finale

- aucune donnée métier modifiée ;
- aucune mutation PostgreSQL ;
- aucune écriture Storage ou Auth ;
- aucun schéma Prisma modifié ;
- aucune migration créée ou exécutée ;
- aucun `prisma db push` ou `prisma migrate` ;
- runtime par défaut toujours SQLite ;
- aucun commit ;
- aucun push ;
- aucun tag.
