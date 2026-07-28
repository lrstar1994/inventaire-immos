"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";

const helpByPath = {
  "/": {
    title: "Comprendre le tableau de bord",
    points: [
      "Choisissez le module selon l'action a effectuer.",
      "Les indicateurs affichent uniquement des valeurs calculees depuis les donnees existantes.",
      "Les acces rapides ouvrent les ecrans principaux deja disponibles.",
      "L'accueil reste le point de depart de navigation."
    ]
  },
  "/parc": {
    title: "Comprendre le parc physique",
    points: [
      "Commencez par les filtres et la synthese pour eviter une longue liste de biens.",
      "Ouvrez le detail seulement quand vous voulez consulter les fiches individuelles.",
      "La fiche bien regroupe identification, emplacement, tracabilite, photos et pieces jointes.",
      "Une nouvelle entree cree un ou plusieurs biens physiques distincts avec codes uniques."
    ]
  },
  "/documents": {
    title: "Comprendre les documents",
    points: [
      "La liste permet de consulter les brouillons, documents valides et documents annules.",
      "Les entrees disponibles a documenter sont separees de la liste officielle.",
      "La creation produit un brouillon, jamais un document valide automatiquement.",
      "Un document valide est verrouille pour conserver sa tracabilite."
    ]
  },
  "/mouvements": {
    title: "Comprendre les mouvements",
    points: [
      "Definissez d'abord le mouvement : type, date, depart, arrivee et raison.",
      "Choisissez ensuite les biens par code ou par filtres progressifs.",
      "Le brouillon ne modifie pas encore l'emplacement reel du bien.",
      "La validation met a jour l'emplacement et verrouille le mouvement."
    ]
  },
  "/referentiels": {
    title: "Comprendre les referentiels",
    points: [
      "Choisissez l'onglet a gerer : fournisseurs, emplacements, categories ou articles.",
      "Les emplacements et categories peuvent etre organises en hierarchie parent/enfant.",
      "Les referentiels actifs alimentent les menus deroulants des autres ecrans.",
      "La desactivation logique conserve l'historique sans supprimer physiquement les donnees."
    ]
  }
};

function currentHelp(pathname) {
  return helpByPath[pathname] || helpByPath["/"];
}

export default function HelpPanel() {
  const pathname = usePathname();
  const help = useMemo(() => currentHelp(pathname), [pathname]);

  return (
    <details className="help-widget">
      <summary className="help-toggle">Comprendre l'ecran</summary>
      <aside className="help-panel" aria-label="Aide logique">
        <strong>{help.title}</strong>
        <ol>
          {help.points.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ol>
      </aside>
    </details>
  );
}
