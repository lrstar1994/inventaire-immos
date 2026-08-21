# Phase UX-1 — Confirmations utilisateur homogènes

## Statut

**PHASE UX-1 VALIDÉE LOCALEMENT — CONFIRMATIONS UTILISATEUR HOMOGÈNES ET VISIBLES**

## Composant commun

Ajout de `ActionFeedback`, un composant persistant réutilisable acceptant `success`, `error` et `info`. Il affiche un titre, un message, l'élément concerné, son code ou numéro, son statut, des détails contextuels, un CTA facultatif et une fermeture manuelle. Aucun toast temporaire ni fermeture automatique n'est utilisé.

## Écrans et actions couverts

- Référentiels : création, modification et désactivation des fournisseurs, emplacements, catégories et références/modèles.
- Parc : entrées I/Q/QI, transfert quantitatif, individualisation, ensembles installés, composants, désactivation et mise à jour d'un bien.
- Parc détail : ajout de fichier, définition de la photo principale et suppression logique.
- Documents : création du brouillon, validation et annulation.
- Mouvements : création du brouillon, validation et annulation.

Les confirmations sont placées en haut du contenu concerné. Les erreurs serveur sont conservées et rendues immédiatement visibles. L'ouverture de l'aide n'est liée à aucun feedback métier.

## Rafraîchissement

Les fonctions existantes `loadAll` et `loadData` sont réutilisées après chaque mutation. Les listes, détails, stocks et statuts se mettent à jour sans rechargement manuel du navigateur. Les formulaires restent conservés lors des erreurs, sauf les réinitialisations déjà prévues après succès.

## Validation

- Tests UX-1 ciblés : **7/7 réussis**.
- Build SQLite : réussi.
- Contrôle TypeScript intégré au build Next.js : réussi.
- Avertissement NFT Turbopack historique : inchangé et non bloquant.
- `git diff --check` : conforme.
- SHA-256 SQLite inchangé : `8FDE5146A660D180B895E965A1AC21489D888213B08BDB4F87FF8929151D32B1`.
- Contrôle navigateur intégré tenté sur les routes ciblées, mais la vue locale n'a pas pu s'attacher ; aucun contournement navigateur n'a été utilisé. La validation repose donc sur les tests composants ciblés et le build complet des routes.

## Garanties

Aucune règle métier, aucun schéma Prisma, migration, donnée, Auth, Storage, Supabase ou Vercel n'a été modifié. Aucun accès Recipe ou Production. Aucun staging, commit, push, tag ou déploiement.
