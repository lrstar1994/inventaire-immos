# Phase 10F-G3 — Qualification prolongée du canal Production 6543

## Statut

**PHASE 10F-G3 NON VALIDÉE — CANAL 6543 INDISPONIBLE**

## Résumé

La qualification a été arrêtée au test réseau initial, avant Prisma. La résolution DNS a réussi, mais la connexion TCP au Transaction pooler 6543 a été refusée. Le contrôle PostgreSQL natif borné a confirmé l'indisponibilité du canal et n'a exécuté aucun `SELECT 1`.

Conformément à l'arrêt obligatoire :

- aucune série Prisma n'a été lancée ;
- aucun retry n'a été effectué ;
- aucun prévol Production final n'a été exécuté ;
- aucun serveur Next.js n'a été démarré.

## Canal et paramètres non sensibles

- Variable sélectionnée : `SUPABASE_DATABASE_URL`.
- Mode : Transaction pooler.
- Port : 6543.
- Schéma : `immos`.
- SSL : `sslmode=require`.
- Paramètres Prisma prévus : `pgbouncer=true`, `connection_limit=1`, `pool_timeout=60`.
- Client prévu : `generated/prisma-postgresql`.
- URL, hôte complet, utilisateur et credentials non reproduits.

`SUPABASE_DIRECT_URL` et le port 5432 n'ont pas été utilisés comme canal de qualification.

## Prévol local

- SQLite : SHA-256 initial conforme à `9645a17ea36adfba0c8964fbf536c47a323d22f606896112f4ed62334882d5ed`.
- Ports HTTP 3000 et 3001 : libres.
- Aucun changement de schéma Prisma ou migration détecté.
- `git diff --check` : réussi avant le diagnostic.
- Aucun serveur Next.js actif ou démarré.

## Test réseau initial unique

| Étape | Résultat | Détail non sensible |
|---|---|---|
| Validation de la configuration | Réussie | 6543, `immos`, SSL obligatoire |
| DNS | Réussi | 3 adresses IPv4 résolues |
| TCP 6543 | Échec | connexion refusée/interdite au niveau réseau |
| PostgreSQL natif | Échec avant requête | client sorti avec code 2 ; aucune session PostgreSQL établie |
| `SELECT 1` natif | Non exécuté | connexion native impossible |
| Prisma | Non exécuté | arrêt obligatoire après échec natif |

Première anomalie : connexion TCP 6543 impossible pendant le test initial du 6 août 2026.

## Fenêtre de stabilité Prisma

La fenêtre de quinze minutes n'a pas été ouverte, car sa précondition PostgreSQL native n'était pas satisfaite.

| Série | Heure | Durée | SELECT 1 | Schéma | AssetFile | Résultat |
|---:|---|---:|---|---|---:|---|
| 1 | — | — | non exécuté | — | — | arrêt avant Prisma |
| 2 | — | — | non exécuté | — | — | arrêt avant Prisma |
| 3 | — | — | non exécuté | — | — | arrêt avant Prisma |
| 4 | — | — | non exécuté | — | — | arrêt avant Prisma |
| 5 | — | — | non exécuté | — | — | arrêt avant Prisma |
| 6 | — | — | non exécuté | — | — | arrêt avant Prisma |
| 7 | — | — | non exécuté | — | — | arrêt avant Prisma |
| 8 | — | — | non exécuté | — | — | arrêt avant Prisma |
| 9 | — | — | non exécuté | — | — | arrêt avant Prisma |
| 10 | — | — | non exécuté | — | — | arrêt avant Prisma |

Qualification : 0/10 séries, seuil 10/10 non atteint. Aucun résultat partiel n'est assimilé à une réussite.

## Prévol Production final

Non exécuté. Il n'était autorisé qu'après dix séries Prisma réussies.

## États protégés et absence d'écriture

La phase n'a exécuté aucune session PostgreSQL aboutie et aucune requête Prisma. Par conséquent :

- aucune écriture Production ;
- aucune écriture Recipe ;
- aucune modification SQLite ;
- aucune écriture Storage ;
- aucune modification Auth ;
- aucune migration ou modification Prisma ;
- aucun CRUD ni recette fonctionnelle.

Les compteurs distants de référence restent ceux de la dernière validation réussie, mais ne peuvent pas être relus pendant G3 puisque le canal initial est indisponible :

- Production : référence 222 / 12 / 0, 0 FK orpheline ;
- Recipe : référence 253 / 13 / 0, 0 FK orpheline ;
- Storage : référence bucket privé et vide.

Ils ne sont pas déclarés revalidés dans cette phase.

## Recommandation

La connectivité observée depuis le poste et le réseau actuels est intermittente : G1 avait réussi, G2 puis G3 ont échoué. La prochaine qualification Production devrait être réalisée depuis :

1. un autre réseau stable autorisant explicitement le Transaction pooler 6543 ; ou
2. le futur environnement d'hébergement, dont la connectivité sortante peut être contrôlée.

Ne pas relancer automatiquement 10F-G2 tant qu'une nouvelle fenêtre 10/10 n'a pas été obtenue.

## Fichiers et Git

- Créé : `SUPABASE_PHASE10F_G3_PRODUCTION_6543_EXTENDED_STABILITY_REPORT.md`.
- Aucun fichier applicatif modifié par G3.
- Aucun secret exposé dans le rapport.
- Aucun commit, push ou tag effectué.
