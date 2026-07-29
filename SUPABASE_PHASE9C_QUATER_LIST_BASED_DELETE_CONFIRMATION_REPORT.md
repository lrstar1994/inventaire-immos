# Phase 9C quater — Confirmation post-suppression par inventaire

Date : 2026-07-29

## Conclusion

**Phase 9C quater réussie.**

La confirmation post-suppression n’utilise plus `objectExists()`. Elle repose désormais sur un inventaire paginé du dossier parent et une comparaison exacte du nom. L’unique probe réel a confirmé l’absence dès la première observation :

- observations : `[false]`
- tentatives : 1
- délais programmés : 0 ms
- temps mural, appel réseau inclus : 257 ms
- méthode : `list`

La vérification indépendante finale confirme que le bucket privé et tous les préfixes diagnostics sont vides.

## Référence et état initial

- Commit de départ : `03924ae5d3f8a540e36c3e29430b65b4afcdaab4`
- Message : `feat: add storage provider abstraction`
- HEAD conforme : oui
- Git : modifications Phase 9C non commitées conservées
- processus Node/Prisma/psql : aucun
- ports 3000 et 3018 : libres

État protégé initial :

- SQLite SHA-256 : `8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec`
- `immos` : 222 lignes
- `immos.asset_files` : 0
- `immos_recipe_phase8` : 253 lignes
- `immos_recipe_phase8.asset_files` : 0
- contraintes FK recette non validées : 0
- bucket `asset-files` : privé et vide
- tous les préfixes diagnostics précédents : vides
- trois JPEG orphelins : inchangés

## Analyse des cinq réponses `true`

Lors du probe Phase 9C ter tris, `deleteObject()` avait retourné `deleted=true`, mais cinq vérifications HEAD/GET successives avaient encore observé l’objet. L’inventaire du bucket effectué juste après indiquait pourtant zéro objet.

Conclusion : HEAD/GET et l’inventaire n’ont pas la même visibilité immédiate après suppression. `objectExists()` reste utile comme contrôle ponctuel général, mais n’est plus utilisé comme critère autoritatif de convergence post-suppression.

## Vérification indépendante existante

Les probes précédents utilisaient directement l’endpoint serveur :

`POST /storage/v1/object/list/{bucket}`

avec :

- `prefix` explicite ;
- `limit: 100` ;
- `offset: 0` ;
- tri par `name` ascendant.

Cette vérification globale confirmait un bucket ou un préfixe vide, mais une page unique ne suffisait pas comme preuve générale d’absence d’une clé dans un dossier volumineux.

## Méthode list-based retenue

Méthode ajoutée :

- `SupabaseStorageProvider.isObjectListed()`

Pour une clé complète, elle sépare :

- dossier parent ;
- nom final exact.

Exemple :

- clé : `diagnostics/phase9c-quater/<uuid>/phase9c-storage-probe.png`
- dossier : `diagnostics/phase9c-quater/<uuid>`
- nom : `phase9c-storage-probe.png`

L’inventaire :

- interroge exactement le dossier parent ;
- utilise des pages de 100 entrées par défaut ;
- incrémente explicitement `offset` ;
- compare `entry.name === objectName` ;
- continue jusqu’à une page incomplète ;
- impose une garde de 1 000 pages et lève une erreur plutôt que tronquer silencieusement ;
- ne confond pas noms, extensions ou sous-dossiers voisins ;
- propage HTTP 400, 401, 403, 500, erreurs réseau et réponses invalides.

## Attente post-suppression

`waitForObjectAbsence()` utilise uniquement `isObjectListed()`.

- cinq observations maximum ;
- délais inchangés : 250, 500, 750, 1 000 ms ;
- somme maximale des délais : 2 500 ms ;
- `totalDelayMs` mesure uniquement les délais ;
- `elapsedMs` mesure le temps mural complet ;
- `verificationMethod` vaut `list` ;
- toute erreur d’inventaire interrompt immédiatement l’attente.

`objectExists()` est inchangé :

- HEAD reste ponctuel ;
- HEAD 400 déclenche son GET de confirmation ;
- seule la signature exacte `404 / not_found / Object not found` représente une absence ;
- aucun HTTP générique supplémentaire n’est reconnu.

## Tests

Commande :

`npm run test:storage`

Résultat :

- 39 tests
- 39 réussis
- 0 échec
- 0 ignoré
- durée Node Test Runner : 676 ms
- durée du processus : 3,5 s
- aucun appel Supabase réel

Cas list-based couverts :

- nom exact présent ;
- dossier vide ;
- nom voisin ;
- extension voisine ;
- sous-dossier voisin ;
- clé racine ;
- clé multiniveau ;
- erreurs 400, 401 et 403 ;
- réponse invalide ;
- objet sur page suivante ;
- pagination terminée sans objet.

Cas d’attente couverts :

- absent immédiatement ;
- une ou plusieurs présences avant absence ;
- toujours présent jusqu’à cinq observations ;
- erreur réseau ou d’autorisation ;
- délais injectés ;
- séparation `totalDelayMs` / `elapsedMs` ;
- aucun appel à `objectExists()` ;
- aucune seconde suppression.

Contrôles :

- `node --check` : réussi
- `git diff --check` : réussi

## Builds

| Commande | Résultat | Durée |
|---|---|---:|
| `npm run build` | réussi | 77,3 s |
| `npm run build:sqlite` | réussi | 37,2 s |
| `npm run build:postgresql` | réussi | 33,5 s |

Compilation, TypeScript et génération des pages réussissent. `/` est dynamique (`ƒ`). Aucun P1001 ni P2028. L’avertissement Turbopack NFT Prisma existant reste non bloquant.

## Probe réel unique

Clé :

`diagnostics/phase9c-quater/3795c5a1-afdf-42d0-a8fd-3788a9ac5f13/phase9c-storage-probe.png`

Fichier :

- PNG technique
- MIME : `image/png`
- taille : 68 octets
- SHA-256 : `431ced6916a2a21a156e38701afe55bbd7f88969fbbfc56d7fe099d47f265460`

Résultats :

| Étape | Résultat | Durée |
|---|---|---:|
| validation locale | réussie | — |
| `objectExists` avant upload | `false` | — |
| inventaire avant upload | `false` | — |
| upload | réussi | 488 ms |
| `objectExists` après upload | `true` | — |
| inventaire après upload | `true` | — |
| lecture serveur | conforme | — |
| URL signée | créée pour 300 s | 379 ms |
| téléchargement | HTTP 200 | 304 ms |
| contenu | 68 octets, hash et octets identiques | conforme |
| accès public non signé | refusé, HTTP 400 | 544 ms |
| suppression | `deleted=true` | 297 ms |
| inventaire post-suppression | absent dès la première observation | 257 ms |

Séquence post-suppression :

- observations : `[false]`
- attempts : 1
- totalDelayMs : 0
- elapsedMs : 257
- verificationMethod : `list`

La valeur de `objectExists()` après suppression n’a pas été utilisée comme critère bloquant.

## Contrôles finaux

Vérification indépendante :

- bucket privé : oui
- objets totaux : 0
- `diagnostics/phase9c/` : 0
- `diagnostics/phase9c-bis/` : 0
- `diagnostics/phase9c-ter/` : 0
- `diagnostics/phase9c-ter-bis/` : 0
- `diagnostics/phase9c-ter-tris/` : 0
- `diagnostics/phase9c-quater/` : 0

État protégé final :

- SQLite SHA-256 inchangé
- `immos` : 222 lignes
- `immos.asset_files` : 0
- `immos_recipe_phase8` : 253 lignes
- `immos_recipe_phase8.asset_files` : 0
- contraintes FK recette non validées : 0
- aucune policy modifiée
- trois JPEG inchangés
- aucun fichier temporaire
- aucune URL signée enregistrée
- aucun processus résiduel
- ports 3000 et 3018 libres

## Fichiers concernés

Modifiés :

- `lib/storage/supabase-storage-provider.js`
- `scripts/test-file-storage-abstraction.mjs`
- `scripts/test-supabase-storage-live.mjs`

Rapports Phase 9C non suivis, dont :

- `SUPABASE_PHASE9C_QUATER_LIST_BASED_DELETE_CONFIRMATION_REPORT.md`

## Git et sécurité

- aucun commit créé
- aucun push
- aucun secret ou URL signée complète ajouté
- aucune ligne `asset_files` créée
- aucune migration métier commencée
