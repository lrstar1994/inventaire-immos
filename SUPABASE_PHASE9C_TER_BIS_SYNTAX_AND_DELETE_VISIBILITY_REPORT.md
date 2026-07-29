# Phase 9C ter bis — Correction syntaxique et reprise contrôlée

Date : 2026-07-29

## Conclusion

**Phase 9C ter bis échouée avant probe.**

L’unique correction syntaxique autorisée a réussi : `node --check` retourne 0 et le fichier de tests est désormais analysable par Node.js. La suite Storage a ensuite exécuté 26 tests :

- 25 réussis ;
- 1 échoué ;
- aucun appel réel à Supabase.

L’échec restant concerne le même test statique. Deux expressions régulières voisines sont syntaxiquement valides mais sur-échappées ; elles cherchent des antislashs littéraux qui ne figurent pas dans le code source. Conformément aux règles :

- aucune seconde correction n’a été appliquée ;
- aucun test n’a été relancé ;
- aucun build n’a été exécuté ;
- aucun probe réel n’a été exécuté ;
- aucun objet Storage n’a été créé.

## Référence et état Git initial

- Commit de départ : `03924ae5d3f8a540e36c3e29430b65b4afcdaab4`
- Message : `feat: add storage provider abstraction`
- HEAD conforme : oui
- Processus Node/Prisma/psql résiduel : aucun
- Ports 3000 et 3018 : libres

Fichiers modifiés ou non suivis hérités des phases précédentes :

- `lib/storage/supabase-storage-provider.js`
- `scripts/test-file-storage-abstraction.mjs`
- `scripts/test-supabase-storage-live.mjs`
- `SUPABASE_PHASE9C_LIVE_STORAGE_PROBE_REPORT.md`
- `SUPABASE_PHASE9C_BIS_OBJECT_EXISTS_VALIDATION_REPORT.md`
- `SUPABASE_PHASE9C_TER_DELETE_VISIBILITY_VALIDATION_REPORT.md`

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

## SyntaxError initial

- Fichier : `scripts/test-file-storage-abstraction.mjs`
- Ligne : 325
- Test : `l'attente bornee ne modifie pas l'interpretation restrictive de objectExists`
- Intention : vérifier statiquement que le provider ne contient pas un retour direct `false` pour tout HTTP 400.

Expression avant correction :

```js
/response\\.status === 400\\) return false/
```

Dans un littéral RegExp, `\\)` représente un antislash littéral suivi d’une parenthèse fermante interprétée comme opérateur de groupe. Aucun groupe n’étant ouvert, le parseur signale `Unmatched ')'`.

Expression après l’unique correction :

```js
/response\.status === 400\) return false/
```

Cette correction :

- conserve la correspondance précise attendue ;
- échappe le point et la parenthèse comme caractères littéraux ;
- ne supprime ni n’affaiblit le test ;
- ne modifie aucun fichier de production.

## Contrôle syntaxique

Commande :

`node --check scripts/test-file-storage-abstraction.mjs`

Résultat :

- code de sortie : 0 ;
- aucun SyntaxError ;
- aucun test exécuté ;
- aucun accès réseau ;
- aucun objet Storage créé.

Une seule correction syntaxique a été effectuée.

## Audit du diff

- la correction de reprise porte sur une seule ligne ;
- `git diff --check` : réussi ;
- les autres changements visibles correspondent aux préparations validées des Phases 9C bis et 9C ter ;
- aucun fichier métier, schéma Prisma ou page Next.js n’a été modifié.

## Résultat de la suite Storage

Commande exécutée une seule fois :

`npm run test:storage`

Résultat :

- tests totaux : 26 ;
- réussis : 25 ;
- échoués : 1 ;
- durée Node Test Runner : 4 086 ms ;
- durée du processus : 15,7 s ;
- aucun SyntaxError ;
- aucun appel Supabase réel.

Les scénarios suivants ont réussi :

- les 8 tests Storage Phase 9B ;
- les 8 tests restrictifs `objectExists()` ;
- absence dès la première observation ;
- présence puis absence ;
- plusieurs présences puis absence ;
- présence jusqu’à la limite ;
- propagation d’une erreur d’autorisation ;
- propagation d’une erreur réseau ;
- maximum de cinq observations ;
- délais et horloge injectés ;
- aucune seconde suppression automatique.

Les tests utilisent des délais injectés et n’attendent pas réellement 2,5 secondes.

## Échec restant

Test échoué :

`l'attente bornee ne modifie pas l'interpretation restrictive de objectExists`

Première assertion en échec :

```js
assert.match(source, /body\\?\\.error === "not_found"/);
```

Le code de production contient :

```js
body?.error === "not_found"
```

La RegExp contient des doubles antislashs dans un littéral JavaScript. Elle recherche donc des antislashs réels au lieu de rechercher `body?.error`. La même situation existe sur l’assertion voisine concernant `body?.message`.

Cet échec est un défaut du test statique, non un défaut de `objectExists()` ou de `waitForObjectAbsence()`. Il n’a pas été corrigé dans cette exécution, puisque toute correction après l’échec de la suite était interdite.

## Architecture d’attente préparée

- `objectExists()` reste une vérification ponctuelle ;
- `waitForObjectAbsence()` est distincte ;
- cinq observations au maximum ;
- délais : 250, 500, 750 et 1 000 ms ;
- attente cumulée maximale : 2 500 ms ;
- disparition confirmée uniquement après `objectExists() === false` ;
- toute erreur réelle est propagée immédiatement ;
- aucun retry sur upload, téléchargement, URL signée ou suppression ;
- aucune seconde suppression automatique.

Cette architecture a passé tous ses tests comportementaux mockés. Seul le contrôle statique de texte a échoué.

## Builds et probe

Conformément à l’arrêt obligatoire :

- `npm run build` : non exécuté
- `npm run build:sqlite` : non exécuté
- `npm run build:postgresql` : non exécuté
- probe réel Phase 9C ter bis : non exécuté
- clé `diagnostics/phase9c-ter-bis/{uuid}/...` : aucune créée
- upload : aucun
- URL signée : aucune
- suppression : aucune
- observations post-suppression réelles : aucune

## État protégé final

Contrôles finaux en lecture seule :

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
- `diagnostics/phase9c-ter-bis/` : 0 objet
- policy modifiée : aucune
- trois JPEG orphelins : inchangés
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
- `SUPABASE_PHASE9C_TER_BIS_SYNTAX_AND_DELETE_VISIBILITY_REPORT.md`

## Git et sécurité

- aucun commit créé ;
- aucun push ;
- aucun secret ou URL signée complète ajouté ;
- aucune ligne `asset_files` créée ;
- aucune migration métier commencée.

## Étape suivante recommandée

Une nouvelle phase bornée doit corriger uniquement les deux RegExp statiques sur-échappées, effectuer `node --check`, puis exécuter une seule fois la suite Storage. Les builds et le probe ne doivent reprendre qu’après réussite complète des 26 tests.
