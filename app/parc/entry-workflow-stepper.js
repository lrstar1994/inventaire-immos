import Link from "next/link";

const steps = [
  { number: 1, label: "Parc physique", href: "/parc" },
  { number: 2, label: "Entrées en cours", href: "/parc/entrees-en-cours" },
  { number: 3, label: "Choisir l'article", href: "/parc/nouvelle-entree" },
  { number: 4, label: "Fiche d'entrée" },
  { number: 5, label: "Photos & documents" },
  { number: 6, label: "Données financières" },
  { number: 7, label: "Vérification" },
  { number: 8, label: "Confirmation" }
];

export default function EntryWorkflowStepper({ active = 1 }) {
  return <nav className="entry-flow-stepper" aria-label="Progression du parcours d’entrée">
    {steps.map((step) => {
      const content = <><span className="entry-flow-number">{step.number}</span><span className="entry-flow-label">{step.label}</span></>;
      return <div className={`entry-flow-step ${step.number === active ? "active" : ""}`} key={step.number}>
        {step.href ? <Link href={step.href}>{content}</Link> : <span>{content}</span>}
      </div>;
    })}
  </nav>;
}
