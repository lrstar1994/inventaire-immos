# Phase 10E-C1 — Validation réelle du cycle Auth

## Conclusion

**Phase 10E-C1 interrompue par un contrôle de sécurité**

La validation réelle a été arrêtée avant le lancement de l’application et avant
toute tentative de connexion. Deux préconditions indispensables ne sont pas
réunies :

1. aucun identifiant d’un compte Auth de recette contrôlé n’est disponible dans
   les variables temporaires prévues ;
2. l’inspection administrative en lecture seule indique que l’inscription
   publique est actuellement activée, contrairement à la décision humaine
   validée pour les fondations Auth.

Aucun compte n’a été créé, modifié ou supprimé. Aucun réglage Supabase n’a été
modifié.

## HEAD initial et final

- HEAD initial :
  `b1bd83da955f55cbee8a773684eea1dc0933587c`
- commit initial :
  `b1bd83d feat: add deferred asset file purge service`
- HEAD final :
  `b1bd83da955f55cbee8a773684eea1dc0933587c`
- aucun commit créé.

## État Git initial

Le répertoire de travail contient les changements non commités attendus des
Phases 10E-B et 10E-C :

- fondations Auth dans `lib/supabase/` ;
- page et actions de session dans `app/connexion/` ;
- rafraîchissement limité dans `proxy.js` ;
- styles de connexion ;
- dépendances Supabase Auth déjà ajoutées en 10E-B ;
- tests Auth 10E-B et 10E-C ;
- rapports 10E-A, 10E-B et 10E-C.

Les rapports post-commit historiques déjà connus restent non suivis. Aucun
fichier d’identifiants de recette n’apparaît dans Git.

## Contexte 10E-B et 10E-C

La Phase 10E-B fournit des clients distincts :

- navigateur avec clé publique ;
- serveur avec session utilisateur et cookies ;
- client privilégié service-role, isolé par `server-only`.

Elle fournit également `getCurrentUser()`, `getCurrentSession()` et
`refreshSession()`.

La Phase 10E-C fournit :

- la page publique `/connexion` ;
- les Server Actions de connexion et de déconnexion ;
- une validation stricte des destinations internes ;
- des erreurs publiques assainies ;
- un rafraîchissement de session limité à `/connexion` ;
- aucune protection globale, aucun rôle actif et aucune mutation métier
  autorisée par Auth.

## Compte Auth de recette

### Méthode de création

Le compte attendu devait être créé explicitement par un humain dans Supabase
Dashboard ou par une opération administrative ponctuelle approuvée. Codex n’a
créé aucun utilisateur et n’a utilisé aucune route d’inscription.

### Vérification non sensible

Une inspection administrative strictement en lecture seule a établi :

- 10 utilisateurs Auth existants ;
- 10 utilisateurs confirmés ;
- aucun utilisateur portant une métadonnée de rôle sensible détectée ;
- inscription publique actuellement activée.

Cette inspection ne permet pas d’identifier de manière sûre lequel serait le
compte dédié à la recette. Aucun email, identifiant Auth ou metadata complète
n’a été affiché ou consigné.

### Identifiants

Les variables temporaires `AUTH_RECIPE_TEST_EMAIL` et
`AUTH_RECIPE_TEST_PASSWORD` sont absentes du processus et des fichiers
d’environnement locaux inspectés. Les fichiers `.env` et `.env.local` sont
ignorés par Git.

Aucun email complet, mot de passe, token ou cookie n’est reproduit dans ce
rapport.

### État avant et après

- aucun compte dédié n’a pu être authentifié ;
- aucun compte n’a été créé automatiquement ;
- aucun compte n’a été invité ;
- aucun rôle n’a été attribué ;
- aucun compte n’a été supprimé ;
- état Auth laissé inchangé.

## Configuration testée

Sans afficher de valeur, les contrôles ont confirmé la présence de la
configuration Supabase nécessaire aux clients existants et la séparation entre :

- clé publique pour la session utilisateur ;
- service-role réservé aux inspections et services internes.

Le code de login/logout utilise exclusivement le client serveur avec session
utilisateur. Le client service-role n’est pas utilisé pour connecter ou
déconnecter un utilisateur. Le backend métier par défaut reste SQLite.

## Contrôle de sécurité bloquant

La décision validée exige une inscription publique désactivée. La configuration
réelle observée indique qu’elle est activée. La phase n’autorisant aucune
modification Auth ou création de compte, ce réglage n’a pas été corrigé.

Continuer avec un compte inconnu, créer un compte par l’inscription publique ou
modifier le réglage aurait violé le périmètre. Le scénario réel a donc été
arrêté avant démarrage.

## Lancement local et route

- commande prévue : commande locale habituelle du projet avec backend SQLite ;
- route prévue : `/connexion` ;
- port : non attribué ;
- démarrage : non exécuté à cause du contrôle de sécurité ;
- aucun serveur persistant laissé actif.

## Scénarios réels

Les scénarios suivants n’ont pas été exécutés :

- connexion valide ;
- création et inspection non sensible des cookies réels ;
- reconnaissance serveur après rechargement ;
- persistance et rafraîchissement réels de session ;
- mauvais mot de passe contre le compte contrôlé ;
- email inexistant contre le service réel ;
- redirections réelles après authentification ;
- déconnexion réelle ;
- seconde déconnexion ;
- vérification réelle de l’absence de cache utilisateur partagé.

Ils restent couverts par les tests mockés de 10E-B/10E-C, mais cette couverture
ne remplace pas la validation réelle demandée.

## Erreurs et protection contre l’énumération

L’inspection statique et les tests confirment :

- résultat public générique pour identifiants incorrects, utilisateur absent ou
  compte non confirmé ;
- erreur technique normalisée en `authentication_unavailable` ;
- aucune erreur Supabase brute renvoyée au composant ;
- aucune session complète ou token dans le résultat des Server Actions ;
- destinations externes, `//`, backslashes et protocoles arbitraires refusés.

Ces propriétés n’ont pas pu être revalidées contre Auth réel faute de
préconditions sûres.

## Cookies et session

L’architecture utilise l’adaptateur officiel de cookies côté serveur et ne crée
aucun stockage parallèle applicatif. L’inspection statique confirme :

- aucun token sérialisé dans les props ;
- aucun token rendu dans le HTML par le code ;
- aucun cookie journalisé ;
- aucun stockage manuel dans `localStorage` ;
- rafraîchissement limité au matcher `/connexion` ;
- aucune utilisation du service-role pour la session.

Les attributs et l’invalidation des cookies réels n’ont pas été observés, car
aucune session réelle n’a été ouverte.

## Tests automatisés

Avant 10E-C1 :

- 126 tests métier, Storage et purge ;
- 12 tests Auth de 10E-B ;
- 11 tests Auth de 10E-C ;
- total : 149.

Après contrôle :

- 75/75 tests métier, Storage et UI réussis ;
- 51/51 tests de purge réussis ;
- 12/12 tests Auth 10E-B réussis ;
- 11/11 tests Auth 10E-C réussis ;
- total final : **149/149**.

Aucun test 10E-C1 n’a été ajouté, car aucune anomalie applicative nouvelle n’a
été observée. Aucun test n’a appelé Auth réel ou écrit dans une donnée protégée.

## Contrôles statiques

Contrôles réellement exécutés :

- vérification syntaxique ciblée des fichiers JavaScript concernés ;
- inspection de la frontière client/serveur ;
- vérification des imports du service-role ;
- `git diff --check` ;
- suite complète de 149 tests.

Le projet ne possède pas de scripts `lint` ou `typecheck`; ils ne sont donc pas
déclarés exécutés.

## Build

Le build a été omis. La validation réelle a été interrompue avant le lancement
et un build ne démontrerait ni les cookies réels ni le cycle Auth. Les tests,
contrôles syntaxiques, inspections d’import et vérifications d’état ont servi de
contrôles compensatoires.

## npm audit

`npm audit --omit=dev` a été relancé en lecture seule :

- 3 avis de gravité élevée restent présents dans la chaîne
  Next/PostCSS/Sharp ;
- ils étaient déjà documentés avant 10E-C1 ;
- aucun `npm audit fix` ;
- aucun `npm audit fix --force` ;
- aucune mise à niveau automatique.

L’application n’est pas déclarée exempte de vulnérabilités.

## Scan de secrets

Le scan des fichiers suivis et non suivis liés à 10E-B, 10E-C et au présent
rapport ne révèle :

- aucun email complet du compte de validation ;
- aucun mot de passe réel ;
- aucun JWT, access token ou refresh token réel ;
- aucun cookie réel ;
- aucune service-role ou anon key réelle ;
- aucun header Authorization réel ;
- aucune URL signée ;
- aucune URL PostgreSQL ou chaîne de connexion ;
- aucun contenu de `.env`.

Les valeurs factices explicites des tests restent non réutilisables.

## États protégés finaux

### SQLite

- SHA-256 :
  `8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec`
- aucune écriture.

### Production — schéma `immos`

- `asset_units = 12`
- `asset_files = 0`
- aucune écriture.

### Recette — schéma `immos_recipe_phase8`

- total métier = 253
- `asset_units = 13`
- `asset_files = 0`
- FK orphelines = 0
- aucune écriture.

### Storage

- bucket `asset-files` privé ;
- 0 objet ;
- aucune écriture ;
- aucune policy modifiée.

### JPEG historiques

Les trois fichiers sont présents et leurs SHA-256 restent :

- `4ea6fafc0e1dfec5b1763203715f20c00b2b84720c8ff9158a47a06c440fad4a`
- `ff1a9c1a9ccf30932426389687755d2065074eacaa56948451e03903dac3bd83`
- `d360445ca40c9e7c6afc77bc7d97a2c30c9f58b766cfb5de50db422bd5d393ec`

## Anomalies et corrections

Anomalie bloquante :

- inscription publique activée dans la configuration Auth réelle.

Précondition manquante :

- aucun identifiant contrôlé de recette disponible.

Correction applicative :

- aucune ; le code et l’architecture n’ont pas été modifiés pendant 10E-C1.

## Décision humaine requise

Avant de reprendre la validation réelle :

1. désactiver manuellement l’inscription publique dans Supabase Dashboard ;
2. identifier ou créer manuellement un compte Auth dédié à la recette, confirmé,
   sans rôle et sans permission métier ;
3. transmettre ses identifiants par variables temporaires ignorées de Git ;
4. décider après validation s’il doit être conservé comme compte de test sans
   rôle ou supprimé manuellement depuis le Dashboard.

Codex n’a choisi ni exécuté la conservation ou la suppression d’un compte.

## Confirmations de périmètre

- aucun secret enregistré ;
- aucun utilisateur créé automatiquement ;
- aucune invitation applicative ;
- aucun email envoyé ;
- aucune inscription publique ajoutée ;
- aucun rôle attribué ;
- aucun super_admin créé ;
- aucune protection globale ajoutée ;
- aucune mutation métier autorisée par Auth ;
- aucune policy modifiée ;
- aucune donnée métier modifiée ;
- aucune écriture Storage ;
- aucune purge exposée ;
- aucun commit ;
- aucun push ;
- aucun tag ;
- Phase 10E-D non commencée.
