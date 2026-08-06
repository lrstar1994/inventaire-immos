# Phase 10F-G — Validation finale contrôlée sur PostgreSQL Production

## Statut

**PHASE 10F-G NON VALIDÉE — PRODUCTION RESTAURÉE À L’ÉTAT INITIAL**
La phase s’est arrêtée avant toute écriture et avant tout démarrage du runtime applicatif Production : PostgreSQL Supabase Production n’était pas joignable sur le port 5432 au moment du prévol.

## Résumé exécutif

Les contrôles locaux initiaux sont conformes, mais la première lecture PostgreSQL Production a échoué avec Prisma `P1001`. Un contrôle TCP indépendant a ensuite confirmé l’échec de connexion sur les trois adresses IPv4 résolues pour le pooler Supabase, port 5432.

L’état Production n’ayant pas pu être relu de manière fiable, les critères préalables à une mutation contrôlée n’étaient pas satisfaits. La phase a donc été arrêtée conformément aux contraintes :

- aucune liaison `externalAuthId` créée ou modifiée ;
- aucun compte Auth modifié ;
- aucun runtime Production lancé ;
- aucun scénario UI ou CRUD exécuté ;
- aucune écriture PostgreSQL, Recipe, SQLite ou Storage ;
- aucune migration et aucune modification Prisma.

## État Git initial

- branche : `master` ;
- HEAD : `6244fdc58b6e908ea3a7483a9e3a0abe313aaf84` ;
- message : `feat(auth): secure Supabase authorization and recipe validation` ;
- modifications 10F-UX non commitées présentes et attendues ;
- rapports et scripts historiques non suivis présents ;
- aucun secret suivi ;
- aucun diff dans les schémas Prisma ou les migrations.

## Contrôles locaux réussis

- SQLite réelle présente ;
- SHA-256 SQLite : `9645a17ea36adfba0c8964fbf536c47a323d22f606896112f4ed62334882d5ed` ;
- runtime par défaut toujours SQLite ;
- `.env.local` ignoré par Git ;
- `git diff --check` réussi ;
- aucune modification Prisma ou migration ;
- ports 3000 et 3001 libres avant prévol.

## Configuration Production contrôlée

La commande de sélection du runtime PostgreSQL Production a été invoquée uniquement avec l’option d’aide :

```text
npm run dev:postgresql -- --help
```

Elle a confirmé la commande prévue sans lancer de serveur persistant et sans modifier la configuration SQLite par défaut.

Aucune URL, aucun identifiant PostgreSQL et aucun secret n’est reproduit dans ce rapport.

## Échec du prévol Production

Le diagnostic structurel 10F-E1, exécuté dans son mode par défaut d’inspection, devait relire Production et Recipe sans mutation.

Résultat :

- échec avant lecture complète ;
- code Prisma : `P1001` ;
- cible : pooler Supabase PostgreSQL, port 5432 ;
- aucune transaction d’écriture ouverte ;
- aucune instruction DDL ou DML exécutée.

Le test TCP complémentaire a résolu trois adresses IPv4. Les trois connexions TCP au port 5432 ont échoué. Ce résultat établit un blocage réseau, et non une divergence fonctionnelle ou de données.

## États distants

Derniers états validés avant cette tentative :

| Environnement | Total métier | AssetUnit | AssetFile | FK orphelines |
|---|---:|---:|---:|---:|
| PostgreSQL Recipe | 253 | 13 | 0 | 0 |
| PostgreSQL Production | 222 | 12 | 0 | 0 |

Ces valeurs constituent la référence de départ de 10F-G. Elles n’ont pas pu être rafraîchies pendant ce prévol réseau. Elles ne sont donc pas présentées comme une nouvelle validation distante.

Comme aucune connexion d’écriture n’a été établie, cette phase n’a pu modifier ni Production ni Recipe.

Storage et Auth n’ont fait l’objet d’aucun appel de mutation. Le dernier état validé reste : bucket `asset-files` privé et vide, Auth inchangé.

## Scénarios non exécutés

Les scénarios suivants sont volontairement laissés non validés :

- état anonyme sur runtime Production ;
- quatre rôles et comparaison `auth.users.id` / `externalAuthId` / User / identité UI ;
- sidebar desktop, tablette et mobile ;
- persistance et changement successif de comptes ;
- logout Production ;
- lectures fonctionnelles et diagnostics Prisma Production ;
- CRUD synthétique Production ;
- nettoyage et comparaison des checksums Production ;
- build/runtime PostgreSQL Production.

Aucun résultat de ces scénarios n’est inventé à partir de Recipe.

## Données temporaires et nettoyage

- préfixe de test Production : non créé ;
- donnée temporaire Production : aucune ;
- liaison Auth temporaire Production : aucune ;
- objet Storage temporaire : aucun ;
- nettoyage requis : aucun.

Production n’a pas eu à être restaurée : la tentative s’est arrêtée avant toute écriture.

## Tests et build

La suite locale complète et le build SQLite avaient réussi pendant 10F-UX immédiatement avant cette phase :

- 202/202 tests pertinents réussis ;
- build SQLite réussi ;
- TypeScript réussi.

Ils n’ont pas été relancés après le blocage réseau, car aucun fichier applicatif n’a été modifié par 10F-G et l’arrêt obligatoire est intervenu au prévol distant.

## Fichiers créés ou modifiés par 10F-G

Créé :

- `SUPABASE_PHASE10F_G_PRODUCTION_FINAL_VALIDATION_REPORT.md`.

Aucun fichier applicatif n’a été modifié par cette phase.

## Conditions de reprise

La phase pourra reprendre lorsque le port 5432 du pooler sera joignable. La reprise doit recommencer depuis le début :

1. empreinte SQLite ;
2. inspection Git et secrets ;
3. lecture Recipe 253 / 13 / 0 et FK 0 ;
4. lecture Production 222 / 12 / 0 et FK 0 ;
5. vérification Storage privé et vide ;
6. capture structurelle et checksums Production ;
7. seulement ensuite, démarrage runtime Production et scénarios Auth/UX/CRUD.

Le blocage ne doit pas être contourné et aucun état ne doit être déclaré validé sur la base d’une référence historique seule.

## Confirmations finales

- aucune donnée réelle modifiée ;
- aucune donnée synthétique créée ;
- aucune écriture Production ;
- aucune écriture Recipe ;
- SQLite inchangée ;
- aucune écriture Storage ;
- Auth inchangé ;
- aucun schéma PostgreSQL modifié ;
- aucun schéma Prisma modifié ;
- aucune migration créée ou exécutée ;
- aucun secret exposé ;
- aucun serveur persistant lancé ;
- aucun commit ;
- aucun push ;
- aucun tag.

## Conclusion

**PHASE 10F-G NON VALIDÉE — PRODUCTION RESTAURÉE À L’ÉTAT INITIAL**
