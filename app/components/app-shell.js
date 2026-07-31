import Link from "next/link";
import { logoutAction } from "@/app/connexion/actions";
import ActiveNavLink from "./active-nav-link";
import HelpPanel from "./help-panel";

const navItems = [
  { href: "/", label: "Tableau de bord", icon: "home" },
  { href: "/parc", label: "Parc physique", icon: "building" },
  { href: "/documents", label: "Documents", icon: "document" },
  { href: "/mouvements", label: "Mouvements", icon: "movement" },
  { href: "/referentiels", label: "Referentiels", icon: "database" }
];

function Icon({ name }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    strokeWidth: 1.9,
    viewBox: "0 0 24 24",
    "aria-hidden": "true"
  };

  if (name === "home") {
    return (
      <svg {...common}>
        <path d="M3.5 11.2 12 4l8.5 7.2" />
        <path d="M5.5 10.5v8h5v-5h3v5h5v-8" />
      </svg>
    );
  }
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
  return (
    <svg {...common}>
      <path d="M5 7c0-1.7 3.1-3 7-3s7 1.3 7 3-3.1 3-7 3-7-1.3-7-3Z" />
      <path d="M5 7v5c0 1.7 3.1 3 7 3s7-1.3 7-3V7" />
      <path d="M5 12v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" />
    </svg>
  );
}

export default function AppShell({ children }) {
  const today = new Intl.DateTimeFormat("fr-FR").format(new Date());

  return (
    <div className="app-frame">
      <aside className="app-sidebar" aria-label="Navigation principale">
        <Link className="brand" href="/">
          <span className="brand-mark">LR</span>
          <span>
            <strong>La Residence</strong>
            <small>Le village dans la ville</small>
          </span>
        </Link>
        <nav className="side-nav">
          {navItems.map((item) => (
            <ActiveNavLink href={item.href} key={item.href}>
              <span className="nav-icon"><Icon name={item.icon} /></span>
              <span className="nav-label">{item.label}</span>
            </ActiveNavLink>
          ))}
        </nav>
        <div className="sidebar-person">
          <span className="avatar">JR</span>
          <span>
            <strong>Judi Randria</strong>
            <small>Direction</small>
          </span>
        </div>
        <div className="sidebar-footer">
          <strong>La Residence Ankerana</strong>
          <span>Module inventaire - Lot 6</span>
        </div>
      </aside>

      <div className="app-main">
        <header className="app-header">
          <div className="app-title">
            <span className="menu-mark" aria-hidden="true"></span>
            <strong>Inventaire Immos</strong>
          </div>
          <div className="header-actions">
            <span className="header-help">Aide</span>
            <span className="header-date">{today}</span>
            <form action={logoutAction}>
              <input name="locale" type="hidden" value="fr" />
              <button className="header-help" type="submit">Déconnexion</button>
            </form>
          </div>
        </header>
        {children}
      </div>
      <HelpPanel />
    </div>
  );
}
