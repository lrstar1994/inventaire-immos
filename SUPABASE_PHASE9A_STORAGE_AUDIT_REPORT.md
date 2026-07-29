# Phase 9A — Audit technique Supabase Storage

Date : 2026-07-29
Nature : audit documentaire et lecture seule

## 1. État initial

- Commit de référence et commit courant :
  `ce4b6c223baf91d82696b3ff87ef35d0167bb8fc`.
- Git était propre au début de l'audit.
- SQLite SHA-256 :
  `8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec`.
- `public/uploads/assets` existe.
- `immos` : 222 lignes au total; `asset_files` : 0.
- `immos_recipe_phase8` : 253 lignes au total; `asset_files` : 0.
- Bucket `asset-files` : existant, privé et vide.
- Limite du bucket : 10 485 760 octets.
- MIME autorisés : `image/jpeg`, `image/png`, `image/webp`,
  `application/pdf`.
- Objet Storage : 0.
- Politique publique ou autre politique ciblant `asset-files` : 0.
- Aucun secret n'a été affiché. Les connexions ont été utilisées uniquement par
  les processus de diagnostic et leurs valeurs n'ont pas été journalisées.

Un contrôle Prisma a rencontré un `P1001` transitoire. L'audit PostgreSQL a été
achevé dans une transaction `READ ONLY` unique avec `psql`; aucune écriture n'a
été effectuée.

## 2. Inventaire des fichiers locaux

Le dossier contient quatre fichiers physiques en comptant `.gitkeep`. Ce dernier
est un marqueur Git d'un octet, pas un fichier métier. L'inventaire métier
comprend donc trois JPEG.

### Totaux métier

- Fichiers métier : 3.
- Taille totale : 6 014 643 octets (environ 5,74 Mio).
- Extensions : 3 × `.jpg`.
- MIME réel par signature : 3 × `image/jpeg`.
- Fichiers vides : 0.
- Fichiers illisibles : 0.
- Doublons SHA-256 : 0.
- Noms avec espaces : 0.
- Noms avec accents : 0.
- Noms avec caractères hors `[A-Za-z0-9._-]` : 0.
- Noms non portables : 0 au sens Windows/Unix.
- Risque de nom : faible à modéré, car les noms sont longs et incorporent un
  code métier modifiable.

### Détail, du plus volumineux au plus petit

| Chemin relatif | Octets | MIME réel | SHA-256 |
|---|---:|---|---|
| `LIT-KING-000002/LIT-KING-000002-8294b002-602f-4e5f-9d47-66fbb469e0ec-133828107271725621.jpg` | 2 405 379 | `image/jpeg` | `4ea6fafc0e1dfec5b1763203715f20c00b2b84720c8ff9158a47a06c440fad4a` |
| `LIT-KING-000002/LIT-KING-000002-833c4964-8f75-4b4a-a13e-cdb6ab9aaca2-133879581908740101.jpg` | 2 107 645 | `image/jpeg` | `ff1a9c1a9ccf30932426389687755d2065074eacaa56948451e03903dac3bd83` |
| `LIT-KING-000002/LIT-KING-000002-f1b9b68c-989d-405e-9802-1c246e352791-133810434509723163.jpg` | 1 501 619 | `image/jpeg` | `d360445ca40c9e7c6afc77bc7d97a2c30c9f58b766cfb5de50db422bd5d393ec` |

Dates de modification locales, respectivement : 2026-07-22 19:54:44,
19:56:07 et 19:53:51, fuseau local.

Ces trois fichiers sont les fichiers orphelins déjà expertisés. Leur chemin
mentionne `LIT-KING-000002`, qui existe, mais leur contenu ne permet pas un
rattachement métier justifié. Ils restent exclus de toute migration et ne
doivent créer ni objet Storage ni ligne `asset_files` sans décision humaine
explicite.

## 3. Dépendances applicatives au filesystem

### Écriture et métadonnées

| Fichier / fonction | Rôle | I/O | Dépendance locale | Impact | Risque |
|---|---|---|---|---|---|
| `lib/asset-file-service.js` / `saveAssetFileFromForm` | Valide et enregistre un upload | écriture | `mkdir`, `writeFile`, `path.join(process.cwd(), "public", "uploads", "assets")` | Doit passer par un provider | Élevé |
| même fichier / `UPLOAD_ROOT` | Racine physique | — | chemin codé en dur | Incompatible Storage | Élevé |
| même fichier / `PUBLIC_UPLOAD_PREFIX` | URL publique locale | lecture UI | `/uploads/assets` codé en dur | Doit devenir une URL applicative sécurisée | Élevé |
| même fichier / `updateAssetFile` | Métadonnées/photo principale | DB | aucune suppression physique | Compatible après abstraction | Moyen |
| même fichier / `deleteAssetFile` | Suppression logique | DB | ne supprime déjà aucun fichier | Bon point de départ pour rétention | Moyen |

L'ordre actuel est dangereux : le fichier est écrit sur disque **avant** la
transaction de création de `asset_files`. Si la base échoue, un fichier local
orphelin subsiste. La future implémentation Storage doit assumer explicitement
ce problème de double ressource et prévoir compensation/idempotence.

### Routes API

| Route | Fonction | Lecture/écriture | Impact |
|---|---|---|---|
| `GET /api/asset-files` | liste, filtre unité/type/suppression | lecture DB | Conserver |
| `POST /api/asset-files` | multipart, upload | disque + DB | Brancher sur provider |
| `GET /api/asset-files/[id]` | métadonnées | lecture DB | Ne doit pas exposer directement une clé service |
| `PATCH /api/asset-files/[id]` | type/libellé/photo principale | DB | Conserver, transaction |
| `DELETE /api/asset-files/[id]` | suppression logique | DB | Ajouter planification purge |
| `GET /api/asset-units/[id]/files` | fichiers d'une unité | lecture DB | Retourner une URL applicative ou signée |

Il n'existe pas de route dédiée de téléchargement/proxy. Les fichiers sont
actuellement servis directement par Next depuis `public/`.

### UI et formulaires

- `app/parc/[id]/asset-unit-detail.js` :
  formulaire multipart, ajout, définition de photo principale, suppression
  logique, `<img src={file.filePath}>` et `<a href={file.filePath}>`.
- `app/parc/asset-park.js` :
  mêmes opérations depuis la vue parc et miniatures directes par `filePath`.
- `app/parc/page.js`, `app/parc/[id]/page.js`,
  `app/api/asset-units/route.js`, `app/api/asset-units/[id]/route.js` :
  chargent les `assetFiles` actifs dans les unités.
- `app/page.js` :
  compte les unités ayant une photo principale active.

Deux formulaires UI dupliquent la construction du `FormData`. Les validations
client sont limitées à l'attribut `accept`; la sécurité réelle est côté serveur.

### Validation actuelle

- Taille maximale : 10 Mio.
- Extensions : `.jpg`, `.jpeg`, `.png`, `.webp`, `.pdf`.
- MIME déclaré : JPEG, PNG, WEBP, PDF.
- Type métier : `MAIN_PHOTO`, `GENERAL_VIEW`, `DETAIL_VIEW`, `DEFECT_PHOTO`,
  `SERIAL_OR_LABEL`, `INVOICE`, `WARRANTY`, `OTHER`.
- Le responsable maintenance peut seulement ajouter `DEFECT_PHOTO`, image,
  jamais principale.
- Direction et gestionnaire inventaire peuvent gérer les fichiers.

Limite importante : le code compare extension et MIME **déclaré par le client**,
mais ne valide pas encore la signature réelle. Un fichier vide n'est pas
explicitement refusé. Aucun antivirus ou parseur sécurisé n'est présent.

### Fonctions absentes

- Aucun client Supabase Storage dans l'application.
- Aucun `createSignedUrl`, `createSignedUrls`, `download`, `remove` ou
  `getPublicUrl`.
- Aucun accès client direct au bucket.
- Aucune route proxy de téléchargement.
- Aucun usage de `SUPABASE_SERVICE_ROLE_KEY` dans les routes métier.
- Aucun lien fichier vers document, entrée ou mouvement.

## 4. Modèle `asset_files`

### Colonnes communes

| Colonne | Type logique | Obligatoire | Rôle |
|---|---|---:|---|
| `id` | texte/cuid | oui | PK |
| `asset_unit_id` | texte | oui | FK vers unité |
| `file_type` | enum PG / texte SQLite | oui | type métier |
| `file_label` | texte | non | libellé |
| `file_name` | texte | oui | nom original |
| `file_path` | texte | oui | chemin local actuel, futur object key |
| `mime_type` | texte | oui | MIME |
| `file_size` | entier | oui | taille |
| `is_primary` | booléen | oui, défaut faux | photo principale |
| `notes` | texte | non | notes |
| `created_by` | texte | non | identifiant acteur, sans FK |
| `created_at` | date | oui | création |
| `deleted_at` | date | non | suppression logique |

Relations : uniquement `AssetUnit 1 → N AssetFile`. `ON DELETE RESTRICT`,
`ON UPDATE CASCADE`. Aucun lien direct vers document, entrée, mouvement,
article/modèle ou utilisateur. `created_by` n'est pas une relation Prisma.

Champs absents :

- hash du contenu;
- nom stocké distinct;
- bucket;
- état d'upload;
- horodatage de purge physique;
- identifiant de tentative/migration;
- version/ETag Storage;
- motif de suppression.

### Index et contraintes

Communs :

- PK `id`;
- index `asset_unit_id`, `file_type`, `is_primary`, `deleted_at`;
- FK unité `RESTRICT`.

PostgreSQL `immos` et `immos_recipe_phase8` ajoutent :

- index unique partiel
  `asset_files_one_active_primary_per_asset_idx`;
- contrainte `asset_files_primary_must_be_image_check`.

Ces deux garanties existent dans la baseline SQL mais ne peuvent pas être
représentées directement par le schéma Prisma. Elles sont présentes dans les
deux bases réelles.

SQLite ne possède ni l'index unique partiel ni le CHECK MIME. La règle est donc
seulement applicative en local. C'est la divergence structurelle principale.

Les schémas Prisma PostgreSQL normal et recipe sont identiques hors
`@@schema`. Les tables réelles `immos` et `immos_recipe_phase8` sont identiques
pour `asset_files`, toutes deux vides.

## 5. Cas d'usage métier existants

Tous les cas appartiennent à une **unité physique**; cardinalité N fichiers par
unité et au plus une photo principale active.

| Cas | Type | Création | Modification | Suppression/audit |
|---|---|---|---|---|
| Photo principale | JPEG/PNG/WEBP | upload, force `isPrimary` | remplace l'ancienne principale | logique; audits upload + principale |
| Vue générale/détail | JPEG/PNG/WEBP | upload | peut devenir principale | logique; audit |
| Défaut/problème | image | maintenance autorisée, non principale | gestionnaires seulement | logique; audit |
| Série/étiquette | image | upload | métadonnées | logique; audit |
| Facture | PDF attendu par UI, mais type `OTHER` permet aussi image | upload | libellé/notes/type | logique; audit |
| Garantie | PDF attendu, mêmes validations | upload | libellé/notes/type | logique; audit |
| Autre | image ou PDF | upload | métadonnées | logique; audit |

Il n'existe pas de pièce jointe de document, justificatif d'entrée ou
justificatif de mouvement au niveau du modèle. Les factures/garanties sont
rattachées à l'unité uniquement. Aucun workflow de validation documentaire ne
change les fichiers.

## 6. État Supabase Storage

- Bucket : `asset-files`.
- Public : non.
- Objets : 0.
- Limite : 10 Mio.
- MIME : JPEG, PNG, WEBP, PDF.
- URL publique : aucune.
- Politiques `storage.objects` ciblant ce bucket : 0.
- Politiques `storage.buckets` ciblant ce bucket : 0.
- D'autres politiques existent pour les autres applications du projet
  Supabase; elles ne ciblent pas `asset-files`.
- `anon` : aucun accès au bucket.
- `authenticated` : aucun accès au bucket.
- `service_role` : bypass RLS Supabase; il doit rester côté serveur uniquement.

L'architecture future doit donc utiliser le serveur applicatif avec service
role pour upload/suppression et pour créer une URL signée courte, ou proposer
une route proxy autorisée. Aucun accès direct client et aucune politique
publique ne sont nécessaires dans cette phase sans Supabase Auth.

## 7. Structures de chemin évaluées

### Option A — centrée unité

`assets/{assetUnitId}/{fileId}/{storedName}`

Avantages :

- conforme au seul propriétaire métier actuel;
- suppression/listing par unité simples;
- lisible sans exposer le code ou le nom du bien;
- stable si le code métier change;
- migration simple.

Limite : moins extensible si de futurs propriétaires sont ajoutés.

### Option B — générique

`entities/{entityType}/{entityId}/{fileId}/{storedName}`

Avantages :

- extensible à documents/entrées/mouvements;
- règles et audits uniformes.

Limites :

- complexité inutile aujourd'hui;
- `entityType` n'existe pas dans `asset_files`;
- risque d'inventer des relations métier non validées.

### Recommandation

Retenir :

`assets/units/{assetUnitId}/{fileId}/{fileId}.{extension}`

Cette variante évite les codes métier et noms originaux, ne contient aucune
donnée personnelle, isole chaque fichier, permet une purge par unité ou fichier
et reste compatible avec les cuid existants. Le nom original reste uniquement
dans `file_name`.

## 8. Nommage recommandé

- Nom stocké : `{fileId}.{extensionNormalisee}`.
- `fileId` : cuid existant ou identifiant stable généré avant upload.
- Caractères : `[a-z0-9]` pour l'identifiant, puis un point et extension.
- Extensions normalisées : `jpg`, `png`, `webp`, `pdf`; convertir `jpeg` en
  `jpg`.
- Longueur maximale recommandée de l'object key complet : 256 caractères.
- Nom original conservé, sans l'utiliser dans la clé Storage.
- Même nom original/contenu différent : deux `fileId` différents.
- Doublon exact : décision explicite; par défaut ne pas dédupliquer entre
  unités, mais signaler le hash.
- Sans extension : détecter le MIME réel et dériver l'extension; refuser si
  inconnu.
- MIME/extension/signature incohérents : refuser, ne pas corriger
  silencieusement.

## 9. Architecture dual-backend recommandée

Créer une interface serveur commune :

- `put({ key, bytes, mimeType })`;
- `getReadUrl({ key, expiresIn })` ou `openReadStream`;
- `exists({ key })`;
- `remove({ key })`;
- éventuellement `head({ key })`.

Implémentations :

- `LocalFileStorageProvider` pour SQLite, racine bornée à
  `public/uploads/assets`;
- `SupabaseStorageProvider` pour PostgreSQL, bucket privé `asset-files`.

Sélection serveur :

- `APP_FILE_STORAGE_PROVIDER=local|supabase`;
- défaut `local`;
- `sqlite` doit refuser `supabase` sauf test explicitement autorisé;
- `postgresql` doit refuser `local` pour le runtime cible, tout en permettant
  une configuration de recette explicite;
- `SUPABASE_STORAGE_BUCKET=asset-files`;
- `FILE_SIGNED_URL_TTL_SECONDS=300` peut être non secret;
- URL Supabase et service role restent les variables serveur existantes.

Ne jamais exposer la clé service role ni utiliser une variable
`NEXT_PUBLIC_*` pour celle-ci.

Les UI ne doivent plus consommer `filePath` comme URL persistante. Préférer une
route `GET /api/asset-files/{id}/content` qui vérifie l'utilisateur puis répond
par redirection vers une URL signée, ou proxyfie le flux. Une URL signée de cinq
minutes est recommandée : assez longue pour ouvrir/télécharger un PDF et
recharger une image, assez courte pour limiter la réutilisation d'un lien
divulgué. Pour les miniatures nombreuses, générer les URLs côté serveur en lot
et ne pas les stocker en base.

## 10. Stratégie de migration sans exécution

1. Sauvegarde complète et empreintes SQLite/uploads/Git.
2. Arrêt des écritures fichier pendant l'inventaire figé.
3. Export déterministe des fichiers et de leur rattachement validé.
4. Manifeste de migration local, hors Git, avec source, taille, SHA-256,
   propriétaire, `fileId`, object key et état.
5. Détection des doublons exacts par SHA-256.
6. Validation MIME par signature et cohérence extension/MIME.
7. Pour chaque fichier admissible : vérifier d'abord si l'object key existe.
8. Upload avec `upsert=false`.
9. Vérifier l'objet par `head/list`, taille et, si possible, téléchargement
   technique puis SHA-256.
10. Créer `asset_files` dans une transaction PostgreSQL après validation de
    l'objet.
11. Vérifier FK, type, taille, chemin et règle photo principale.
12. Tester la route de téléchargement et l'URL signée.
13. Comparer totaux, hashes et manifeste.
14. Conserver les fichiers locaux, sans suppression.
15. En cas d'échec DB après upload : supprimer uniquement l'objet créé par la
    tentative, ou le marquer `UPLOADED_UNREGISTERED` dans le manifeste pour
    reprise.
16. En cas d'échec Storage avant DB : aucune ligne ne doit être créée.
17. Reprise : relire le manifeste; les états terminaux sont sautés après
    revérification, jamais sur simple confiance.

Clé d'idempotence recommandée : combinaison
`sourceRelativePath + SHA256 + fileId + objectKey`. `upsert=false`, object key
déterministe et unicité `fileId` empêchent les doublons.

Pour l'état actuel, le lot métier admissible est **vide** : les trois JPEG sont
orphelins. La future migration historique est donc un no-op tant qu'aucun
rattachement humain n'est validé.

## 11. Suppression et rétention

Décision déjà validée à conserver :

- suppression logique immédiate (`deleted_at`, `is_primary=false`);
- objet inaccessible dès la suppression logique;
- suppression physique après 30 jours;
- audit `ASSET_FILE_DELETED` lors de la suppression logique;
- audit de purge physique recommandé avec résultat Storage.

Ordre recommandé :

1. transaction DB : suppression logique;
2. après 30 jours, job serveur sélectionnant uniquement les lignes éligibles;
3. vérifier que l'object key appartient bien à la ligne et au bucket attendu;
4. supprimer l'objet;
5. enregistrer succès/absence/échec dans l'audit ou un état de purge.

Si l'objet est déjà absent, traiter la purge comme idempotente mais auditer
`ALREADY_MISSING`. Si Storage échoue, conserver la ligne supprimée et retenter
le job. Ne jamais supprimer l'objet avant le marquage logique : une panne DB
laisserait une ligne active sans contenu.

Un objet sans ligne doit être placé en quarantaine logique par rapport de
réconciliation, jamais rattaché automatiquement. Une ligne sans objet doit
produire une alerte et HTTP 404/410 contrôlé.

## 12. Sécurité

| Risque | Mesure |
|---|---|
| Path traversal | object key construite exclusivement côté serveur; refuser `/`, `\\`, `..`, NUL et chemins absolus |
| Exécutable/upload actif | liste blanche stricte; bucket privé; `Content-Disposition: attachment` pour PDF; jamais HTML/SVG |
| MIME spoofing | vérifier magic bytes côté serveur, MIME et extension |
| Fichier vide/corrompu | refuser taille 0; décoder les images; valider l'en-tête PDF |
| Nom malveillant | ne jamais employer le nom original dans l'object key ou les headers sans échappement |
| Accès non autorisé | contrôle des rôles actuel côté route; aucune URL publique |
| URL trop longue | TTL 300 secondes; générer à la demande |
| Suppression inter-entité | retrouver la ligne par ID et reconstruire/valider son préfixe avant `remove` |
| Service role client | import et usage exclusivement dans modules `server-only` |
| Chemin interne exposé | acceptable comme identifiant opaque en DB, mais téléchargement via route; ne pas le traiter comme autorisation |
| Orphelins DB/Storage | job de réconciliation bidirectionnel, rapports sans correction automatique |
| Collision | `fileId` dans le chemin, `upsert=false`, vérification préalable |
| Décompression/DoS | limite 10 Mio avant buffering; envisager streaming et limites de dimensions image |

## 13. Matrice de tests future

| Test | SQLite/local | PostgreSQL/Storage | Attendu |
|---|---:|---:|---|
| JPEG/PNG/WEBP/PDF valide | oui | oui | 201, hash/taille conformes |
| Type invalide/exécutable | oui | oui | 415, aucune trace |
| Taille > 10 Mio | oui | oui | 413 |
| Fichier vide | oui | oui | 400 |
| MIME spoofing/corrompu | oui | oui | rejet |
| Doublon exact | oui | oui | décision appliquée sans doublon involontaire |
| Même nom, contenu différent | oui | oui | deux IDs/keys |
| Photo principale unique | oui | oui | une seule active |
| Téléchargement autorisé | local | signé/proxy | succès |
| Téléchargement interdit | route | route | 403 |
| URL expirée | n/a | oui | refus |
| Suppression logique | oui | oui | contenu inaccessible, objet conservé |
| Purge après 30 jours | local | oui | objet supprimé, audit |
| Objet déjà absent | oui | oui | idempotent + audit |
| Panne Storage | n/a | oui | aucune ligne active partielle |
| Panne PostgreSQL après upload | n/a | oui | compensation/manifeste |
| Reprise interrompue | oui | oui | aucun doublon |
| Objet orphelin | oui | oui | détecté, non rattaché |
| Ligne orpheline | oui | oui | détectée, téléchargement contrôlé en erreur |
| Build SQLite | oui | — | réussi |
| Build PostgreSQL | — | oui | réussi sans secret |

## 14. Découpage recommandé

### 9B — Abstraction de stockage

- Objectif : interface + provider local, sans changer le comportement SQLite.
- Fichiers : nouveau module serveur, `asset-file-service`, tests unitaires.
- Données : aucune.
- Entrée : rapport 9A validé.
- Sortie : parité locale, builds.
- Risque : régression de chemin.
- Rollback : revenir au provider local direct.
- Commit : oui après validation.

### 9C — Provider Supabase et accès sécurisé

- Objectif : provider Supabase, route de contenu, URLs signées 300 s.
- Fichiers : modules serveur, routes, UI.
- Données : recette uniquement lors des tests.
- Entrée : 9B.
- Sortie : aucun accès public/service role client.
- Risque : fuite URL/clé.
- Rollback : désactiver provider Supabase.
- Commit : oui après recette isolée.

### 9D — Modèle et règles

- Objectif : décider/ajouter hash, nom stocké et état de purge si validés.
- Données : migration PostgreSQL puis équivalent SQLite, sans perte.
- Entrée : décisions humaines sur colonnes.
- Sortie : schémas alignés, contraintes testées.
- Risque : divergence dual-backend.
- Rollback : migrations inverses préparées, sauvegarde.
- Commit : séparé.

### 9E — Prototype recette

- Objectif : uploads synthétiques dans un préfixe/bucket de recette clairement
  isolé; ne pas utiliser les trois orphelins.
- Données : `immos_recipe_phase8` et objets de test.
- Sortie : matrice upload/download/delete/reprise.
- Rollback : manifeste puis suppression contrôlée des seuls objets de campagne.
- Commit : non pendant la recette; rapport ensuite.

### 9F — Migration contrôlée

- Objectif : migrer seulement les fichiers humainement rattachés.
- État actuel : no-op attendu.
- Entrée : manifeste signé/validé et sauvegarde.
- Sortie : totaux/hashes/parité.
- Rollback : supprimer les seules lignes/objets de la campagne, conserver local.
- Commit : scripts et rapport, jamais manifeste sensible.

### 9G — Validation et clôture

- Objectif : tests complets SQLite/PostgreSQL/Storage, réconciliation et builds.
- Sortie : zéro orphelin non documenté, Storage privé, Git propre.
- Commit : clôture unique après validation humaine.

## 15. Décisions humaines encore nécessaires

1. Confirmer que les trois JPEG orphelins restent définitivement exclus.
2. Valider le chemin
   `assets/units/{assetUnitId}/{fileId}/{fileId}.{extension}`.
3. Valider le TTL signé de 300 secondes et le choix redirection signée versus
   proxy serveur.
4. Décider si `asset_files` doit recevoir `sha256`, `stored_name`,
   `purge_after` et/ou un état de stockage.
5. Confirmer l'absence de besoin métier de pièces jointes directement liées aux
   documents, entrées ou mouvements.
6. Décider la politique de doublon exact : conserver par unité ou mutualiser.
7. Valider le job de purge physique à 30 jours et son journal d'audit.
8. Décider si une quarantaine Storage dédiée est nécessaire pour les objets
   sans ligne.

## 16. État final de l'audit

- Aucun fichier source, schéma ou donnée modifié.
- Aucun objet Storage créé, supprimé, déplacé ou renommé.
- Aucune politique créée ou modifiée.
- SQLite inchangée.
- `immos` inchangé à 222 lignes, `asset_files=0`.
- `immos_recipe_phase8` inchangé à 253 lignes, `asset_files=0`.
- Bucket `asset-files` privé et vide.
- Aucun secret exposé.
- Aucun commit créé.
- Le seul fichier Git non commité attendu est ce rapport.
