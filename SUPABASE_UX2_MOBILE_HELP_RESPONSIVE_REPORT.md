# Phase UX-2 — Aide « Comprendre l’écran » responsive mobile

## Périmètre

La correction est limitée au composant partagé `HelpPanel`, à ses styles responsive et à un test ciblé. Aucune page métier, règle métier, base, migration ou configuration distante n’a été modifiée.

## Fichiers UX-2

- `app/components/help-panel.js`
- `app/globals.css`
- `scripts/test-help-panel-responsive.mjs`
- `SUPABASE_UX2_MOBILE_HELP_RESPONSIVE_REPORT.md`

Le fichier `app/globals.css` contenait déjà des modifications UX-1 non liées ; elles ont été conservées intactes.

## Comportement desktop

- Le déclencheur flottant existant reste positionné en bas à droite.
- Le libellé complet reste « Comprendre l’écran ».
- Le design général, les contenus d’aide et le fonctionnement natif du panneau ne changent pas.

## Comportement mobile

- Au breakpoint `max-width: 760px`, le libellé devient « ? Aide ».
- Le bouton conserve une cible tactile minimale de 44 px et une largeur adaptée à son contenu.
- Le déclencheur reste à droite, au-dessus de la zone basse déjà réservée par l’interface, sans prendre toute la largeur.
- Le panneau est limité à la largeur disponible (`100vw - 24px`) et à `60vh` au maximum, avec défilement vertical interne.
- Le libellé accessible demeure « Comprendre l’écran » ; le texte mobile décoratif est masqué aux technologies d’assistance.
- Aucun JavaScript dépendant de la largeur de fenêtre n’a été ajouté.

## Validation

- Tests ciblés UX-2 : **3/3 réussis**.
- Largeur 375 px : media query mobile active, aucun débordement horizontal détecté sur la page locale anonyme.
- Largeur 1280 px : media query mobile inactive, aucun débordement horizontal détecté.
- L’ouverture visuelle du panneau privé n’a pas pu être vérifiée dans le navigateur sans session locale authentifiée. Le composant partagé conserve son élément natif `<details>/<summary>` ; l’ouverture, la fermeture, les libellés et les contraintes de scroll sont couverts par les contrôles ciblés de structure/CSS.
- Build SQLite : **réussi**.
- TypeScript intégré au build : **réussi**.
- `git diff --check` : **réussi**.
- Avertissement Turbopack NFT historique : présent, non bloquant et hors périmètre UX-2.

## Protections

- Aucun contact Recipe ou Production.
- Aucun changement Prisma, migration, Auth, Storage ou Vercel.
- Aucun staging, commit, push, tag ou déploiement.

## Conclusion

**PHASE UX-2 VALIDÉE LOCALEMENT — AIDE MOBILE COMPACTE ET NON INTRUSIVE**
