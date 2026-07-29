# Phase 9C — Rapport du probe réel Supabase Storage

Date : 2026-07-29

## Conclusion

**Phase 9C échouée avec objet nettoyé.**

L’unique objet technique autorisé a bien été validé, uploadé, relu via une URL signée, comparé octet par octet, refusé en accès public non signé, puis supprimé. Le processus a néanmoins retourné un code d’échec lors de son ultime contrôle d’absence : `objectExists()` utilise une requête HTTP `HEAD` et le service a répondu `400` après suppression, alors que le provider ne considère actuellement que `404` comme une absence.

Une vérification indépendante en lecture seule par l’API de liste Storage a ensuite confirmé :

- bucket privé ;
- zéro objet dans le bucket ;
- zéro objet sous le préfixe `diagnostics/phase9c/`.

Aucune seconde exécution du scénario n’a été effectuée.

## Référence Git et état initial

- Commit de départ : `03924ae5d3f8a540e36c3e29430b65b4afcdaab4`
- Message : `feat: add storage provider abstraction`
- État Git initial : propre
- Processus Node/Prisma/psql résiduel : aucun
- Ports 3000 et 3018 : libres

## État protégé initial

- SQLite SHA-256 : `8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec`
- `immos` : 222 lignes
- `immos.asset_files` : 0 ligne
- `immos_recipe_phase8` : 253 lignes
- `immos_recipe_phase8.asset_files` : 0 ligne
- contraintes FK recette non validées : 0
- bucket : `asset-files`
- bucket privé : oui
- objets Storage : 0
- trois JPEG orphelins locaux : présents et inchangés

Les contrôles PostgreSQL ont été exécutés dans une transaction `READ ONLY` terminée par `ROLLBACK`.

## Configuration Storage

- Provider sélectionné uniquement pour le processus : `supabase`
- Bucket : `asset-files`
- Accès : serveur uniquement
- URL publique : aucune
- URL signée : expiration demandée de 300 secondes
- Origine Storage : hôte Supabase masqué dans ce rapport
- Credentials : chargés depuis les variables existantes, jamais écrits dans le script

## Fichier technique

Le type `text/plain` n’est pas accepté par les règles métier existantes. Aucun format n’a été ajouté. Le probe a donc utilisé un PNG minimal conforme aux validations existantes.

- Nom : `phase9c-storage-probe.png`
- Type MIME : `image/png`
- Taille : 68 octets
- SHA-256 source : `431ced6916a2a21a156e38701afe55bbd7f88969fbbfc56d7fe099d47f265460`
- Encodage : contenu binaire PNG déterministe
- Répertoire source : répertoire temporaire système hors projet
- Validation métadonnées : réussie
- Validation taille/non-vide : réussie
- Validation extension/MIME : réussie
- Validation signature binaire : réussie

## Clé Storage

`diagnostics/phase9c/4b11edbf-b287-4a3e-9ef5-7a33d04fd721/phase9c-storage-probe.png`

La clé est relative, unique, sans donnée métier, sans `..`, sans antislash et distincte du futur espace `assets/units/`.

## Résultats du scénario unique

| Étape | Résultat | Durée |
|---|---|---:|
| Validation locale | réussie | avant connexion Storage |
| Upload unique | réussi | 1 178 ms |
| Présence via provider | confirmée | incluse dans le contrôle suivant |
| Lecture serveur via provider | 68 octets, hash identique | contrôle réussi |
| Création URL signée | réussie, 300 secondes | 422 ms |
| Téléchargement signé | HTTP 200 | 347 ms |
| Accès public non signé | refusé, HTTP 400 | 298 ms |
| Suppression via provider | réussie (`deleted=true`) | 310 ms |
| Vérification HEAD après suppression | échec HTTP 400 | étape finale |
| Liste indépendante du bucket | 0 objet | contrôle final réussi |

### Comparaison du téléchargement

- `Content-Type` : `image/png`
- `Content-Length` : 68
- octets reçus : 68
- SHA-256 téléchargé : `431ced6916a2a21a156e38701afe55bbd7f88969fbbfc56d7fe099d47f265460`
- égalité octet par octet : oui
- URL signée complète conservée ou journalisée : non

### Confidentialité

Une requête sans signature vers le chemin public attendu a été refusée avec HTTP 400. Aucun `getPublicUrl` n’a été appelé et aucune politique n’a été modifiée.

## Nettoyage

- objet technique supprimé : oui
- objet résiduel sous la clé exacte : non, confirmé par liste
- objets sous `diagnostics/phase9c/` : 0
- objets totaux dans le bucket : 0
- fichier source temporaire : supprimé
- copie téléchargée locale : aucune, téléchargement traité en mémoire
- répertoire temporaire : supprimé
- répertoires temporaires `immos-phase9c-*` restants : 0

## État protégé final

- SQLite SHA-256 : `8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec`
- `immos` : 222 lignes
- `immos.asset_files` : 0 ligne
- `immos_recipe_phase8` : 253 lignes
- `immos_recipe_phase8.asset_files` : 0 ligne
- contraintes FK recette non validées : 0
- bucket privé : oui
- objets Storage : 0
- politiques Storage modifiées : aucune
- trois JPEG orphelins : tailles et empreintes inchangées
- processus Node/Prisma/psql résiduel : aucun
- ports 3000 et 3018 : libres

## Fichiers locaux

Créés et laissés non commités :

- `scripts/test-supabase-storage-live.mjs`
- `SUPABASE_PHASE9C_LIVE_STORAGE_PROBE_REPORT.md`

Créés puis supprimés :

- fichier PNG source dans le répertoire temporaire système ;
- répertoire temporaire système associé.

Aucun fichier métier, upload local, schéma, configuration, donnée ou politique n’a été modifié.

## Sécurité et Git

- aucun mot de passe, token, URL signée complète ou chaîne de connexion complète dans le script ou ce rapport ;
- aucun secret codé en dur ;
- aucun commit créé ;
- aucune Phase de migration réelle commencée ;
- seules les deux ressources Phase 9C ci-dessus doivent apparaître comme non suivies.

## Point à traiter avant une nouvelle validation

Le comportement de `SupabaseStorageProvider.objectExists()` sur un objet absent doit être qualifié : le endpoint `HEAD` a retourné HTTP 400 après la suppression, et non HTTP 404. Toute correction éventuelle devra être ciblée et validée séparément ; elle n’a pas été appliquée ni retestée dans cette phase.
