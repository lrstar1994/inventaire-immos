# Phase 8 ter — Diagnostic de connectivité

Date : 2026-07-29

## Résultat

La reprise est bloquée avant toute connexion PostgreSQL et avant toute transaction.

- DNS : réussi
- IPv4 : obtenues
- TCP 5432 : échec
- Import : non exécuté
- Relance automatique : aucune
- Storage : non contacté

## Configuration masquée

- Protocole : `postgresql`
- Hôte : `aws-1-eu-central-1.pooler.supabase.com`
- Endpoint pooler Supabase reconnu : oui
- Port : `5432`
- Base : `postgres`
- Schéma enregistré : `immos`
- Schéma qui aurait été injecté pour la recette : `immos_recipe_phase8`
- SSL : `require`
- Utilisateur masqué : `po*************************ys`
- Format Supavisor avec référence de projet : oui
- Guillemets extérieurs équilibrés : oui
- Espaces ou retours à la ligne intégrés : aucun
- Mot de passe présent dans l'URL : oui
- URL analysable : oui

Le mot de passe et la chaîne de connexion complète n'ont pas été affichés ou journalisés. Le contrôle syntaxique confirme que l'URL peut être analysée ; aucun mot de passe décodé n'a été affiché.

## DNS et réseau

Résolution IPv4 :

- `3.65.151.229`
- `3.71.225.44`
- `18.196.8.182`

Test TCP :

- Hôte : endpoint pooler Supabase
- Port : `5432`
- Résultat : non joignable
- Adresse essayée : `3.71.225.44`
- Délai avant échec : environ `105 443 ms`
- Interface : Wi-Fi

Disponibilité générale :

- Route IPv4 par défaut : présente
- Port HTTPS 443 du même hôte : joignable
- Latence HTTPS approximative : `374 ms`
- Proxy Windows : désactivé
- Adaptateur VPN actif détecté : `Radmin VPN`

Sécurité locale :

- Pare-feu Windows actif sur les profils Domain, Private et Public
- Action sortante par défaut non bloquante
- Microsoft Defender actif
- Protection temps réel active

Ces observations ne permettent pas d'attribuer avec certitude le blocage au VPN, au pare-feu ou à l'antivirus. Elles montrent que le réseau général et le même hôte sur 443 fonctionnent, tandis que le port 5432 est filtré ou indisponible sur le chemin réseau actuel.

## Étapes volontairement non exécutées

Le prérequis TCP ayant échoué :

- aucun `SELECT 1` ;
- aucune lecture PostgreSQL minimale ;
- aucun des trois tests de stabilité ;
- aucun contrôle SQL supplémentaire du schéma temporaire ;
- aucune transaction ;
- aucun `createMany` ;
- aucun import ;
- aucun contrôle Storage.

Le dernier état validé reste :

- `immos_recipe_phase8` : baseline complète, 15 tables métier, 0 ligne ;
- `asset_files` temporaire : vide ;
- `immos` : 222 lignes ;
- SQLite : inchangée ;
- Storage : vide au dernier contrôle validé.

## Stratégie d'import prête mais non exécutée

- 15 lots `createMany`
- 5 mises à jour d'auto-références
- environ 20 requêtes
- `maxWait=30 000 ms`
- `timeout=300 000 ms`
- connexion obligatoire session IPv4 sur le port 5432

## Fichiers

Créé pendant la phase 8 ter :

- `SUPABASE_PHASE8_TER_CONNECTIVITY_REPORT.md`

Aucun script ou fichier applicatif n'a été modifié pendant ce diagnostic. Les changements non commités des phases 8 et 8 bis restent inchangés. Aucun commit Phase 8 ter n'a été créé.
