# Phase 10F-F — Recette fonctionnelle complète sur PostgreSQL Recipe

## Statut

**PHASE 10F-F VALIDÉE — APPLICATION OPÉRATIONNELLE SUR SUPABASE RECIPE**
## Résumé exécutif

La recette fonctionnelle a été exécutée exclusivement avec PostgreSQL Supabase Recipe, schéma `immos_recipe_phase8`, sans contournement du prévol. Le runtime SQLite demeure le runtime par défaut du projet.

Les parcours d’authentification, de session, de déconnexion, d’autorisation, de navigation, de lecture et d’écriture métier contrôlée ont été validés. Toutes les données synthétiques créées pour la recette ont été supprimées à la fin.

Résultats principaux :

- 56 contrôles HTTP fonctionnels, aucun échec HTTP inattendu ;
- 6/6 pages de navigation validées ;
- 12/12 modules de lecture validés ;
- règles d’autorisation réelles validées pour les quatre rôles historiques ;
- 192/192 tests automatisés réussis ;
- build SQLite réussi ;
- contrôle TypeScript réussi pendant le build ;
- matrice de parité : 13/13 scénarios compatibles sur SQLite, Recipe et Production ;
- aucune erreur Prisma `P2022` ;
- aucune migration et aucune modification du schéma Prisma ;
- aucune mutation de PostgreSQL Production, SQLite, Auth ou Storage ;
- aucun commit, push ou tag.

## Environnement utilisé

- Git HEAD : `6244fdc58b6e908ea3a7483a9e3a0abe313aaf84`
- Runtime de recette : PostgreSQL
- Schéma utilisé pour les écritures de recette : `immos_recipe_phase8`
- Commande de démarrage : `npm run dev:postgresql:recipe`
- Prévol PostgreSQL Recipe : exécuté sans `RECIPE_SKIP_PREFLIGHT`
- Runtime de développement par défaut : SQLite, inchangé
- PostgreSQL Production `immos` : lecture de contrôle uniquement
- Storage : aucune écriture

Les identifiants Auth de recette ont été chargés depuis les variables locales ignorées par Git. Aucune valeur sensible n’a été affichée ou consignée.

## État initial

| Environnement | Total métier | AssetUnit | AssetFile | FK orphelines |
|---|---:|---:|---:|---:|
| SQLite | 222 | 12 | 0 | 0 |
| PostgreSQL Recipe | 253 | 13 | 0 | 0 |
| PostgreSQL Production | 222 | 12 | 0 | 0 |

- SQLite SHA-256 : `9645a17ea36adfba0c8964fbf536c47a323d22f606896112f4ed62334882d5ed`
- bucket `asset-files` : privé et vide
- trois JPEG historiques : présents et inchangés

## Dispositif de recette

Le script non destructif hors recette et auto-nettoyant suivant a été créé :

- `scripts/validate-phase10f-f-functional-recipe.mjs`

Ses garde-fous imposent notamment :

- vérification de la cible `immos_recipe_phase8` avant toute écriture ;
- refus d’utiliser Production comme cible d’écriture ;
- contrôle de l’empreinte SQLite avant et après ;
- empreintes logiques complètes des tables Production avant et après ;
- préfixes synthétiques uniques ;
- nettoyage exact et idempotent des lignes synthétiques ;
- retrait de toute liaison Auth temporaire ;
- vérification finale des totaux, FK et éléments temporaires ;
- aucune valeur Auth sensible dans les résultats.

## Authentification, session et autorisation

Les scénarios réels suivants ont été validés :

| Scénario | Résultat |
|---|---|
| Page privée sans session | redirection HTTP 307 vers la connexion |
| API privée sans session | HTTP 401 |
| Authentifié sans liaison applicative | accès refusé par défaut |
| BASIC_USER | lecture autorisée, écritures et administration refusées |
| MAINTENANCE_MANAGER | permissions historiques restreintes, `users.manage` refusé |
| INVENTORY_MANAGER | gestion d’inventaire autorisée, `users.manage` refusé |
| DIRECTION | administration utilisateurs et rôles autorisée |
| Persistance de session | session reconnue après rafraîchissement |
| Déconnexion | session supprimée et accès privé de nouveau refusé |

Projection confirmée :

- `DIRECTION` → `admin` ;
- `INVENTORY_MANAGER` → `gestionnaire` ;
- `MAINTENANCE_MANAGER` → `gestionnaire` restreint ;
- `BASIC_USER` → `lecture_seule`.

Seul `DIRECTION` possède `users.manage`. Aucun rôle fourni par le navigateur n’est utilisé comme autorité.

## Navigation et pages

Les six parcours principaux ont été chargés sans erreur serveur :

- tableau de bord ;
- parc et immobilisations ;
- documents ;
- mouvements ;
- référentiels ;
- connexion et état de session.

Résultat : **6/6**.

Aucune boucle de redirection n’a été observée. Les états non authentifié et non autorisé restent distincts.

## Modules de lecture

Les lectures suivantes ont été exercées sur Recipe :

1. options et référentiels d’immobilisation ;
2. unités avec recherche, filtres et ordre déterministe ;
3. entrées d’immobilisations ;
4. catégories ;
5. localisations ;
6. fournisseurs ;
7. articles et modèles ;
8. utilisateurs applicatifs ;
9. rôles ;
10. fichiers ;
11. mouvements ;
12. documents.

Résultat : **12/12**.

Le projet ne possède pas de modèle autonome « marque » : les informations correspondantes restent portées par le contrat historique des articles/modèles. Aucun faux module n’a été créé pour la recette.

Les routes qui exposent recherche, filtres et tris ont été testées avec leurs paramètres réels. Les routes sans contrat de pagination explicite ont été contrôlées sur leur liste et leur ordre existants ; aucune pagination artificielle n’a été ajoutée.

## Opérations CRUD contrôlées

Toutes les écritures ont ciblé exclusivement le schéma Recipe et utilisé des identifiants synthétiques uniques.

### Utilisateur applicatif synthétique

- création ;
- lecture ;
- modification ;
- suppression logique ;
- nettoyage final.

### Référentiels synthétiques

- catégorie ;
- localisation ;
- fournisseur ;
- article ;
- modèle.

Pour chacun : création, lecture/recherche, modification, suppression logique lorsque prévue, puis nettoyage exact.

### Immobilisation synthétique

- validation d’une requête invalide : HTTP 400 ;
- création atomique de l’entrée et de l’unité ;
- lecture de la fiche et de ses relations ;
- recherche, filtre et tri ;
- modification ;
- suppression logique ;
- lecture ultérieure : HTTP 404 ;
- nettoyage final.

### Documents et mouvements

- création en état brouillon ;
- lecture ;
- modification ;
- contrôles de relations ;
- nettoyage exact en fin de recette.

Les API publiques actuelles ne proposent pas de suppression définitive de ces objets. La recette n’a pas inventé de route de suppression ; le nettoyage technique est resté limité aux lignes synthétiques Recipe.

### Upload

Un upload réel n’a pas été exécuté afin de respecter l’interdiction de modifier Storage. Le chemin de validation a été exercé avec un formulaire sans fichier :

- réponse HTTP 400 contrôlée ;
- aucune ligne `asset_files` créée ;
- aucun objet Storage créé.

## Transactions et cohérence

Les écritures métier qui possèdent une transaction applicative ont été exercées, notamment :

- création atomique entrée + unité d’immobilisation ;
- création contrôlée d’un mouvement ;
- nettoyage final transactionnel.

Après chaque séquence, les relations ont été relues. Aucun état partiel, aucune FK orpheline et aucune incohérence métier n’ont été observés.

Les erreurs 400, 401, 403 et 404 ont produit les réponses contrôlées attendues, sans détail Prisma, PostgreSQL ou Supabase sensible.

## Performances observées

Sur les 56 contrôles HTTP du parcours final :

- moyenne observée : environ 5,381 secondes ;
- maximum observé : environ 68,789 secondes ;
- erreur HTTP inattendue : 0 ;
- erreur SQL : 0.

Ces mesures incluent la compilation à froid du serveur Next.js en développement et la latence variable du pooler PostgreSQL distant. Elles ne constituent pas une mesure de performance de production.

Aucun N+1 manifeste n’a été observé dans les parcours et journaux disponibles. Aucun profileur SQL détaillé n’a cependant été activé ; l’optimisation fine des requêtes reste un contrôle distinct avant une bascule Production.

## Anomalies rencontrées pendant la préparation

Trois incidents techniques non métier ont été rencontrés puis résolus :

1. le premier nettoyage transactionnel a dépassé le délai Prisma par défaut de cinq secondes ; la transaction a été annulée et le nettoyage idempotent de secours a supprimé tous les éléments synthétiques ;
2. une indisponibilité transitoire du pooler a interrompu une tentative ; aucun élément synthétique ni aucune liaison temporaire ne subsistait ;
3. un ancien processus Next.js occupait encore le port 3000 et provoquait un conflit de verrou ; les processus concernés ont été arrêtés avant la recette finale.

La recette finale complète a ensuite réussi. Les ports 3000 et 3001 ont été libérés et aucun serveur de développement ne reste actif.

## Tests et contrôles techniques

| Contrôle | Résultat |
|---|---|
| Tests historiques | 181/181 réussis |
| Tests d’alignement 10F-C/10F-D | 6/6 réussis |
| Tests d’alignement 10F-E1 | 5/5 réussis |
| Total | **192/192 réussis** |
| Échecs | **0** |
| Build SQLite | réussi |
| TypeScript | réussi pendant le build |
| Matrice de lecture triple runtime | 13/13 compatible |
| Prévol PostgreSQL Recipe réel | réussi sans contournement |
| Prisma P2022 | aucune |

Le build a généré 19 pages. Le seul avertissement observé est l’avertissement Turbopack/NFT Prisma déjà connu ; il n’a pas empêché le build.

## Compatibilité SQLite / Recipe

Les 13 scénarios historiques de lecture ont été rejoués sur :

- SQLite ;
- PostgreSQL Recipe ;
- PostgreSQL Production en lecture seule.

Résultat : **13/13 compatibles** sur les trois environnements. Les différences de volumes attendues entre Recipe et les deux autres environnements ne modifient pas le comportement fonctionnel.

Les lectures implicites d’`asset_files`, les relations `assetFiles` et les sélections des quatre colonnes Storage ne déclenchent plus d’erreur `P2022`.

## État final et absence de mutation protégée

| Environnement | Total métier | AssetUnit | AssetFile | FK orphelines |
|---|---:|---:|---:|---:|
| PostgreSQL Recipe | 253 | 13 | 0 | 0 |
| PostgreSQL Production | 222 | 12 | 0 | 0 |

Confirmations finales :

- Production : empreintes logiques de toutes les tables identiques avant et après ;
- SQLite : SHA-256 toujours égal à `9645a17ea36adfba0c8964fbf536c47a323d22f606896112f4ed62334882d5ed` ;
- Storage : bucket `asset-files` privé et vide ;
- Auth : aucun compte, rôle ou paramètre global modifié ;
- Recipe : aucune ligne synthétique et aucune liaison temporaire restante ;
- trois JPEG historiques : inchangés ;
- schéma Prisma : inchangé ;
- migration : aucune ;
- `prisma migrate` et `prisma db push` : non exécutés ;
- runtime par défaut : toujours SQLite ;
- secret exposé : aucun ;
- commit : aucun ;
- push : aucun ;
- tag : aucun.

## Conclusion

**PHASE 10F-F VALIDÉE — APPLICATION OPÉRATIONNELLE SUR SUPABASE RECIPE**
