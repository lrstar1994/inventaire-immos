import "./globals.css";
import AppShell from "./components/app-shell";

export const metadata = {
  title: "Inventaire Immos",
  description: "Module V1 d'inventaire des immobilisations La Residence / SANTATRA"
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
