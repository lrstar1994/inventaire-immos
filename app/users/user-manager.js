"use client";

import { useMemo, useState } from "react";

const emptyForm = Object.freeze({ email: "", name: "", role: "BASIC_USER", status: "ACTIVE" });

function publicError(payload, fallback) {
  return typeof payload?.error === "string" && payload.error.trim() ? payload.error : fallback;
}

async function readResponse(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

export default function UserManager({ initialUsers = [], roles = [] }) {
  const [users, setUsers] = useState(initialUsers);
  const [form, setForm] = useState({ ...emptyForm });
  const [editingId, setEditingId] = useState(null);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [approvalRoles, setApprovalRoles] = useState({});

  const roleLabels = useMemo(() => new Map(roles.map((role) => [role.code, role.label])), [roles]);
  const pendingUsers = useMemo(() => users.filter((user) => user.status === "PENDING"), [users]);
  const regularUsers = useMemo(() => users.filter((user) => user.status !== "PENDING"), [users]);
  const filteredUsers = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return regularUsers;
    return regularUsers.filter((user) =>
      [user.name, user.email, roleLabels.get(user.role), user.status]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
    );
  }, [query, regularUsers, roleLabels]);

  async function refreshUsers() {
    const response = await fetch("/api/users", { cache: "no-store" });
    const payload = await readResponse(response);
    if (!response.ok) throw new Error(publicError(payload, "Chargement des utilisateurs impossible."));
    setUsers(payload.users || []);
  }

  function resetForm() {
    setEditingId(null);
    setForm({ ...emptyForm });
  }

  function startEdit(user) {
    setEditingId(user.id);
    setForm({ email: user.email, name: user.name, role: user.role, status: user.status });
    setMessage("");
    setError("");
  }

  async function submit(event) {
    event.preventDefault();
    setMessage("");
    setError("");
    const email = form.email.trim().toLowerCase();
    const name = form.name.trim();
    if (!email || !name) {
      setError("Le nom et l’adresse email sont obligatoires.");
      return;
    }
    if (users.some((user) => user.email.toLowerCase() === email && user.id !== editingId)) {
      setError("Un utilisateur métier utilise déjà cette adresse email.");
      return;
    }

    const isEditing = Boolean(editingId);
    const endpoint = isEditing ? `/api/users/${editingId}` : "/api/users";
    const payload = isEditing
      ? { name, role: form.role, status: form.status }
      : { email, name, role: form.role, status: form.status };

    setPending(true);
    try {
      const response = await fetch(endpoint, {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = await readResponse(response);
      if (!response.ok) throw new Error(publicError(result, isEditing ? "Modification impossible." : "Création impossible."));
      await refreshUsers();
      resetForm();
      setMessage(isEditing ? "Utilisateur modifié." : "Utilisateur créé.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Opération impossible.");
    } finally {
      setPending(false);
    }
  }

  async function disableUser(user) {
    if (!window.confirm(`Désactiver l’utilisateur « ${user.name} » ?`)) return;
    setMessage("");
    setError("");
    setPending(true);
    try {
      const response = await fetch(`/api/users/${user.id}`, { method: "DELETE" });
      const payload = await readResponse(response);
      if (!response.ok) throw new Error(publicError(payload, "Désactivation impossible."));
      await refreshUsers();
      if (editingId === user.id) resetForm();
      setMessage("Utilisateur désactivé.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Désactivation impossible.");
    } finally {
      setPending(false);
    }
  }

  async function approveUser(user) {
    const role = approvalRoles[user.id];
    if (!role) {
      setError("Choisissez explicitement un rôle avant de valider la demande.");
      return;
    }
    if (!window.confirm(`Valider la demande de « ${user.name} » avec le rôle ${roleLabels.get(role) || role} ?`)) return;
    setMessage("");
    setError("");
    setPending(true);
    try {
      const response = await fetch(`/api/users/${user.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role })
      });
      const payload = await readResponse(response);
      if (!response.ok) throw new Error(publicError(payload, "Validation impossible."));
      await refreshUsers();
      setApprovalRoles((current) => ({ ...current, [user.id]: "" }));
      setMessage("Demande d’accès validée.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Validation impossible.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="reference-layout" aria-label="Administration des utilisateurs">
      <section className="panel" aria-labelledby="pending-users-title">
        <div className="panel-heading">
          <div><h2 id="pending-users-title">Demandes en attente</h2><p className="summary-meta">{pendingUsers.length} demande(s) à valider explicitement</p></div>
        </div>
        {pendingUsers.length === 0 ? <p>Aucune demande en attente.</p> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Nom</th><th>Email</th><th>Date de demande</th><th>Rôle à attribuer</th><th>Actions</th></tr></thead>
              <tbody>{pendingUsers.map((user) => (
                <tr key={user.id}>
                  <td>{user.name}</td><td>{user.email}</td><td>{new Intl.DateTimeFormat("fr-FR").format(new Date(user.createdAt))}</td>
                  <td><select aria-label={`Rôle pour ${user.name}`} onChange={(event) => setApprovalRoles({ ...approvalRoles, [user.id]: event.target.value })} value={approvalRoles[user.id] || ""}>
                    <option value="">Choisir un rôle</option>
                    {roles.map((role) => <option key={role.code} value={role.code}>{role.label}</option>)}
                  </select></td>
                  <td><div className="row-actions">
                    <button disabled={pending || !approvalRoles[user.id]} onClick={() => approveUser(user)} type="button">Valider</button>
                    <button className="secondary" disabled={pending} onClick={() => disableUser(user)} type="button">Refuser</button>
                  </div></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
      <div className="reference-grid wide">
        <section className="panel">
          <div className="panel-heading">
            <div><h2>Utilisateurs</h2><p className="summary-meta">{filteredUsers.length} profil(s) applicatif(s)</p></div>
          </div>
          <label className="filter-stack">
            Rechercher
            <input onChange={(event) => setQuery(event.target.value)} placeholder="Nom, email, rôle ou statut" type="search" value={query} />
          </label>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Nom</th><th>Email</th><th>Rôle</th><th>Statut</th><th>Actions</th></tr></thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user.id}>
                    <td>{user.name}</td><td>{user.email}</td><td>{roleLabels.get(user.role) || user.role}</td>
                    <td><span className={`status-badge ${user.status === "ACTIVE" ? "active" : "disabled"}`}>{user.status === "ACTIVE" ? "Actif" : "Désactivé"}</span></td>
                    <td><div className="row-actions">
                      <button className="secondary" disabled={pending} onClick={() => startEdit(user)} type="button">Modifier</button>
                      <button disabled={pending || user.status !== "ACTIVE"} onClick={() => disableUser(user)} type="button">Désactiver</button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="panel">
          <h2>{editingId ? "Modifier l’utilisateur" : "Créer un utilisateur métier"}</h2>
          <p className="summary-meta">Cette action ne crée pas de compte Supabase Auth et ne gère aucun mot de passe.</p>
          <form className="form" onSubmit={submit}>
            <label>Nom<input autoComplete="name" maxLength={160} onChange={(event) => setForm({ ...form, name: event.target.value })} required value={form.name} /></label>
            <label>Adresse email<input autoComplete="email" disabled={Boolean(editingId)} maxLength={254} onChange={(event) => setForm({ ...form, email: event.target.value })} required type="email" value={form.email} /></label>
            <label>Rôle<select onChange={(event) => setForm({ ...form, role: event.target.value })} value={form.role}>{roles.map((role) => <option key={role.code} value={role.code}>{role.label}</option>)}</select></label>
            <label>Statut<select onChange={(event) => setForm({ ...form, status: event.target.value })} value={form.status}><option value="ACTIVE">Actif</option><option value="DISABLED">Désactivé</option></select></label>
            {error ? <p aria-live="assertive" className="auth-error" role="alert">{error}</p> : null}
            {message ? <p aria-live="polite" className="form-message" role="status">{message}</p> : null}
            <div className="form-actions">
              <button disabled={pending} type="submit">{pending ? "Enregistrement…" : editingId ? "Enregistrer" : "Créer"}</button>
              {editingId ? <button className="secondary" disabled={pending} onClick={resetForm} type="button">Annuler</button> : null}
            </div>
          </form>
        </aside>
      </div>
    </section>
  );
}
