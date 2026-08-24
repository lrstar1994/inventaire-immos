# PHASE ENTRY-WIZARD-G — Audit final A→F

## 1. Statut global

Audit final réussi sans correction de code ni nouvelle fonctionnalité. Le code réel confirme la chaîne unique `AssetEntry DRAFT → validation atomique I/Q/QI → ENTRY_SLIP DRAFT → confirmation`.

## 2. Architecture réellement observée

- `createAssetEntryDraft` crée une seule `AssetEntry` en `DRAFT`, sans patrimoine.
- `updateAssetEntryDraft` modifie la même entrée et refuse toute entrée déjà `VALIDATED`.
- Les routes `/api/asset-entries/drafts`, `/api/asset-entries/[id]` et `/api/asset-entries/[id]/validate` séparent création, reprise/mise à jour et validation finale.
- `/parc/nouvelle-entree` ne crée rien à l’ouverture ; la confirmation explicite du modèle appelle la création du brouillon.
- `/parc/entries/[id]` conserve l’id et le numéro pendant toutes les étapes.
- `validateAssetEntryDraft` réclame atomiquement le statut `DRAFT`, branche I/Q/QI, crée le patrimoine et appelle `ensureEntryDraftDocument` dans la même transaction.
- `ensureEntryDraftDocument` recherche le bon existant, puis crée au besoin un `AssetDocument` `ENTRY_SLIP` en `DRAFT`, lié par `AssetDocumentEntry`.
- La validation documentaire existante ne crée ni unité, ni stock, ni mouvement ; elle ne rejoue pas le moteur patrimonial.
- La confirmation utilise les unités ou la position réellement retournées et le vrai document associé.

## 3. Invariants vérifiés

Les 20 invariants demandés sont vérifiés : aucun brouillon à la simple ouverture/recherche, création explicite unique, zéro patrimoine avant validation, id et numéro stables, refresh/reprise sans duplication, retrait des validées de la liste, appel unique au moteur B, double validation refusée, rollback complet, branches I/Q/QI distinctes, un seul bon `ENTRY_SLIP DRAFT`, absence de validation documentaire automatique et absence de double effet patrimonial.

## 4. Parcours I

- Avant validation : une entrée `DRAFT`, zéro `AssetUnit`, zéro position et zéro bon.
- Après validation : entrée `VALIDATED`, nombre exact d’unités, codes et rattachements conservés, un bon brouillon unique avec une ligne par unité.
- Confirmation : résultat individuel réel et lien vers la fiche lorsqu’une unité unique existe.

## 5. Parcours Q

- Avant validation : aucun stock.
- Après validation : position unique au bon lot/emplacement avec quantité exacte, zéro `AssetUnit`, entrée `VALIDATED`, un bon brouillon avec une seule ligne quantitative.
- Aucun second incrément après retry.

## 6. Parcours QI

- Avant validation : aucun patrimoine.
- Après validation : position quantitative initiale exacte, zéro `AssetUnit` automatique, entrée `VALIDATED`, bon brouillon quantitatif unique.
- L’individualisation ultérieure reste hors de la validation et inchangée.

## 7. Interruption, reprise et brouillons fantômes

- Mise à jour, finances, fichiers, sortie et reprise utilisent le même `entry_id` et le même `entryNumber`.
- Les lectures et refresh n’appellent aucune création.
- `/parc`, Entrées en cours, le sélecteur, la recherche et les filtres ne créent aucun brouillon.
- Une entrée validée est exclue des brouillons et n’est plus modifiable par PATCH.

## 8. Double validation, rollback et document

- La réclamation `updateMany(where: { id, entryStatus: "DRAFT" })` autorise une seule validation.
- Le second appel retourne `ENTRY_ALREADY_VALIDATED` sans unité, stock ou document supplémentaire.
- L’id documentaire déterministe et la recherche par relation empêchent plusieurs bons automatiques pour la même entrée.
- Un appel répété de l’ensure retourne le même document.
- Un échec documentaire injecté après préparation patrimoniale restaure le statut `DRAFT` et laisse zéro unité, position et document.
- Le bon est toujours `ENTRY_SLIP` + `DRAFT`; aucune validation automatique n’est présente.

## 9. Photos, justificatifs et finances

- Les fichiers sont isolés par `assetEntryId`, conservés au refresh et à la validation, sans copie ni changement patrimonial.
- Les catégories photo/document et la photo principale facultative restent inchangées.
- Les champs financiers réellement existants sont sauvegardés dans la même entrée et restent facultatifs selon les règles B/D.
- La progression est calculée depuis les données existantes ; aucun état de workflow n’est persisté.

## 10. Vérification, navigation et confirmations

- Vérification reprend identification, affectation, comptages fichiers et finances sauvegardées.
- Seul le bouton final appelle l’API de validation.
- Confirmation I affiche les unités réelles ; Q/QI affichent la position et la quantité réelles.
- Le vrai numéro du bon et son statut Brouillon sont affichés.
- « Voir le bon d’entrée » ouvre `/documents?documentId=...`, qui présélectionne le document existant.
- Les routes `/parc`, `/parc/[id]`, Entrées en cours, Choisir article, wizard et `/documents` sont présentes dans le build. Les accès privés testés localement répondent par une redirection contrôlée vers `/connexion`, sans 404 ni création réparatrice.

## 11. Régressions /parc et /documents

- Recherche, filtres, biens individuels, stocks quantitatifs et ensembles installés restent accessibles dans les sections existantes.
- `/documents` charge les brouillons et documents historiques ; la sélection ciblée n’altère pas les autres documents.
- La validation d’un document ne produit aucun effet patrimonial.

## 12. Responsive et performance

- Les contrôles source couvrent les cartes mobiles, actions du parc, sélecteur, wizard et confirmation sans tableau imposé au wizard.
- Le contrôle navigateur local non authentifié confirme le comportement sécurisé de redirection ; aucun identifiant local n’a été utilisé et aucune mutation Auth n’a été tentée.
- Entrées en cours utilise une sélection légère ; le sélecteur charge les colonnes utiles ; chaque étape charge uniquement l’entrée courante, ses référentiels légers et ses fichiers à la demande.
- Aucune photo originale globale, mouvement complet ou relation patrimoniale globale n’est chargée par le wizard.

## 13. Bugs et corrections

- Bug produit reproduit : aucun.
- Correction G : aucune.
- Bloquant structurel : aucun.
- Aucune migration, modification Prisma ou refonte n’a été nécessaire.

## 14. Tests et contrôles techniques

- Suites B/C/D/F : 43/43 réussies.
- Parcours réels isolés E/F : 6/6 réussis.
- Total : 49/49 réussis, 0 échec.
- Les tests réels copient `prisma/dev.db` dans un répertoire temporaire système, puis suppriment cette copie.
- TypeScript : réussi pendant le build Next.js (`Finished TypeScript`).
- Build SQLite : réussi, 24 pages générées ; avertissement NFT historique non bloquant.
- `git diff --check` : réussi ; seuls les avertissements CRLF Windows préexistants sont affichés.

## 15. SQLite historique

- Chemin : `prisma/dev.db`.
- SHA-256 avant : `E45B2AF6733CB6D1A2194071DD6067C567014A938252D49643978134957ABD50`.
- SHA-256 après : `E45B2AF6733CB6D1A2194071DD6067C567014A938252D49643978134957ABD50`.
- `PRAGMA integrity_check` : `ok` avant/après.
- `PRAGMA foreign_key_check` : 0 anomalie avant/après.
- Volumes avant/après : catégories 3, références 5, entrées 10, unités 12, positions quantitatives 0, fichiers 0, documents 14, liens documents/entrées 19, lignes documentaires 26, ensembles 0.

## 16. Accès distant et risques résiduels

- Aucun accès Supabase, Production ou Recipe.
- Aucun changement Storage/Auth, staging, commit, push, tag ou déploiement.
- Risque résiduel mineur : la numérotation documentaire historique repose sur le maximum courant ; la contrainte unique empêche un doublon mais une collision inter-entrées concurrente demanderait le retry de la transaction perdante.
- Le contrôle visuel authentifié complet reste à réaliser manuellement dans une session locale connectée ; les routes, contrats, rendu de build et comportements métier sont couverts automatiquement.

## 17. Tableau final

| Domaine | I | Q | QI | Statut |
|---------|---|---|----|--------|
| DRAFT unique | Oui | Oui | Oui | PASS |
| Aucun effet avant validation | Oui | Oui | Oui | PASS |
| Sauvegarde/reprise | Oui | Oui | Oui | PASS |
| Photos/documents | Oui | Oui | Oui | PASS |
| Finances | Oui | Oui | Oui | PASS |
| Vérification | Oui | Oui | Oui | PASS |
| Validation atomique | Oui | Oui | Oui | PASS |
| Double validation | Protégée | Protégée | Protégée | PASS |
| Résultat patrimonial | Unités exactes | Stock exact | Stock initial exact | PASS |
| ENTRY_SLIP automatique | Oui | Oui | Oui | PASS |
| ENTRY_SLIP DRAFT | Oui | Oui | Oui | PASS |
| Aucun doublon document | Oui | Oui | Oui | PASS |
| Aucun double effet patrimonial | Oui | Oui | Oui | PASS |
| Confirmation finale | Conforme | Conforme | Conforme | PASS |

## Décision

**ENTRY-WIZARD READY FOR FREEZE**

**PHASE ENTRY-WIZARD-G VALIDÉE LOCALEMENT — AUDIT FINAL A→F RÉUSSI, PARCOURS I/Q/QI ET ENTRY_SLIP VALIDÉS DE BOUT EN BOUT, ENTRY-WIZARD READY FOR FREEZE**
