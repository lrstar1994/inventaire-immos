import Link from "next/link";

import AccessDenied from "@/app/components/access-denied";
import { APP_PERMISSIONS, hasPermission } from "@/lib/authorization";
import { authorizePrivatePage } from "@/lib/authorization-page";
import { prisma } from "@/lib/prisma";
import { ROLE_LABELS } from "@/lib/roles";

import UserManager from "./user-manager";

export const metadata = { title: "Gestion des utilisateurs | Inventaire Immos" };
export const dynamic = "force-dynamic";

async function loadUsers() {
  return prisma.user.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, role: true, status: true, createdAt: true }
  });
}

export default async function UsersPage() {
  const access = await authorizePrivatePage({ returnTo: "/users" });
  if (access.status !== "authorized") return <AccessDenied status={access.status} />;
  if (!hasPermission(access.user, APP_PERMISSIONS.USERS_MANAGE)) {
    return <AccessDenied status="insufficient_role" />;
  }

  const users = await loadUsers();
  const roles = Object.entries(ROLE_LABELS).map(([code, label]) => ({ code, label }));

  return (
    <main className="shell">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Administration</p>
          <h1>Gestion des utilisateurs</h1>
          <p className="summary">
            Gérez les profils applicatifs Inventaire Immos. Les comptes et mots de passe Supabase Auth restent administrés séparément.
          </p>
        </div>
        <Link className="button secondary" href="/">Accueil</Link>
      </div>
      <UserManager initialUsers={users} roles={roles} />
    </main>
  );
}
