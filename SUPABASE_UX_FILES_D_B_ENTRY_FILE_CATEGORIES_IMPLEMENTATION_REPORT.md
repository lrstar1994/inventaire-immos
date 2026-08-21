# UX-FILES-D-B — Classification facultative des fichiers d’entrée

## Statut

**PHASE UX-FILES-D-B VALIDÉE LOCALEMENT — CLASSIFICATION FACULTATIVE DES PHOTOS ET JUSTIFICATIFS D’ENTRÉE OPÉRATIONNELLE**

## Modifications

- `AssetFile.fileType` a été enrichi dans les trois schémas Prisma, sans nouveau champ.
- Les constantes et validations existantes distinguent toujours strictement `MATERIAL_PHOTO` et `SUPPORTING_DOCUMENT`.
- La zone fichiers de `/parc` propose une catégorie facultative avant upload, filtrée selon la nature du fichier.
- `OTHER` représente une photo « Non classée » ou un « Autre document » : aucune catégorie métier n’est obligatoire.
- Chaque fichier peut être reclassé simplement après upload avec le `PATCH` déjà existant.
- Le libellé lisible apparaît dans la galerie ; `fileLabel` reste libre.
- `isPrimary` reste totalement indépendant de `fileType`.

## Vocabulaire ajouté

Photos : `FRONT`, `REAR`, `LEFT_SIDE`, `RIGHT_SIDE`, `TOP`, `BOTTOM`, `BRAND_MODEL`, `SERIAL_NUMBER`, `ACCESSORIES`, `VISIBLE_DEFECT`, `FULL_LOT`, `REPRESENTATIVE_SAMPLE`, `PACKAGING`.

Justificatifs : `DELIVERY_NOTE`, `MANUAL`.

Toutes les anciennes valeurs, notamment `MAIN_PHOTO`, `DETAIL_VIEW`, `DEFECT_PHOTO` et `SERIAL_OR_LABEL`, sont conservées. `VISIBLE_DEFECT` respecte la même règle d’upload maintenance que l’ancien `DEFECT_PHOTO`.

## Migrations

- SQLite : migration locale `20260821150000_extend_asset_file_types` appliquée. Comme les enums Prisma y sont stockés en texte, aucune table ni ligne métier n’a été reconstruite ou réécrite.
- PostgreSQL Production : migration additive préparée, non appliquée.
- PostgreSQL Recipe : migration additive préparée, non appliquée.
- Les migrations PostgreSQL ajoutent uniquement les nouvelles valeurs à `AssetFileType` et ne contiennent aucune modification de données.

## Compatibilité historique et métier

- Aucun fichier historique ne nécessite de conversion.
- Suppression logique, photo principale, limites de taille, formats, permissions et propriété Entry/Unit sont inchangés.
- Le fallback « Photo d’entrée » pour une entrée I de quantité 1 est inchangé.
- Les comportements I, Q, QI, Storage, Auth et EquipmentSet ne sont pas modifiés.
- Plusieurs fichiers sélectionnés partagent la catégorie choisie au moment de l’upload ; chacun peut ensuite recevoir une catégorie différente depuis sa carte.

## UI desktop et mobile

- Sélecteur compact « Catégorie (facultatif) », initialisé à « Non classée ».
- Les photos ne proposent que les catégories photo ; les justificatifs uniquement les catégories documentaires.
- Le parcours mobile reste : prendre ou choisir les photos, choisir éventuellement une catégorie, enregistrer, puis poursuivre.
- Aucun formulaire supplémentaire ni bibliothèque externe n’a été ajouté.

## Validation

- Tests ciblés UX-FILES-B/C/D-B : **22 réussis, 0 échec**.
- Trois schémas Prisma : **valides**.
- Build SQLite : **réussi**.
- TypeScript intégré au build Next.js : **réussi**.
- `git diff --check` : **réussi** ; seuls les avertissements de normalisation LF/CRLF existants sont présents.
- Scan ciblé : **aucun secret détecté**.
- Avertissement NFT Turbopack historique : présent mais non bloquant.

## SQLite

Avant : `1420BDCAAAB68247CEE3BFDD4793D9CDC4CEF55F18558224F4600EFBC425FCC7`.

Après : `E45B2AF6733CB6D1A2194071DD6067C567014A938252D49643978134957ABD50`.

- sauvegarde préalable créée et empreinte vérifiée ;
- volumes inchangés : 3 catégories, 5 références, 10 entrées, 12 unités, 11 mouvements, 14 documents, 0 fichier ;
- `integrity_check` : **ok** ;
- `foreign_key_check` : **0 anomalie**.

## Fichiers de la phase

- `prisma/schema.prisma`
- `prisma/postgresql/schema.prisma`
- `prisma/postgresql-recipe/schema.prisma`
- trois migrations `20260821150000_extend_asset_file_types`
- `lib/asset-file-constants.js`
- `lib/asset-file-service.js`
- `app/parc/asset-park.js`
- `scripts/test-entry-file-categories.mjs`

La migration PostgreSQL devra être appliquée et contrôlée ultérieurement avant le déploiement du code correspondant. Aucun accès distant, staging, commit, push, tag ou déploiement n’a été effectué.
