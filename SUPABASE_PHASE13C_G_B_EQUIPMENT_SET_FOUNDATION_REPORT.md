# Phase 13C-G-B — Socle additif des ensembles installés

## Résultat

**PHASE 13C-G-B VALIDÉE LOCALEMENT — SOCLE DES ENSEMBLES INSTALLÉS PRÊT**

## Périmètre réalisé

- Ajout additif de `EquipmentSet` et `EquipmentSetComponent` dans les schémas SQLite, PostgreSQL Production et PostgreSQL Recipe.
- `EquipmentSet` porte un code unique, un nom, une description facultative, un emplacement obligatoire, un statut, les champs d’audit usuels et une suppression logique.
- `EquipmentSetComponent` accepte exactement une des deux formes suivantes :
  - composant individuel : un `AssetUnit`, quantité conceptuelle égale à 1 ;
  - composant quantitatif : un `AssetEntry`, un emplacement source et une quantité strictement positive.
- Une contrainte SQL exclusive interdit simultanément les deux formes ainsi que l’absence de forme.
- Une unité active ne peut appartenir qu’à un ensemble actif grâce à un index unique partiel.
- Services minimaux ajoutés : création, lecture, ajout d’un composant et désactivation logique.

## Anti-double-comptage

L’ensemble est une composition logique et non une seconde couche de stock. L’ajout d’un composant :

- ne crée aucun `AssetUnit` ;
- ne modifie pas `AssetEntry.quantity` ;
- ne crée ni ne duplique de `QuantitativeStockPosition` ;
- ne décrémente pas le stock quantitatif ;
- vérifie toutefois que la quantité cumulée référencée ne dépasse pas la position disponible du même lot et du même emplacement.

Le choix entre composition purement descriptive et future réservation de quantité reste explicitement différé.

## Statut du mode E

`E` reste présent dans `AssetTrackingMode` uniquement pour compatibilité, avec une annotation de dépréciation. Il demeure refusé par les flux opérationnels existants. Les modes actifs restent `I`, `Q` et `QI` ; les ensembles installés sont désormais une couche métier séparée.

## Migrations

- SQLite : `20260820150000_add_equipment_set_foundation`, appliquée localement après sauvegarde.
- PostgreSQL Production : migration homologue préparée, non appliquée.
- PostgreSQL Recipe : migration homologue préparée, non appliquée.
- Aucun `DROP`, seed, import, conversion historique ou création automatique d’ensemble.

Sauvegarde SQLite : `backups/phase13c-g-b/dev-before-13c-g-b-20260820-155056.db`.

- SHA-256 avant : `A194FD15D5AB4B698B3FEAD3BB6ECBD887F0753CED0DE2B02BD8EB7E8A4BFF92`
- SHA-256 après : `8FDE5146A660D180B895E965A1AC21489D888213B08BDB4F87FF8929151D32B1`
- `integrity_check` : `ok`
- FK orphelines : `0`
- `equipment_sets` : `0`
- `equipment_set_components` : `0`

Volumes historiques après migration, inchangés : 3 catégories, 5 références, 10 entrées, 12 unités, 11 mouvements, 14 documents, 0 fichier, 0 position quantitative et 0 ligne de mouvement quantitative.

## Validations

- Trois schémas Prisma valides.
- 20/20 tests ciblés réussis : contraintes structurelles, composants individuels et quantitatifs, stock maximal, absence de mutation patrimoniale, désactivation logique et non-régression ciblée I/Q/QI.
- `git diff --check` conforme.
- TypeScript non relancé : aucun fichier TypeScript modifié ; les services ajoutés sont JavaScript et couverts par les tests ciblés.
- Aucun build ni suite générale relancés, conformément au périmètre optimisé demandé.

## Fichiers de la phase

- `lib/equipment-set-service.js`
- `scripts/test-equipment-set-foundation.mjs`
- `prisma/schema.prisma`
- `prisma/postgresql/schema.prisma`
- `prisma/postgresql-recipe/schema.prisma`
- les trois migrations `20260820150000_add_equipment_set_foundation`
- le présent rapport

## États protégés

- Production et Recipe : migrations préparées mais non appliquées ; aucune connexion ni mutation distante.
- Auth, Storage et Vercel : inchangés.
- Aucun secret ou fichier d’environnement ajouté.
- Aucun staging, commit, push, tag ou déploiement.
