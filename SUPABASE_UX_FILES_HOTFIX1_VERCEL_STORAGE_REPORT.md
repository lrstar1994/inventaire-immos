# UX-FILES-HOTFIX-1 — Upload AssetEntry sur Vercel

## Statut

**PHASE UX-FILES-HOTFIX-1 VALIDÉE LOCALEMENT — UPLOAD ASSETENTRY COMPATIBLE SUPABASE STORAGE / VERCEL**

## Cause exacte

Le flux `saveAssetEntryFileFromForm()` réutilisait déjà correctement `saveAssetFileForOwner()`, le provider Storage partagé et la compensation Storage/Prisma.

L’erreur provenait du sélecteur `resolveFileStorageProviderName()` dans `lib/storage/config.js`. En l’absence de `APP_FILE_STORAGE_PROVIDER`, il sélectionnait toujours `local`, y compris lorsque `APP_DATABASE_PROVIDER=postgresql`.

Cela instancie `LocalFileStorageProvider`. Sa méthode `putObject()` appelle `mkdir()` sous le répertoire par défaut `process.cwd()/public/uploads/assets`, soit `/var/task/public/...` dans la fonction Vercel, d’où l’erreur `ENOENT`.

## Correction

- En runtime PostgreSQL, le provider par défaut est désormais `supabase`.
- Une configuration explicite `local` avec PostgreSQL est refusée clairement avant tout accès au filesystem.
- Le flux Entry continue d’utiliser le même provider partagé que le flux AssetUnit ; aucun second client Supabase n’a été créé.
- La clé reste `assets/entries/{entryId}/{fileId}/{fileId}.{extension}`.
- Les métadonnées `storageProvider`, `storageBucket`, `storageKey` et `filePath` restent produites par `storedObjectToAssetFileData()` puis enregistrées avec les métadonnées métier du fichier.
- Si Prisma échoue après l’upload, `persistWithStorageCompensation()` supprime toujours l’objet créé via le même provider.

## Comportements

### PostgreSQL / Vercel

`getFileStorageProvider()` ne peut plus retourner l’adapter local. Il sélectionne Supabase lorsque le provider Storage est omis et refuse explicitement toute demande `local`. Aucun `mkdir()` ou `writeFile()` vers `public`, `/var/task` ou un filesystem persistant n’est donc accessible par ce chemin.

### SQLite local

Le comportement existant est conservé : sans configuration Storage explicite, SQLite utilise toujours `LocalFileStorageProvider`. Le flux AssetUnit est inchangé.

## Fichiers

- `lib/storage/config.js`
- `scripts/test-entry-file-vercel-storage-hotfix.mjs`

Aucune route, règle métier, API, structure Prisma ou migration n’a été modifiée.

## Validation

- Tests hotfix : **6 réussis, 0 échec**.
- Suite ciblée Storage existante : **75 réussis, 0 échec**.
- Build SQLite : **réussi**.
- TypeScript intégré au build Next.js : **réussi**.
- `git diff --check` : **réussi** ; seul l’avertissement LF/CRLF habituel est présent.
- Scan ciblé : **aucun secret détecté**.
- Avertissement NFT Turbopack historique : présent, non bloquant et hors périmètre.

Aucun upload distant réel, accès Production/Recipe, changement Supabase, migration, staging, commit, push ou déploiement n’a été effectué.
