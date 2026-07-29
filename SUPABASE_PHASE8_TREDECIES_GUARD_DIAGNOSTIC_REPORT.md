# Phase 8 tredecies — Diagnostic du garde-fou `current_schema()`

Date : 2026-07-29 (Indian/Antananarivo)

## Conclusion

La cause architecturale est démontrée dans le code : le garde-fou exécuté avant
les écritures transactionnelles utilise le client Prisma de base capturé dans
une fermeture, et non le `TransactionClient` actif.

Conformément à la consigne d'arrêt, aucune correction, aucun test de connexion
transactionnelle et aucun serveur n'ont été exécutés dans cette phase.

## Code exact et client réellement utilisé

Fichier : `lib/prisma-client-factory.js`.

Le client PostgreSQL est construit ainsi :

```js
const base = new Client({ datasourceUrl: target.toString(), log });
return base.$extends({
  query: {
    $allModels: {
      async $allOperations({ operation, args, query }) {
        if (!WRITE_OPERATIONS.has(operation)) return query(args);
        const rows = await base.$queryRaw`SELECT current_schema() AS schema`;
        // contrôle puis query(args)
      }
    }
  }
});
```

Constats :

- `base` est un `PrismaClient` complet créé avant l'extension;
- il est capturé lexicalement par `guardedPostgreSQLClient()`;
- le callback d'extension ne reçoit aucun paramètre `tx`;
- `query(args)` poursuit l'opération sur le contexte courant;
- mais le contrôle utilise explicitement `base.$queryRaw`;
- lorsqu'une écriture est appelée avec `tx.assetDocument.create()`, le contrôle
  `current_schema()` part donc sur le client de base, hors de la transaction
  interactive;
- la requête exacte est :
  `SELECT current_schema() AS schema`.

Lors de la tentative documentaire, l'ordre observé était :

1. acquisition de la transaction interactive;
2. quatre lectures métier avec `tx`;
3. appel de `tx.assetDocument.create()`;
4. interception par l'extension;
5. `base.$queryRaw` hors transaction pour `current_schema()`;
6. `P1001`;
7. aucune création exécutée et rollback.

L'instrumentation a mesuré :

- acquisition : 2 714 ms;
- temps écoulé dans la transaction : 19 064 ms;
- appel transactionnel : 21 778 ms;
- quatre lectures réussies;
- une écriture appelée mais non atteinte après l'échec du garde-fou.

## Architecture Prisma constatée

- Client généré chargé : `generated/prisma-recipe`.
- Version Prisma Client générée : `6.19.3`.
- Version Prisma CLI déclarée : `^6.19.3`.
- Version Node.js : `v24.14.0`.
- Générateur : `prisma-client-js`.
- Moteur Prisma : moteur natif standard, version
  `c2990dca591cba766e3b7ef5d9e8a84796e47ab7`.
- Aucun package `@prisma/adapter-*`.
- Schéma statique : `immos_recipe_phase8`.
- Tous les modèles et enums utilisent `@@schema("immos_recipe_phase8")`.
- Singleton applicatif par combinaison provider/client via
  `globalThis.__inventairePrisma_<provider>_<client>`.
- Mode de connexion recette : Supavisor Session, port 5432,
  `sslmode=require`.
- Aucun `connection_limit`, `pool_timeout` ou `pgbouncer` ajouté au client
  recette dans `lib/prisma.js`.
- La représentation masquée de la connexion a été validée; aucun secret n'a été
  affiché.

## Tests demandés et arrêt anticipé

La consigne prévoit explicitement qu'en cas d'utilisation du client global à la
place de `tx`, l'anomalie doit être documentée sans correction, puis la phase
arrêtée. Les tests Session et Transaction pooler n'ont donc pas été lancés.

| Test | Résultat | Durée | Erreur | Interprétation |
|---|---|---:|---|---|
| Session hors transaction `SELECT 1` | Non exécuté dans cette phase | — | — | Arrêt anticipé après preuve statique |
| Session hors transaction `current_schema()` | Non exécuté | — | — | idem |
| Session transaction `SELECT 1` | Non exécuté | — | — | idem |
| Session transaction `current_schema()` avec `tx` | Non exécuté | — | — | idem |
| Session transaction avec délais | Non exécuté | — | — | idem |
| Transaction pooler hors transaction | Non exécuté | — | — | idem |
| Transaction pooler interactive | Non exécuté | — | — | idem |
| Client réellement utilisé par le garde-fou | **Échec architectural démontré** | — | — | `base` global, pas `tx` |

Les succès de connexion des phases précédentes ne permettent pas d'évaluer le
comportement de `tx.$queryRaw`, car le code fautif n'appelle jamais cette forme.

## Garanties statiques déjà disponibles

Sans requête runtime :

- sélection explicite `APP_PRISMA_CLIENT=recipe`;
- import de `generated/prisma-recipe`;
- datasource déclarant `schemas = ["immos_recipe_phase8"]`;
- mappings `@@schema("immos_recipe_phase8")`;
- validation de l'URL exigeant `schema=immos_recipe_phase8`;
- refus des combinaisons provider/client invalides.

Le contrôle runtime ajoute la vérification de la session PostgreSQL réellement
acquise. Cette protection reste utile contre une URL ou un `search_path`
inattendu, mais son exécution via `base` pendant une transaction exige une
seconde acquisition de connexion et ne vérifie pas la session transactionnelle
qui effectuera l'écriture.

## Évaluation des positions possibles

| Option | Protection | Risque/coût |
|---|---|---|
| A — contrôle avant transaction avec le client recipe | Vérifie une session du client avant l'opération | Décalage possible avec la session ensuite acquise; un aller-retour supplémentaire |
| B — première requête avec `tx` | Vérifie exactement la session transactionnelle qui écrira | Aucun décalage; un aller-retour dans la transaction |
| C — les deux | Vérification préalable et transactionnelle | Deux allers-retours et davantage de surface P1001, sans gain suffisant face à B |

## Cause et correction minimale recommandée

Cause démontrée : **mauvais client utilisé par le garde-fou dans une transaction
interactive** (`base.$queryRaw` au lieu de `tx.$queryRaw`).

Correction minimale proposée, sans application dans cette phase :

- faire du contrôle `current_schema()` la première requête explicite de la
  transaction, avec le `TransactionClient` `tx`;
- conserver les garanties statiques du client recette;
- ne pas effectuer de requête `base.$queryRaw` depuis l'interception d'une
  écriture transactionnelle;
- valider cette correction séparément avec le script minimal Session 5432 avant
  toute nouvelle tentative documentaire.

Cette recommandation correspond au cas 1 défini dans la phase. Aucun basculement
vers le port 6543 n'est proposé.

## Traçabilité

- Fichier créé :
  `SUPABASE_PHASE8_TREDECIES_GUARD_DIAGNOSTIC_REPORT.md`.
- Aucun fichier applicatif modifié dans cette phase.
- Aucun script de diagnostic réseau créé, puisque l'arrêt anticipé était requis.
- Aucun serveur lancé.
- Aucune connexion diagnostique supplémentaire ouverte.
- Aucune écriture ni donnée modifiée.
- Aucun secret exposé.
- Aucun commit créé.
