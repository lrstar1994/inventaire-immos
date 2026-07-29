# Phase 9C bis — Correction et validation de `objectExists()`

Date : 2026-07-29

## Conclusion

**Phase 9C bis échouée avec nettoyage complet.**

La correction restrictive reconnaît correctement une clé inexistante avant upload et conserve les erreurs HTTP non reconnues. Le probe réel a validé l’upload, la présence, la lecture, l’URL signée, le téléchargement, la confidentialité et la suppression. Toutefois, le contrôle effectué immédiatement après `deleted=true` a encore vu l’objet par GET et a donc retourné `true`.

Une vérification indépendante unique, exécutée juste après l’arrêt du probe, a confirmé :

- bucket privé ;
- zéro objet dans le bucket ;
- zéro objet sous `diagnostics/phase9c/` ;
- zéro objet sous `diagnostics/phase9c-bis/`.

Ce résultat indique une fenêtre de visibilité transitoire après suppression, distincte de la signature d’absence HTTP 400 initialement corrigée. Aucune relance ni nouvelle modification automatique n’a été effectuée.

## Référence et état Git initial

- Commit de départ : `03924ae5d3f8a540e36c3e29430b65b4afcdaab4`
- Message : `feat: add storage provider abstraction`
- Changements initiaux non suivis :
  - `scripts/test-supabase-storage-live.mjs`
  - `SUPABASE_PHASE9C_LIVE_STORAGE_PROBE_REPORT.md`
- Aucun commit Phase 9C créé
- Processus Node/Prisma/psql résiduel : aucun
- Ports 3000 et 3018 : libres

## État protégé initial

- SQLite SHA-256 : `8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec`
- `immos` : 222 lignes
- `immos.asset_files` : 0 ligne
- `immos_recipe_phase8` : 253 lignes
- `immos_recipe_phase8.asset_files` : 0 ligne
- contraintes FK recette non validées : 0
- bucket `asset-files` : privé et vide
- préfixes `diagnostics/phase9c/` et `diagnostics/phase9c-bis/` : vides
- trois JPEG orphelins : présents et inchangés

## Analyse exacte de HTTP 400

### Comportement observé

Pour une clé aléatoire inexistante :

- `HEAD /storage/v1/object/asset-files/<clé>` :
  - statut HTTP externe : 400 ;
  - `Content-Type` : `application/json`;
  - `Content-Length` : 69 ;
  - aucun corps accessible, conformément à la méthode HEAD.
- `GET` de confirmation sur la même classe de clé :
  - statut HTTP externe : 400 ;
  - `statusCode` JSON : `"404"` ;
  - `error` : `"not_found"` ;
  - `message` : `"Object not found"`.

Le endpoint logique est privé et authentifié côté serveur. Aucune URL complète ni credential n’a été journalisé.

### Différence avec un autre HTTP 400

Un HTTP 400 n’est jamais converti directement en `false`. La réponse n’est reconnue comme absence que si le GET de confirmation contient exactement :

- `statusCode` égal à `404` après conversion en chaîne ;
- `error` égal à `not_found` ;
- `message` égal à `Object not found`.

Un 400 générique, une erreur d’authentification, une erreur serveur, une erreur réseau ou une clé invalide reste une erreur.

## Correction appliquée

Fichier :

- `lib/storage/supabase-storage-provider.js`

Méthode retenue :

1. conserver HEAD comme requête rapide et sans téléchargement pour un objet présent ;
2. retourner `false` directement pour HTTP 404 ;
3. uniquement pour HEAD 400, effectuer un GET de confirmation ;
4. retourner `false` uniquement pour le triplet d’absence exact ;
5. retourner `true` si le GET de confirmation réussit ;
6. lever `StorageProviderError` pour toute autre réponse.

Cette solution est minimale : un objet présent ne nécessite toujours qu’un HEAD et aucun contenu n’est téléchargé dans le cas courant. Le GET supplémentaire n’est utilisé que pour lever l’ambiguïté spécifique du HTTP 400.

Les alternatives ont été évaluées :

- considérer tout HTTP 400 comme absent : rejeté, trop dangereux ;
- télécharger systématiquement l’objet : rejeté, inutilement coûteux ;
- lister systématiquement le dossier : plus coûteux et soumis à la sémantique de préfixe/recherche ;
- conserver HEAD avec confirmation restrictive : retenu.

## Tests automatisés

Fichier modifié :

- `scripts/test-file-storage-abstraction.mjs`

Huit tests mockés ciblés ont été ajoutés :

1. objet présent → `true` ;
2. HTTP 404 → `false` ;
3. HTTP 400 avec signature Supabase exacte → `false` ;
4. HTTP 400 générique → erreur ;
5. HTTP 401 et 403 → erreur ;
6. HTTP 500 → erreur ;
7. erreur réseau → erreur ;
8. clé invalide → rejet avant appel réseau.

Résultat global :

- 16 tests ;
- 16 réussis ;
- 0 échec ;
- aucune requête Supabase réelle ;
- durée du processus : 7,3 s ;
- `git diff --check` : réussi.

## Vérifications statiques

- aucun `getPublicUrl` ;
- expiration signée par défaut toujours à 300 secondes ;
- provider local inchangé ;
- provider par défaut toujours `local` ;
- factory toujours paresseuse ;
- aucune initialisation Supabase en mode local ;
- aucun changement de `asset_files` ;
- aucun changement Prisma ;
- aucune route ou page métier modifiée ;
- validations MIME, extension, taille et signature inchangées ;
- chemin métier `assets/units/...` inchangé ;
- aucun secret ajouté.

## Builds

| Commande | Résultat | Durée du processus |
|---|---|---:|
| `npm run build` | réussi | 72,8 s |
| `npm run build:sqlite` | réussi | 33,6 s |
| `npm run build:postgresql` | réussi | 27,5 s |

Les trois builds ont réussi à la compilation, au contrôle TypeScript et à la génération des pages. La route `/` est dynamique (`ƒ`). Aucun P1001 ni P2028 n’a été observé. L’avertissement Turbopack existant relatif au traçage NFT Prisma demeure non bloquant.

## Second probe réel unique

Script :

- `scripts/test-supabase-storage-live.mjs`

Clé technique unique :

`diagnostics/phase9c-bis/aa331ad3-3db5-433b-9c64-b5a66b47947e/phase9c-storage-probe.png`

Fichier :

- PNG technique déterministe ;
- taille : 68 octets ;
- MIME : `image/png` ;
- SHA-256 : `431ced6916a2a21a156e38701afe55bbd7f88969fbbfc56d7fe099d47f265460`.

### Résultats

| Étape | Résultat | Durée |
|---|---|---:|
| Validation locale | réussie | avant accès Storage |
| `objectExists` avant upload | `false` | réussie |
| Upload | réussi | 869 ms |
| `objectExists` après upload | `true` | réussie |
| Lecture serveur | 68 octets, hash identique | réussie |
| URL signée | créée pour 300 secondes | 451 ms |
| Téléchargement signé | HTTP 200 | 496 ms |
| Comparaison | taille, hash et octets identiques | réussie |
| Accès public non signé | refusé, HTTP 400 | 405 ms |
| Suppression | `deleted=true` | 346 ms |
| `objectExists` immédiatement après suppression | `true` | résultat inattendu |
| Liste indépendante du bucket | 0 objet | réussie |

L’origine de l’URL signée a été masquée et l’URL complète n’a pas été conservée.

## Analyse du résultat post-suppression

Le provider a reçu une réponse réussie lors du GET de confirmation effectué immédiatement après la suppression. Conformément à la correction restrictive, il a retourné `true` plutôt que de masquer cette réponse.

La liste indépendante réalisée après l’arrêt du probe a retourné zéro objet. La cause la plus probable est une courte fenêtre de cohérence/visibilité après la suppression. Ce comportement n’est pas traité automatiquement dans cette phase :

- aucune temporisation n’a été ajoutée ;
- aucun retry n’a été effectué ;
- la règle d’absence n’a pas été élargie ;
- aucune seconde exécution réelle n’a été lancée.

## Nettoyage et état final

- suppression distante annoncée réussie : oui
- objet résiduel dans le bucket : non
- objets sous `diagnostics/phase9c/` : 0
- objets sous `diagnostics/phase9c-bis/` : 0
- fichier temporaire source : supprimé
- répertoire temporaire restant : aucun
- URL signée enregistrée : aucune
- policy modifiée : aucune

État protégé final :

- SQLite SHA-256 : `8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec`
- `immos` : 222 lignes
- `immos.asset_files` : 0 ligne
- `immos_recipe_phase8` : 253 lignes
- `immos_recipe_phase8.asset_files` : 0 ligne
- contraintes FK recette non validées : 0
- bucket privé : oui
- bucket vide : oui
- trois JPEG orphelins : tailles et empreintes inchangées
- processus Node/Prisma/psql résiduel : aucun
- ports 3000 et 3018 : libres

## Fichiers modifiés ou créés

Modifiés :

- `lib/storage/supabase-storage-provider.js`
- `scripts/test-file-storage-abstraction.mjs`
- `scripts/test-supabase-storage-live.mjs`

Non suivis conservés :

- `SUPABASE_PHASE9C_LIVE_STORAGE_PROBE_REPORT.md`
- `SUPABASE_PHASE9C_BIS_OBJECT_EXISTS_VALIDATION_REPORT.md`

Aucun fichier métier, schéma Prisma, page Next.js, configuration secrète ou policy Supabase n’a été modifié.

## Git et sécurité

- aucun commit créé ;
- aucun push ;
- aucun secret réel détecté dans les fichiers modifiés ;
- aucun mot de passe, token, URL signée complète ou chaîne de connexion complète conservé ;
- migration métier non commencée ;
- aucune ligne `asset_files` créée.
