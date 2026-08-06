# Phase 10F-H — Checkpoint local et préparation de la validation Production hébergée

## Statut

**PHASE 10F-H NON VALIDÉE — ARRÊT AVANT STAGING**

Le checkpoint n'a pas été créé. Un test a échoué avant le build et le staging ; la consigne d'arrêt obligatoire a donc été appliquée.

## État Git initial et final

- Ancien HEAD : `6244fdc58b6e908ea3a7483a9e3a0abe313aaf84`.
- Message : `feat(auth): secure Supabase authorization and recipe validation`.
- Nouveau HEAD : inchangé, `6244fdc58b6e908ea3a7483a9e3a0abe313aaf84`.
- Commit demandé : **non créé**.
- Message prévu : `feat: complete Supabase runtime migration readiness`.
- Staging : vide.
- Push : aucun.
- Tag : aucun.
- Déploiement : aucun.

## Inventaire du périmètre candidat

### Code applicatif validé depuis le checkpoint précédent

- shell privé, identité utilisateur et logout : `app/components/app-shell.js` ;
- responsive : `app/globals.css` ;
- projection des permissions d'écriture dans les pages et composants Parc, Documents, Mouvements et Référentiels ;
- permission UI serveur dans `lib/authorization.js` ;
- tests d'autorisation renforcés dans `scripts/test-app-authorization.mjs`.

### Diagnostics, alignement et runtime candidats

- `scripts/align-asset-files-sqlite-copy.mjs` ;
- `scripts/diagnose-read-only-functional-parity.mjs` ;
- `scripts/smoke-sqlite-runtime-readonly.mjs` ;
- `scripts/phase10f-e1-align-production.mjs` ;
- `scripts/sql/phase10f-c-align-asset-files-sqlite-copy.sql` ;
- `scripts/sql/phase10f-c-production-alignment-draft-NOT-EXECUTED.sql` ;
- `scripts/test-phase10f-c-sqlite-alignment.mjs` ;
- `scripts/test-phase10f-e1-production-alignment.mjs` ;
- `scripts/validate-phase10f-f-functional-recipe.mjs` ;
- `scripts/test-session-sidebar-current-user.mjs` ;
- `scripts/diagnose-phase10f-ux-final-state.mjs` ;
- `scripts/preflight-postgresql-production.mjs` ;
- `scripts/run-next-with-database.mjs` ;
- `scripts/inspect-supabase-alternative-urls.mjs` ;
- `scripts/qualify-production-postgresql-native.mjs` ;
- `scripts/stability-production-runtime-6543.mjs` ;
- `scripts/diagnose-phase10f-g1-final-states.mjs` ;
- `scripts/test-production-connectivity-preflight.mjs`.

### Rapports candidats 10F

- rapports 10F-A, 10F-B, 10F-C, 10F-D ;
- rapports 10F-E et 10F-E1 ;
- rapport 10F-F ;
- rapport 10F-UX ;
- rapports 10F-G, 10F-G1, 10F-G2 et 10F-G3.

### Éléments explicitement exclus

- `.env`, `.env.local` et toute valeur d'environnement ;
- SQLite `prisma/dev.db` et sa sauvegarde ;
- dumps PostgreSQL, logs, caches, `.next`, PID et fichiers temporaires ;
- clients Prisma générés normalement ignorés ;
- rapports historiques 10C et 10D non suivis ;
- rapport post-checkpoint 10E-G non suivi ;
- présent rapport H, créé après l'arrêt et restant non suivi tant qu'une reprise validée n'en décide autrement.

## Validation locale et cause de l'arrêt

Commande locale lancée : suite Node ciblée regroupant les tests métier, Storage, Auth, autorisation, gardes de schéma, alignements 10F, UX et prévol Production.

Résultat :

- tests réussis : **207** ;
- tests échoués : **1** ;
- total : **208**.

Échec unique : `scripts/test-prisma-schema-guard-transaction.mjs` a tenté une connexion réelle au schéma Recipe sur le Session pooler 5432 et a reçu une indisponibilité réseau. Le test ne constitue donc pas un test purement local dans l'environnement courant.

Cet échec n'a provoqué aucune écriture. Il n'a pas été relancé, masqué ou retiré rétroactivement de la suite.

Conformément à l'arrêt obligatoire :

- build SQLite : non exécuté après l'échec ;
- contrôle TypeScript : non exécuté après l'échec ;
- staging : non exécuté ;
- commit : non exécuté.

`git diff --check` était réussi avant la suite. L'empreinte SQLite relevée avant les tests était conforme : `9645a17ea36adfba0c8964fbf536c47a323d22f606896112f4ed62334882d5ed`.

## État des environnements

Cette phase n'a exécuté aucune nouvelle connexion Production et aucune mutation distante.

- SQLite : backend par défaut, empreinte conforme avant la suite, aucune commande d'écriture exécutée ;
- Production : référence 222 / 12 / 0, 0 FK orpheline ; non revalidée depuis le poste dans H ;
- Recipe : référence 253 / 13 / 0, 0 FK orpheline ; la tentative du test a échoué avant opération ;
- Storage : référence bucket privé et vide, aucune opération exécutée ;
- Auth : aucune opération exécutée.

La validation fonctionnelle Production reste **non validée**. Le backend par défaut reste SQLite.

## Raison du transfert vers l'hébergement

Le poste et le réseau actuels présentent une connectivité intermittente vers les poolers Supabase : le Transaction pooler 6543 a alterné succès et P1001, tandis que le Session pooler 5432 est indisponible. Une recette Production longue ne peut pas être considérée fiable depuis ce poste.

Le futur environnement d'hébergement doit fournir une sortie réseau stable, reproductible et supervisée vers le Transaction pooler 6543.

## Architecture d'hébergement proposée

### Plateforme cible

Plateforme recommandée : **Vercel**, région d'exécution proche de la région Supabase, avec Next.js App Router géré nativement. Une plateforme conteneurisée équivalente reste possible si elle offre une sortie TCP stable vers 6543.

### Runtime et commandes

- Node.js : **24.x LTS**, aligné avec le runtime local validé ;
- installation : `npm ci` ;
- build : `npm run build:postgresql` ;
- démarrage : commande Next.js gérée par Vercel après build ;
- pour une plateforme conteneurisée, ajouter dans une phase dédiée un script `start:postgresql` réutilisant le sélecteur contrôlé avant d'utiliser `next start` ;
- prévol Production obligatoire et bloquant avant build/démarrage ;
- aucun `prisma migrate`, `prisma db push` ou seed au déploiement.

### Variables publiques

- `NEXT_PUBLIC_SUPABASE_URL` ;
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

Ces deux valeurs sont publiques par nature, mais restent gérées par la plateforme et ne sont jamais inscrites dans Git.

### Variables strictement serveur

- `SUPABASE_DATABASE_URL` : Transaction pooler 6543, schéma `immos`, `sslmode=require` ;
- `SUPABASE_URL` ;
- `SUPABASE_ANON_KEY` si l'alias serveur est conservé ;
- `SUPABASE_SERVICE_ROLE_KEY` ;
- `SUPABASE_STORAGE_BUCKET=asset-files` ;
- `SUPABASE_STORAGE_SIGNED_URL_TTL_SECONDS` si la valeur par défaut doit être explicitée ;
- `APP_DATABASE_PROVIDER=postgresql` ;
- `APP_PRISMA_CLIENT=normal` ;
- `APP_FILE_STORAGE_PROVIDER=supabase` seulement lors d'une activation Storage explicitement validée.

La variable réellement utilisée par le projet est `APP_DATABASE_PROVIDER`, et non `APP_DATA_BACKEND`. Les paramètres `pgbouncer=true`, `connection_limit=1` et `pool_timeout=60` sont ajoutés par le runtime validé ; ils ne doivent pas être reconstruits depuis le navigateur.

### Auth et redirections

- conserver les paramètres Auth globaux partagés sans modification automatique ;
- déclarer dans Supabase Dashboard uniquement les URL HTTPS exactes de callback/retour de l'environnement hébergé ;
- interdire les wildcards larges et les redirections externes ;
- conserver `/connexion` publique et toutes les mutations protégées côté serveur ;
- ne pas exposer la service-role key au navigateur.

### Protection de l'environnement

- URL de validation non indexée et protégée par contrôle d'accès plateforme en complément de Supabase Auth ;
- accès limité aux personnes de recette ;
- logs assainis, sans URL PostgreSQL, cookie, JWT ou URL signée ;
- environnement Production Supabase explicitement séparé des previews ;
- concurrence de recette limitée à une campagne à la fois ;
- alertes et arrêt automatique si le prévol ou les compteurs divergent.

## Procédure de validation Production hébergée

1. Déployer le commit local validé dans un environnement protégé, sans basculer le trafic principal.
2. Vérifier la présence des variables par leur nom uniquement.
3. Exécuter le prévol Production en lecture seule : client PostgreSQL, 6543, `immos`, 222 / 12 / 0, 0 FK orpheline, enum et colonnes Storage conformes.
4. Confirmer SQLite et Recipe par leurs contrôles indépendants, sans mutation.
5. Valider l'état anonyme : connexion publique, shell privé absent, redirection des pages privées.
6. Utiliser uniquement le compte Auth de validation dédié.
7. Lier temporairement et successivement ce compte aux profils DIRECTION, BASIC_USER, INVENTORY_MANAGER et MAINTENANCE_MANAGER de Production, après contrôle d'unicité.
8. Pour chaque rôle, vérifier identité, libellé, sidebar desktop/mobile, menus, 401/403 et permissions serveur ; seul DIRECTION doit posséder `users.manage`.
9. Vérifier persistance de session, changement de compte et logout complet sans cache d'identité.
10. Parcourir dashboard, parc, documents, mouvements, référentiels, utilisateurs/rôles, recherche, tri, filtre, pagination et erreurs 404.
11. Créer une campagne synthétique avec préfixe UUID, capturer totaux et checksums avant écriture.
12. Exécuter un CRUD minimal sur des lignes exclusivement synthétiques avec DIRECTION ; confirmer refus BASIC_USER, doublon et référence invalide.
13. Exécuter une transaction synthétique volontairement annulée et confirmer l'absence de donnée partielle.
14. Ne réaliser aucun upload, aucune URL signée réelle et aucune écriture Storage.
15. Nettoyer dans l'ordre inverse toutes les lignes et audits synthétiques, puis retirer chaque liaison `externalAuthId` temporaire.
16. Rechercher le préfixe dans toutes les tables concernées.
17. Confirmer Production 222 / 12 / 0, 0 FK orpheline ; Recipe 253 / 13 / 0 ; Storage vide ; aucune liaison temporaire.
18. Arrêter immédiatement l'environnement de validation si un compteur, checksum, permission ou nettoyage diverge.

## Rollback

### Rollback applicatif

- désactiver le déploiement hébergé ou revenir au dernier déploiement stable ;
- conserver SQLite comme backend local par défaut ;
- ne supprimer aucun utilisateur Auth pendant le rollback applicatif ;
- ne modifier ni l'enum ni les quatre colonnes additives déjà alignées.

### Rollback de recette

- arrêter toute nouvelle mutation ;
- exécuter uniquement le nettoyeur borné par le préfixe de campagne ;
- retirer la liaison Auth temporaire exacte ;
- vérifier compteurs, FK et checksums ;
- si le nettoyage applicatif échoue, ne pas improviser de suppression globale : isoler les identifiants synthétiques et demander une intervention humaine contrôlée.

### Bascule du backend principal

Ne modifier le backend principal qu'après succès complet et documenté de 10F-G2 depuis l'hébergement. La bascule doit être une phase distincte, réversible, avec fenêtre d'observation et retour immédiat vers SQLite ou le déploiement précédent en cas d'anomalie.

## Conclusion

Le plan d'hébergement et de recette est prêt, mais le checkpoint local n'a pas été créé à cause du test en échec. Production reste non validée fonctionnellement, le backend par défaut reste SQLite, et aucun déploiement, push ou tag n'a été effectué.

## Mise à jour Phase 10F-H1 — test distant différé

Le seul test en échec de la tentative H a été qualifié précisément :

- fichier exact : `scripts/test-prisma-schema-guard-transaction.mjs` ;
- commande de relance : `node scripts/test-prisma-schema-guard-transaction.mjs` ;
- dépendance réelle : PostgreSQL Recipe, schéma `immos_recipe_phase8`, via `SUPABASE_DIRECT_URL` et le Session pooler 5432 avec `sslmode=require` ;
- point d'échec observé : acquisition de la connexion Prisma, avant l'entrée dans le callback transactionnel (`acquisitionMs`, `guardMs`, `selectOneMs` et `transactionMs` sont restés nuls) ;
- cause : indisponibilité réseau du port 5432 ;
- aucune transaction métier ou écriture n'a été engagée ;
- aucune assertion fonctionnelle locale n'a régressé.

La logique du test n'a pas été supprimée, désactivée, remplacée par un mock ou assouplie. Elle n'a pas été modifiée depuis sa dernière validation réelle documentée pendant les phases de garde PostgreSQL Recipe.

Environnement cible de relance : Vercel ou l'environnement d'hébergement retenu, avec accès réseau stable au Session pooler Recipe 5432. Ce test doit être exécuté séparément avant la recette distante et son résultat réel doit être conservé.

**TEST D’INTÉGRATION DISTANT DIFFÉRÉ, NON SUPPRIMÉ.**

Validations locales H1 :

- **207/207 tests locaux réussis** ;
- build SQLite réussi ;
- compilation TypeScript intégrée au build réussie ;
- 19 pages générées ;
- avertissement NFT/Turbopack Prisma déjà connu, non bloquant ;
- test distant 5432 non relancé depuis le réseau actuel.
