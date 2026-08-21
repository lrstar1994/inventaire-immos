# Phase UX-FILES-C — Parcours photos et pièces jointes après entrée

## Statut

**PHASE UX-FILES-C VALIDÉE LOCALEMENT — PHOTOS ET PIÈCES JOINTES DISPONIBLES IMMÉDIATEMENT APRÈS L’ENTRÉE**

## Parcours livré

- La confirmation persistante d’une entrée I, Q ou QI propose immédiatement **Ajouter des photos / pièces jointes** et **Créer une autre**.
- La zone ouverte conserve le contexte de l’entrée créée : numéro, référence et quantité.
- Les **Photos du matériel** et les **Documents justificatifs** sont présentés dans deux sections distinctes.
- Plusieurs photos ou justificatifs peuvent être sélectionnés en une fois. L’entrée reste ouverte après chaque opération et sa liste de fichiers est rechargée automatiquement, sans rechargement de page.
- Les dernières entrées proposent aussi une action **Photos / pièces jointes** pour rouvrir directement la même zone.

## Galerie et justificatifs

- Les photos utilisent une grille compacte de miniatures et un sélecteur mobile compatible appareil photo ou galerie (`accept="image/*"`).
- Une photo peut être définie comme principale ; le badge **Principale** est immédiatement actualisé.
- Les justificatifs PDF ou image sont affichés séparément et restent ouvrables via le mécanisme d’accès sécurisé existant.
- La suppression reste strictement logique. Une confirmation persistante accompagne upload, choix de la photo principale, suppression et erreur.
- En lecture seule, la consultation reste disponible mais les formulaires et actions de mutation sont absents.

## Fallback AssetUnit

Sur `/parc/[id]`, une unité I issue d’une entrée de quantité 1 utilise la photo principale `MATERIAL_PHOTO` de son entrée uniquement si elle ne possède aucune photo principale propre. Elle est libellée **Photo d’entrée**. Aucun fichier n’est copié ou recréé. Le fallback ne s’applique pas aux entrées I multi-unités ni aux modes Q/QI.

## Fichiers UX-C modifiés ou créés

- `app/components/action-feedback.js`
- `app/parc/asset-park.js`
- `app/parc/[id]/asset-unit-detail.js`
- `app/api/asset-units/[id]/route.js`
- `app/globals.css`
- `lib/storage/asset-file-access-dto.js`
- `scripts/test-entry-file-ui.mjs`

Les routes AssetEntry/files et le service créés en UX-FILES-B sont réutilisés sans nouvelle évolution Prisma ni migration UX-C.

## Validation locale

- Tests ciblés UX-FILES-C : **6 réussis, 0 échec**.
- Build SQLite : **réussi**.
- Validation TypeScript intégrée au build Next.js : **réussie**.
- `git diff --check` : **réussi** (seuls des avertissements de normalisation LF/CRLF sont signalés).
- Scan ciblé des changements : **aucun secret détecté**.
- SQLite SHA-256 : `1420BDCAAAB68247CEE3BFDD4793D9CDC4CEF55F18558224F4600EFBC425FCC7`.
- SQLite `integrity_check` : **ok**.
- SQLite `foreign_key_check` : **0 anomalie**.

La commande autonome `npx tsc --noEmit` n’est pas disponible comme dépendance locale et a tenté, sans succès, d’accéder au registre. Aucun paquet n’a été installé. Le contrôle TypeScript demandé a néanmoins été exécuté avec succès par `npm run build:sqlite`.

## Protections

- Aucun accès à Production ou Recipe.
- Aucun changement distant Storage ou Auth.
- Aucun changement Q/QI, EquipmentSet, Documents ou Mouvements.
- Aucun changement de schéma ni nouvelle migration dans UX-FILES-C.
- Aucun staging, commit, push, tag ou déploiement.
