# Phase UX-FILES-B — Socle minimal des fichiers AssetEntry

## Résultat

Le socle local permet désormais à un `AssetFile` d’appartenir exclusivement à une `AssetEntry` ou à une `AssetUnit`. Les fichiers historiques d’unités restent compatibles. Aucune interface d’upload dans `/parc` n’a été ajoutée.

## Fichiers modifiés ou créés

- `prisma/schema.prisma`
- `prisma/postgresql/schema.prisma`
- `prisma/postgresql-recipe/schema.prisma`
- `prisma/migrations/20260821120000_add_asset_entry_files/migration.sql`
- `prisma/postgresql/migrations/20260821120000_add_asset_entry_files/migration.sql`
- `prisma/postgresql-recipe/migrations/20260821120000_add_asset_entry_files/migration.sql`
- `lib/asset-file-constants.js`
- `lib/asset-file-service.js`
- `lib/storage/storage-key.js`
- `app/api/asset-files/route.js`
- `app/api/asset-entries/[id]/files/route.js`
- `app/api/asset-entries/[id]/files/[fileId]/route.js`
- `scripts/test-entry-file-foundation.mjs`
- `SUPABASE_UX_FILES_B_ENTRY_FILE_FOUNDATION_REPORT.md`

## Modèle final

- Nouvel enum `AssetFileKind` : `MATERIAL_PHOTO`, `SUPPORTING_DOCUMENT`.
- `AssetFile.assetUnitId` devient nullable.
- Ajout de `AssetFile.assetEntryId` nullable et de la relation inverse `AssetEntry.assetFiles`.
- `fileKind` reste nullable pour préserver sans classification arbitraire les lignes historiques ; il est obligatoire dans le nouveau service d’upload d’entrée.
- Contrainte DB XOR : exactement un propriétaire parmi entrée et unité.
- Une photo principale doit être une image et ne peut pas être `SUPPORTING_DOCUMENT`.
- Index unique partiel : au maximum une photo principale active par entrée.
- Suppression logique existante conservée (`deletedAt`, `isPrimary=false`).

Les validations serveur imposent aussi la cohérence entre catégorie, sous-type et MIME. Un justificatif ne peut pas être principal.

## Migration

- Migration SQLite locale appliquée : `20260821120000_add_asset_entry_files`.
- La modification de nullabilité SQLite utilise la reconstruction de table standard, avec copie intégrale puis recréation des contraintes et index. Elle est additive fonctionnellement : aucune ligne métier n’est supprimée, convertie ou créée.
- Migrations PostgreSQL Production et Recipe préparées, strictement additives (`ALTER/ADD`, aucun DML métier), mais non appliquées.
- Aucun seed et aucun déplacement/renommage de fichier Storage.

Sauvegarde locale : `backups/ux-files-b/dev-before-ux-files-b-20260821.db`.

## Compatibilité historique

- Les anciens fichiers restent propriétaires d’un `AssetUnit`, avec `assetEntryId=null` et `fileKind=null`.
- Le flux historique d’upload AssetUnit réutilise le même pipeline et infère le kind pour les nouveaux fichiers seulement.
- Les métadonnées et chemins historiques ne sont pas modifiés.
- Q/QI, positions quantitatives, mouvements quantitatifs et EquipmentSet ne sont pas touchés.

## Service et Storage

- Pipeline commun réutilisé : validation nom/MIME/taille/contenu, permissions, Storage, compensation en cas d’échec Prisma, transaction, audit et suppression logique.
- Nouveaux objets Supabase d’entrée : `assets/entries/{entryId}/{fileId}/{fileId}.{extension}`.
- En local, la racine existante `public/uploads/assets` reçoit les objets sous `entries/{entryId}/...`.
- Les objets d’unités existants et futurs conservent leur organisation actuelle.
- DIRECTION et INVENTORY_MANAGER conservent la gestion complète ; MAINTENANCE_MANAGER conserve sa restriction existante à `DEFECT_PHOTO` image non principale.

## API

- `GET /api/asset-entries/[id]/files` : entrée, fichiers actifs et options.
- `POST /api/asset-entries/[id]/files` : upload d’un fichier propriétaire de l’entrée.
- `PATCH /api/asset-entries/[id]/files/[fileId]` : métadonnées/photo principale, avec contrôle d’appartenance.
- `DELETE /api/asset-entries/[id]/files/[fileId]` : suppression logique, avec contrôle d’appartenance.
- `GET /api/asset-files` accepte aussi le filtre `assetEntryId`.
- Les réponses utilisent le DTO d’accès existant et n’exposent pas directement les métadonnées internes Storage.

## Tests et validations

- Tests ciblés UX-FILES-B : **9/9 réussis**.
- Couverture : photos multiples, justificatif, unicité principale, refus document principal, XOR propriétaire, compatibilité historique AssetUnit, suppression logique, clés Storage et présence des routes/services.
- Trois schémas Prisma : **valides**. Les deux validations PostgreSQL ont utilisé uniquement une URL factice syntaxique et n’ont ouvert aucune connexion.
- Build SQLite : **réussi**.
- TypeScript intégré au build : **réussi**.
- `git diff --check` : **réussi**.
- Scan ciblé de secrets : **aucun résultat**.
- Avertissement NFT Turbopack historique : présent, non bloquant et hors périmètre.

## État SQLite

- SHA-256 avant : `8FDE5146A660D180B895E965A1AC21489D888213B08BDB4F87FF8929151D32B1`.
- SHA-256 après : `1420BDCAAAB68247CEE3BFDD4793D9CDC4CEF55F18558224F4600EFBC425FCC7`.
- `PRAGMA integrity_check` : `ok`.
- `PRAGMA foreign_key_check` : 0 erreur.
- Volumes avant/après inchangés :
  - catégories : 3 ;
  - références : 5 ;
  - entrées : 10 ;
  - unités : 12 ;
  - mouvements : 11 ;
  - documents : 14 ;
  - fichiers : 0 ;
  - positions quantitatives : 0 ;
  - lignes quantitatives : 0.

## Différé volontairement à UX-FILES-C

- interface d’upload immédiatement après création d’entrée ;
- upload multiple, miniatures, progression et prise photo mobile ;
- feedback UX-1 et CTA associés ;
- affichage des fichiers dans les dernières entrées ;
- héritage visuel sur `/parc/[id]` pour une entrée I de quantité 1 ;
- distinction visuelle entre fichiers propres au bien et fichiers hérités du lot.

L’héritage ne nécessitera aucune copie : une photo principale propre à l’unité restera prioritaire. Aucune logique UI n’a été modifiée dans cette phase.

## Protections

- Production et Recipe non contactées et non migrées.
- Aucun changement Supabase Auth, Storage distant, Q/QI, EquipmentSet, Documents ou Mouvements.
- Aucun staging, commit, push, tag ou déploiement.

## Conclusion

**PHASE UX-FILES-B VALIDÉE LOCALEMENT — SOCLE DES FICHIERS D’ENTRÉE PRÊT**
