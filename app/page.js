import Link from "next/link";
import { prisma } from "@/lib/prisma";
import AccessDenied from "@/app/components/access-denied";
import { authorizePrivatePage } from "@/lib/authorization-page";

export const dynamic = "force-dynamic";

async function getDashboardData() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [assetUnits, draftDocuments, recentMovements, unitsWithPrimaryPhoto] = await Promise.all([
    prisma.assetUnit.count({ where: { deletedAt: null } }),
    prisma.assetDocument.count({ where: { status: "DRAFT" } }),
    prisma.assetMovement.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
    prisma.assetUnit.count({
      where: {
        deletedAt: null,
        assetFiles: {
          some: {
            deletedAt: null,
            isPrimary: true
          }
        }
      }
    })
  ]);

  return {
    assetUnits,
    draftDocuments,
    recentMovements,
    unitsWithoutPrimaryPhoto: Math.max(assetUnits - unitsWithPrimaryPhoto, 0)
  };
}

function Icon({ name }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    strokeWidth: 1.8,
    viewBox: "0 0 24 24",
    "aria-hidden": "true"
  };

  if (name === "building") {
    return (
      <svg {...common}>
        <path d="M5 20V8l7-4 7 4v12" />
        <path d="M9 20v-7h6v7" />
        <path d="M9 9h.01M12 8h.01M15 9h.01" />
      </svg>
    );
  }
  if (name === "document") {
    return (
      <svg {...common}>
        <path d="M7 3h7l4 4v14H7z" />
        <path d="M14 3v5h4" />
        <path d="M9.5 12h5M9.5 16h5" />
      </svg>
    );
  }
  if (name === "movement") {
    return (
      <svg {...common}>
        <path d="M7 7h11l-3-3" />
        <path d="m18 7-3 3" />
        <path d="M17 17H6l3 3" />
        <path d="m6 17 3-3" />
      </svg>
    );
  }
  if (name === "camera") {
    return (
      <svg {...common}>
        <path d="M8 7 9.5 5h5L16 7h3v12H5V7z" />
        <path d="M12 16a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M5 7c0-1.7 3.1-3 7-3s7 1.3 7 3-3.1 3-7 3-7-1.3-7-3Z" />
      <path d="M5 7v5c0 1.7 3.1 3 7 3s7-1.3 7-3V7" />
      <path d="M5 12v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" />
    </svg>
  );
}

const modules = [
  {
    title: "Parc physique",
    action: "Ouvrir le parc",
    href: "/parc",
    icon: "building",
    text: "Consulter les biens, creer des entrees progressives et suivre les photos."
  },
  {
    title: "Documents",
    action: "Ouvrir les documents",
    href: "/documents",
    icon: "document",
    text: "Regrouper les entrees dans des documents chronologiques verrouillables."
  },
  {
    title: "Mouvements",
    action: "Ouvrir les mouvements",
    href: "/mouvements",
    icon: "movement",
    text: "Preparer, valider et tracer les deplacements des biens."
  },
  {
    title: "Referentiels",
    action: "Ouvrir les referentiels",
    href: "/referentiels",
    icon: "database",
    text: "Gerer fournisseurs, emplacements, categories et articles modeles."
  }
];

export default async function HomePage() {
  const access = await authorizePrivatePage({ returnTo: "/" });
  if (access.status !== "authorized") {
    return <AccessDenied status={access.status} />;
  }
  const data = await getDashboardData();

  const metrics = [
    {
      label: "Biens physiques",
      value: data.assetUnits,
      caption: "Total actif en base",
      icon: "building",
      tone: "green"
    },
    {
      label: "Documents en brouillon",
      value: data.draftDocuments,
      caption: "A finaliser",
      icon: "document",
      tone: "gold"
    },
    {
      label: "Mouvements recents",
      value: data.recentMovements,
      caption: "30 derniers jours",
      icon: "movement",
      tone: "green"
    },
    {
      label: "Biens sans photo principale",
      value: data.unitsWithoutPrimaryPhoto,
      caption: "A completer",
      icon: "camera",
      tone: "gold"
    }
  ];

  return (
    <main className="shell home-shell">
      <section className="home-hero">
        <div className="home-copy">
          <p className="eyebrow">La Residence / SANTATRA</p>
          <h1>Tableau de bord</h1>
          <span className="title-rule" aria-hidden="true"></span>
          <p className="summary">
            Vue d'ensemble de la gestion des immobilisations. Des donnees fiables pour des decisions eclairees.
          </p>
        </div>
        <aside className="lot-card" aria-label="Etat du projet">
          <span className="lot-medal">
            <Icon name="document" />
          </span>
          <div>
            <strong>Lot 6</strong>
            <span>Photos et pieces jointes en place.</span>
            <small>Bonne qualite des donnees.</small>
          </div>
        </aside>
      </section>

      <section className="dashboard-grid" aria-label="Indicateurs principaux">
        {metrics.map((metric) => (
          <article className="metric-card" key={metric.label}>
            <span className={`metric-icon ${metric.tone}`}>
              <Icon name={metric.icon} />
            </span>
            <div>
              <span className="metric-label">{metric.label}</span>
              <strong>{metric.value}</strong>
              <small>{metric.caption}</small>
            </div>
          </article>
        ))}
      </section>

      <section className="quick-actions" aria-label="Acces rapides">
        <div className="panel-heading">
          <div>
            <h2>Acces rapides</h2>
            <p className="summary">Chaque commande ouvre un module existant et reste associee a son usage principal.</p>
          </div>
        </div>
        <div className="quick-actions-grid">
          {modules.map((module) => (
            <article className="quick-action-column" key={module.href}>
              <Link className="quick-action" href={module.href}>
                <span className="quick-action-icon"><Icon name={module.icon} /></span>
                <span>{module.action}</span>
                <span aria-hidden="true">{">"}</span>
              </Link>
              <div className="quick-action-card">
                <span className="quick-card-icon"><Icon name={module.icon} /></span>
                <h3>{module.title}</h3>
                <p>{module.text}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
