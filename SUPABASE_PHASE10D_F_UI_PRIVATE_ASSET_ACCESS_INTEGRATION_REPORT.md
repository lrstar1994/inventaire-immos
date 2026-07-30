# Phase 10D-F — Intégration UI sécurisée des fichiers LOCAL et SUPABASE

## Conclusion

**Phase 10D-F réussie avec build omis de façon justifiée**

L’accès aux fichiers est désormais résolu avant la frontière client. Les
composants reçoivent un DTO sérialisable contenant `accessUrl`, jamais le
bucket, la clé Storage ou le `filePath` brut. Les 75 tests Storage réussissent,
les états protégés sont conformes et aucune validation réelle supplémentaire
n’a créé d’objet ou de donnée.

## État initial

- HEAD : `c17bef23e7d1b718546ad30bbf872c0eb36da9b9`
- message : `feat: resolve private asset access with signed urls`
- aucun fichier suivi modifié au prévol ;
- seuls les rapports historiques Phase 10C/10D déjà connus étaient non suivis.

## Audit des usages de `filePath`

Les usages d’accès AssetFile identifiés avant modification étaient :

- `app/parc/asset-park.js`
  - miniature de la liste du parc ;
  - aperçu de la fiche sélectionnée ;
- `app/parc/[id]/asset-unit-detail.js`
  - photo principale du bandeau ;
  - photo principale de la section fichiers ;
  - galerie d’images ;
  - lien d’ouverture des pièces jointes ;
- `app/parc/page.js`
  - sérialisation initiale des unités et de leurs fichiers ;
- routes de lecture :
  - `GET /api/asset-units`
  - `GET /api/asset-units/:id`
  - `GET /api/asset-units/:id/files`
  - `GET /api/asset-files`
  - `GET /api/asset-files/:id`

Les autres occurrences de `filePath` relèvent du stockage, de la persistance
ou des tests et ne sont pas des usages UI.

## Architecture serveur → DTO → client

Le nouveau module server-only
`lib/storage/asset-file-access-dto.js` appelle le résolveur existant
`resolveAssetFileAccess()` puis produit un DTO public.

Flux retenu :

1. lecture Prisma côté serveur ;
2. résolution LOCAL ou SUPABASE par le résolveur 10D-E ;
3. projection en DTO ;
4. sérialisation par la page ou la route ;
5. rendu par les composants clients.

Le DTO contient les champs métier utiles, puis :

- `provider`
- `accessUrl`
- `accessExpiresAt`
- `accessStatus`
- `accessMessage`

Il exclut explicitement :

- `storageProvider`
- `storageBucket`
- `storageKey`
- `filePath`
- client Supabase, configuration ou secret.

## Fichiers créés

- `lib/storage/asset-file-access-dto.js`
- `app/parc/asset-file-access-view.js`
- `SUPABASE_PHASE10D_F_UI_PRIVATE_ASSET_ACCESS_INTEGRATION_REPORT.md`

## Fichiers modifiés

- `app/parc/page.js`
- `app/parc/asset-park.js`
- `app/parc/[id]/asset-unit-detail.js`
- `app/api/asset-units/route.js`
- `app/api/asset-units/[id]/route.js`
- `app/api/asset-units/[id]/files/route.js`
- `app/api/asset-files/route.js`
- `app/api/asset-files/[id]/route.js`
- `scripts/test-file-storage-abstraction.mjs`

Aucun schéma Prisma, migration, package, fichier d’environnement, base,
policy, fichier historique ou règle d’upload/suppression n’a été modifié.

## Comportement LOCAL

- les anciennes lignes sans métadonnées restent résolues par le helper 10D-B ;
- les nouvelles lignes LOCAL utilisent leur `filePath` local validé ;
- `accessUrl` conserve exactement le chemin local ;
- `accessExpiresAt = null` ;
- aucun client Supabase n’est initialisé.

## Comportement SUPABASE

- bucket et clé sont lus uniquement côté serveur ;
- le résolveur server-only 10D-E génère l’URL signée ;
- le DTO ne transporte que l’URL temporaire et son expiration ;
- `storageKey` n’est jamais utilisé comme `src` ou `href` ;
- aucune URL signée n’est persistée ou journalisée ;
- le TTL reste celui de 10D-E : 300 secondes par défaut, borné de 60 à
  3 600 secondes.

## Erreurs partielles

Une erreur de résolution d’un fichier est convertie en DTO contrôlé :

- `invalid` pour des métadonnées invalides ;
- `unavailable` pour une indisponibilité de résolution ;
- `available` pour un accès résolu.

Une erreur isolée ne bloque donc pas la liste complète. Aucun message SDK,
secret ou détail interne n’est transmis au navigateur.

## Affichage, ouverture et téléchargement

Le composant client `app/parc/asset-file-access-view.js` centralise :

- l’image via `accessUrl` ;
- un état d’échec contrôlé sur `onError` ;
- le message « Aperçu indisponible. Rechargez la page. » ;
- les liens via `accessUrl` ;
- `target="_blank"` avec `rel="noopener noreferrer"` ;
- le nom de téléchargement existant lorsque disponible.

Le design et les règles métier ne sont pas modifiés. Aucune prévisualisation
nouvelle n’est ajoutée.

## Expiration

La stratégie minimale retenue est le rechargement de page. Le prochain rendu
serveur génère une nouvelle URL. Aucun endpoint de renouvellement n’est ajouté,
car les écrans existants ne démontrent pas ce besoin.

## Autorisation et limite Auth

La phase conserve les contrôles existants sans inventer un nouveau système
d’autorisation. Les routes de lecture existantes ne disposent pas encore d’un
contrôle Supabase Auth fin : c’est une limite connue. Elles n’acceptent
toutefois jamais de bucket ou clé arbitraire du navigateur ; elles relisent les
métadonnées persistées et appellent le résolveur serveur.

Avant exposition publique, la phase suivante devra confirmer les règles
d’autorisation métier des routes de lecture.

## Tests

Commande :

`npm.cmd run test:storage`

Résultat :

- tests historiques : 70/70 ;
- nouveaux tests Phase 10D-F : 5/5 ;
- total : 75/75 ;
- échec : 0.

Les nouveaux tests couvrent :

- DTO LOCAL ancien sans exposition des métadonnées internes ;
- DTO SUPABASE avec URL temporaire en mémoire ;
- erreur partielle dans une liste ;
- projection sur toutes les frontières serveur utilisées ;
- absence de `filePath`, bucket, clé ou client privilégié dans les composants.

Les tests n’effectuent aucun appel réseau réel, aucune écriture Prisma et
aucune écriture dans `public/uploads/assets`.

## Validation réelle

La validation réelle n’a pas été relancée. La Phase 10D-E a déjà démontré
l’upload synthétique, la signature, HTTP 200, le MIME, la taille, le SHA-256 et
l’égalité des octets. La présente phase ne change ni le provider ni la
signature : elle teste la projection et le rendu avec des doubles contrôlés.

Une nouvelle exécution aurait créé temporairement un objet et une URL sans
apporter de preuve supplémentaire. Aucun nettoyage réel n’a donc été requis.

## Contrôles statiques et build

- `git diff --check` : conforme ;
- syntaxe Node vérifiée pour les modules sans JSX ;
- les quatre fichiers JSX ne peuvent pas être validés par `node --check` ;
- leurs imports et usages sont couverts par le test statique ciblé ;
- aucun script de typecheck ou lint dédié n’existe dans `package.json`.

Le build est omis :

- `build:postgresql` cible la production et est interdit ;
- le build SQLite ne valide pas le chemin SUPABASE privé ;
- les tests ciblés couvrent directement les changements.

## États protégés finaux

### SQLite

- SHA-256 :
  `8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec`
- aucune écriture.

### Production — `immos`

- `asset_units = 12`
- `asset_files = 0`
- aucune écriture ni modification de schéma.

### Recette — `immos_recipe_phase8`

- total métier = 253
- `asset_units = 13`
- `asset_files = 0`
- FK orphelines = 0
- aucune fixture temporaire.

### Storage

- bucket `asset-files` privé ;
- 0 objet ;
- aucune policy modifiée ;
- aucune URL persistée.

### JPEG

Les trois JPEG historiques sont inchangés :

- 2 405 379 octets —
  `4ea6fafc0e1dfec5b1763203715f20c00b2b84720c8ff9158a47a06c440fad4a`
- 2 107 645 octets —
  `ff1a9c1a9ccf30932426389687755d2065074eacaa56948451e03903dac3bd83`
- 1 501 619 octets —
  `d360445ca40c9e7c6afc77bc7d97a2c30c9f58b766cfb5de50db422bd5d393ec`

## Scan de secrets

Le diff ne contient aucune valeur réelle de service role, clé anon, URL
PostgreSQL, mot de passe, JWT, token, header Authorization, contenu `.env` ou
URL signée. Seuls des noms de variables ou des valeurs factices de test déjà
prévues sont présents.

## Risques résiduels

- absence actuelle de Supabase Auth et de contrôle fin sur les routes GET ;
- expiration possible après une page laissée ouverte plus de cinq minutes ;
- les réponses d’écriture existantes ne sont pas utilisées pour le rendu et
  n’ont pas été refactorées dans cette phase ;
- aucune suite de tests React dédiée n’est installée ; le rendu est couvert par
  les primitives client et des contrôles de source ciblés.

## Prérequis Phase 10D-G

- revue humaine du présent diff ;
- confirmer les règles d’autorisation des lectures avant exposition publique ;
- tester les écrans dans un environnement recette contrôlé quand une fixture UI
  autorisée sera disponible ;
- conserver le bucket privé, le TTL et la résolution server-only ;
- ne jamais persister une URL signée ;
- maintenir production, SQLite et fichiers historiques hors écriture.

## Confirmations

- LOCAL reste fonctionnel ;
- SUPABASE est résolu côté serveur ;
- aucun appel privilégié n’est exécuté côté client ;
- aucune URL signée n’est persistée ou journalisée ;
- aucune base n’a été modifiée ;
- aucun objet Storage n’a été créé ;
- aucune policy ni Auth n’a été modifiée ;
- aucun secret n’a été exposé ;
- aucun commit, push ou tag n’a été créé ;
- Phase 10D-G non commencée.
