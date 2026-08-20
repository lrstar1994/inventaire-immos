# Phase 13C-G-C — Gestion utilisateur des ensembles installés

## Résultat

**PHASE 13C-G-C VALIDÉE LOCALEMENT — ENSEMBLES INSTALLÉS UTILISABLES DANS L'APPLICATION**

## Routes ajoutées

- `GET /api/equipment-sets` : liste des ensembles actifs et de leurs composants.
- `POST /api/equipment-sets` : création avec la permission `assets.write`.
- `GET /api/equipment-sets/[id]` : consultation détaillée.
- `DELETE /api/equipment-sets/[id]` : désactivation logique avec `assets.write`.
- `POST /api/equipment-sets/[id]/components` : ajout d'un composant avec `assets.write`.

Les lectures exigent une session autorisée. Les écritures sont refusées aux utilisateurs en lecture seule. Aucune suppression physique n'est exposée.

## Interface Parc physique

Une vue distincte **Ensembles installés** affiche le code, le nom, l'emplacement, le statut et les composants. Un utilisateur disposant du droit d'écriture peut créer un ensemble, ajouter un composant individuel ou quantitatif et désactiver logiquement un ensemble. Les commandes sont absentes en lecture seule.

## Règles des composants

- Individuel : unité existante, active, au même emplacement et non affectée à un autre ensemble actif.
- Quantitatif : lot et position existants au même emplacement, quantité entière positive et inférieure ou égale au disponible non encore référencé.
- L'interface indique explicitement que la composition quantitative est descriptive et ne réserve pas le stock.

## Anti-double-comptage

L'ajout d'un composant ne crée aucun patrimoine, ne crée aucun `AssetUnit`, ne modifie pas `AssetEntry.quantity` et ne modifie aucune `QuantitativeStockPosition`. `EquipmentSetComponent` référence uniquement le patrimoine existant.

Le mode `E` reste déprécié et bloqué. Les contrôles ciblés des modes `I`, `Q` et `QI` restent conformes.

## Validations

- Tests ciblés : **25/25 réussis**.
- Build SQLite : réussi, TypeScript inclus dans le build.
- Avertissement NFT Turbopack historique non bloquant, inchangé.
- `git diff --check` : conforme.
- SHA-256 SQLite avant/après : `8FDE5146A660D180B895E965A1AC21489D888213B08BDB4F87FF8929151D32B1`.
- Aucun secret ou fichier d'environnement ajouté.

## États protégés

Aucune connexion ni modification Recipe, Production, Supabase Auth, Storage ou Vercel. Aucun changement Prisma ou migration. Aucun staging, commit, push, tag ou déploiement.
