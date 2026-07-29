# Phase 9C ter — Validation bornée de la disparition après suppression

Date : 2026-07-29

## Conclusion

**Phase 9C ter échouée avec nettoyage complet et sans probe réel.**

La série de tests unique s’est arrêtée au chargement du fichier de tests, avant l’exécution du premier test, à cause d’une expression régulière JavaScript invalide. Conformément à la règle d’arrêt :

- aucun test n’a été relancé ;
- aucun build n’a été lancé ;
- aucun probe Storage réel n’a été lancé ;
- aucun objet n’a été créé ;
- aucune correction supplémentaire n’a été appliquée.

Le bucket et les trois préfixes diagnostics sont restés vides.

## Référence et état Git initial

- Commit de départ : `03924ae5d3f8a540e36c3e29430b65b4afcdaab4`
- Message : `feat: add storage provider abstraction`
- HEAD conforme : oui
- Processus Node/Prisma/psql résiduel : aucun
- Ports 3000 et 3018 : libres

Changements hérités des Phases 9C et 9C bis :

- `lib/storage/supabase-storage-provider.js`
- `scripts/test-file-storage-abstraction.mjs`
- `scripts/test-supabase-storage-live.mjs`
- `SUPABASE_PHASE9C_LIVE_STORAGE_PROBE_REPORT.md`
- `SUPABASE_PHASE9C_BIS_OBJECT_EXISTS_VALIDATION_REPORT.md`

## État protégé initial

- SQLite SHA-256 : `8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec`
- `immos` : 222 lignes
- `immos.asset_files` : 0 ligne
- `immos_recipe_phase8` : 253 lignes
- `immos_recipe_phase8.asset_files` : 0 ligne
- contraintes FK recette non validées : 0
- bucket `asset-files` : privé et vide
- `diagnostics/phase9c/` : vide
- `diagnostics/phase9c-bis/` : vide
- `diagnostics/phase9c-ter/` : vide
- trois JPEG orphelins : présents et inchangés

## Audit du comportement existant

- `deleteObject()` exécute une seule requête DELETE et retourne `true` après une réponse HTTP réussie.
- `objectExists()` reste une vérification ponctuelle.
- un objet présent retourne `true`.
- HTTP 404 retourne `false`.
- HEAD 400 déclenche un GET de confirmation.
- seul le triplet `statusCode=404`, `error=not_found`, `message=Object not found` retourne `false`.
- HTTP 400 générique, 401, 403, 500 et erreurs réseau restent des erreurs.
- aucune seconde suppression automatique n’est ajoutée.

Le seul comportement visé par cette phase était la visibilité temporaire immédiatement après une suppression réussie.

## Architecture préparée

Une fonction séparée `waitForObjectAbsence()` a été ajoutée dans :

- `lib/storage/supabase-storage-provider.js`

`objectExists()` n’a pas reçu de boucle ni de retry général.

Paramètres préparés :

- tentative 1 : immédiate ;
- attente 250 ms ;
- tentative 2 ;
- attente 500 ms ;
- tentative 3 ;
- attente 750 ms ;
- tentative 4 ;
- attente 1 000 ms ;
- tentative 5 ;
- cinq observations au maximum ;
- attente cumulée maximale : 2 500 ms.

La fonction préparée :

- retourne dès qu’une absence est observée ;
- retourne `absent`, `attempts`, `elapsedMs` et les observations ;
- propage immédiatement toute erreur de `objectExists()` ;
- lève `Object still visible after deletion verification timeout.` si la limite est atteinte ;
- accepte un délai et une horloge injectables pour des tests sans attente réelle.

Cette architecture n’a pas été validée par la suite de tests à cause de l’erreur syntaxique décrite ci-dessous.

## Tests ajoutés

Dix scénarios ont été préparés :

1. absence dès la première vérification ;
2. présence une fois puis absence ;
3. présences multiples puis absence ;
4. objet toujours visible jusqu’à la limite ;
5. erreur d’autorisation immédiate ;
6. erreur réseau après une première présence ;
7. respect du nombre maximal de tentatives ;
8. respect des délais injectés ;
9. maintien de l’interprétation restrictive de `objectExists()` ;
10. absence de seconde suppression automatique.

## Échec de la série de tests

Commande exécutée une seule fois :

`npm run test:storage`

Résultat :

- code de sortie : 1 ;
- tests exécutés : aucun ;
- cause : `SyntaxError: Invalid regular expression`;
- fichier : `scripts/test-file-storage-abstraction.mjs`;
- ligne signalée : 325 ;
- expression concernée : contrôle statique destiné à vérifier qu’aucun HTTP 400 générique n’est converti directement en `false`.

L’échappement de la parenthèse dans le littéral de RegExp est incorrect. Cette erreur est locale au test ajouté ; elle survient avant tout mock, appel réseau ou accès Storage.

Conformément aux consignes, l’expression n’a pas été corrigée et la commande n’a pas été relancée dans cette phase.

## Builds et probe

- `npm run build` : non exécuté
- `npm run build:sqlite` : non exécuté
- `npm run build:postgresql` : non exécuté
- probe réel Phase 9C ter : non exécuté
- clé `diagnostics/phase9c-ter/{uuid}/...` : aucune clé créée
- upload : aucun
- URL signée : aucune
- suppression : aucune
- polling réel : aucun

## État protégé final

Les contrôles finaux en lecture seule confirment :

- SQLite SHA-256 : `8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec`
- `immos` : 222 lignes
- `immos.asset_files` : 0 ligne
- `immos_recipe_phase8` : 253 lignes
- `immos_recipe_phase8.asset_files` : 0 ligne
- contraintes FK recette non validées : 0
- bucket privé : oui
- objets totaux : 0
- `diagnostics/phase9c/` : 0 objet
- `diagnostics/phase9c-bis/` : 0 objet
- `diagnostics/phase9c-ter/` : 0 objet
- policy modifiée : aucune
- trois JPEG orphelins : inchangés
- objet ou fichier temporaire créé par le probe : aucun
- processus résiduel : aucun
- ports 3000 et 3018 : libres

## Fichiers concernés

Modifiés :

- `lib/storage/supabase-storage-provider.js`
- `scripts/test-file-storage-abstraction.mjs`
- `scripts/test-supabase-storage-live.mjs`

Rapports non suivis :

- `SUPABASE_PHASE9C_LIVE_STORAGE_PROBE_REPORT.md`
- `SUPABASE_PHASE9C_BIS_OBJECT_EXISTS_VALIDATION_REPORT.md`
- `SUPABASE_PHASE9C_TER_DELETE_VISIBILITY_VALIDATION_REPORT.md`

Aucun fichier métier, schéma Prisma, page Next.js, configuration secrète ou policy Supabase n’a été modifié.

## Git et sécurité

- aucun commit créé ;
- aucun push ;
- aucun secret ajouté ou exposé ;
- aucune URL signée complète enregistrée ;
- aucune ligne `asset_files` créée ;
- migration métier non commencée.

## Étape suivante recommandée

Une phase distincte doit corriger uniquement le littéral RegExp invalide, vérifier syntaxiquement le fichier avant l’unique exécution des tests, puis reprendre les validations locales et les builds. Aucun nouveau probe ne doit être lancé avant leur réussite complète.
