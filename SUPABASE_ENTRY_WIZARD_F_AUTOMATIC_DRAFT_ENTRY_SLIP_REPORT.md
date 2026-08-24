# PHASE ENTRY-WIZARD-F — Bon d’entrée brouillon automatique

## 1. Architecture Documents observée

- Type réel : `ENTRY_SLIP`.
- Statut brouillon réel : `DRAFT`.
- Modèles réutilisés : `AssetDocument`, `AssetDocumentEntry` et `AssetDocumentLine`.
- Relation réelle : `AssetDocumentEntry.assetEntryId` rattache le document à l’`AssetEntry`.
- Numérotation réutilisée : `generateDocumentNumber`, au format existant `BE-AAAA-NNNNNN`.
- La validation documentaire existante change uniquement le statut du document et son audit. Elle ne crée ni `AssetUnit`, ni stock quantitatif, ni mouvement : aucun double effet patrimonial n’a été identifié.

## 2. Génération et transaction

`ensureEntryDraftDocument(tx, entryId, actor)` a été ajouté au service documentaire. Il exige une entrée `VALIDATED`, recherche d’abord un `ENTRY_SLIP` déjà lié, puis le retourne ou crée exactement un brouillon.

La fonction est appelée dans la transaction existante de `validateAssetEntryDraft`, après la création patrimoniale I/Q/QI et avant le commit. Ainsi :

- succès : patrimoine, statut `VALIDATED`, bon brouillon et audits sont commités ensemble ;
- échec documentaire : rollback complet, entrée conservée en `DRAFT`, aucun patrimoine partiel et aucun document résiduel.

Le bon n’est créé ni à la création, ni à la sauvegarde, ni pendant les étapes du wizard.

## 3. Contenu et modes

- I : une ligne par `AssetUnit`, avec le code individuel, l’article, l’emplacement et le lien vers l’entrée.
- Q/QI : une ligne quantitative unique portant la quantité acquise, l’article, l’emplacement et le lien vers l’entrée.
- Les champs facultatifs absents ne bloquent pas la création. Les notes de l’entrée sont reprises sans dupliquer les fichiers.
- Le document reste `DRAFT` et sa validation demeure une opération séparée dans `/documents`.

## 4. Idempotence et concurrence

- Recherche préalable de tout `ENTRY_SLIP` déjà rattaché à l’entrée, quel que soit son statut.
- Identifiant automatique déterministe `auto-entry-slip-{entryId}` : deux créations concurrentes ne peuvent pas produire deux documents pour la même entrée.
- La réclamation atomique du statut `DRAFT` par le moteur B empêche deux validations patrimoniales concurrentes.
- Une seconde validation est refusée par `ENTRY_ALREADY_VALIDATED` ; un appel répété de `ensureEntryDraftDocument` retourne le document existant.
- La numérotation générale reste celle du module Documents. Sa contrainte unique existante provoque un rollback plutôt qu’un numéro dupliqué en cas de collision inter-entrées.

## 5. Confirmation et Documents

La confirmation finale conserve le résultat patrimonial propre au mode et ajoute :

- numéro réel du bon ;
- statut « Brouillon » ;
- rappel que la validation documentaire est séparée ;
- bouton « Voir le bon d’entrée ».

Le bouton ouvre `/documents?documentId=...`; la page Documents sélectionne immédiatement le document demandé. Les autres actions du wizard sont conservées.

## 6. Fichiers modifiés

- `lib/document-service.js`
- `lib/asset-service.js`
- `app/parc/entries/[id]/page.js`
- `app/parc/entries/[id]/entry-wizard.js`
- `app/documents/page.js`
- `app/documents/document-manager.js`
- `scripts/test-entry-wizard-e2e.mjs`
- `scripts/test-entry-wizard-automatic-slip.mjs`
- ce rapport

Aucun schéma Prisma, migration, Storage, Auth, mouvement ou règle I/Q/QI n’a été modifié.

## 7. Tests et non-régression

- Tests F structurels : 5/5 réussis.
- Parcours réels isolés I/Q/QI et rollback documentaire : 6/6 réussis.
- Non-régression B/C/D : 38/38 réussis.
- Total exécuté : 49 tests, 49 réussis, 0 échec.
- I : patrimoine individuel inchangé, bon unique en brouillon.
- Q : stock exact, zéro `AssetUnit`, bon quantitatif unique.
- QI : stock initial exact, zéro `AssetUnit` initial, bon quantitatif unique.
- Document préexistant/appel répété : document réutilisé, aucun doublon.
- Échec documentaire tardif : rollback du statut, des unités/positions et du document confirmé.
- Build SQLite : réussi ; compilation et contrôle TypeScript intégrés réussis.
- TypeScript autonome : binaire local absent ; aucune installation effectuée. La tentative `npx tsc` a été arrêtée par l’absence d’accès registre, sans modification locale.
- `git diff --check` : réussi (uniquement avertissements de fins de ligne Windows).

## 8. SQLite historique

- Chemin : `prisma/dev.db`.
- SHA-256 avant/après : `E45B2AF6733CB6D1A2194071DD6067C567014A938252D49643978134957ABD50`.
- `integrity_check` : `ok`.
- `foreign_key_check` : 0 anomalie.
- Volumes avant/après : catégories 3, références 5, entrées 10, unités 12, positions quantitatives 0, fichiers 0, documents 14, liens documents/entrées 19.
- Les tests utilisent une copie temporaire hors du dépôt, ensuite supprimée.

## 9. Risques résiduels

- Aucun blocage structurel constaté.
- La numérotation par lecture du maximum est historique ; la contrainte unique empêche les doublons mais une collision entre deux entrées simultanées impose un retry de la transaction perdante.
- Aucun accès Production, Recipe ou Supabase n’a été réalisé. Aucun staging, commit, push, tag ou déploiement.

## 10. Tableau final

| Contrôle | I | Q | QI | Statut |
|----------|---|---|----|--------|
| Validation patrimoniale inchangée | Oui | Oui | Oui | PASS |
| Bon généré automatiquement | Oui | Oui | Oui | PASS |
| Bon en brouillon | Oui | Oui | Oui | PASS |
| Bon lié à l’entrée | Oui | Oui | Oui | PASS |
| Aucun doublon | Oui | Oui | Oui | PASS |
| Aucun double effet patrimonial | Oui | Oui | Oui | PASS |
| Visible dans Documents | Oui | Oui | Oui | PASS |
| Confirmation correcte | Oui | Oui | Oui | PASS |
| Voir le bon | Oui | Oui | Oui | PASS |

## Décision

**READY FOR FINAL ENTRY-WIZARD AUDIT**

**PHASE ENTRY-WIZARD-F VALIDÉE LOCALEMENT — BON D’ENTRÉE BROUILLON AUTOMATIQUE I/Q/QI OPÉRATIONNEL, IDEMPOTENCE DOCUMENTAIRE ET ABSENCE DE DOUBLE EFFET PATRIMONIAL CONFIRMÉES**
