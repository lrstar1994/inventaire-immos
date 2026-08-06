"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const resources = {
  suppliers: {
    label: "Fournisseurs",
    endpoint: "/api/suppliers",
    fields: [
      { name: "name", label: "Nom", required: true },
      { name: "code", label: "Code" },
      { name: "supplierType", label: "Type" },
      { name: "contactName", label: "Contact" },
      { name: "email", label: "Email" },
      { name: "phone", label: "Telephone" },
      { name: "address", label: "Adresse" },
      { name: "notes", label: "Notes", textarea: true }
    ],
    columns: ["name", "code", "supplierType", "contactName"]
  },
  locations: {
    label: "Emplacements",
    endpoint: "/api/locations",
    fields: [
      { name: "name", label: "Nom", required: true },
      { name: "code", label: "Code" },
      { name: "locationType", label: "Type" },
      { name: "parentId", label: "Parent", relation: "locations" },
      { name: "notes", label: "Notes", textarea: true }
    ],
    columns: ["name", "code", "locationType", "parent"]
  },
  categories: {
    label: "Categories",
    endpoint: "/api/asset-categories",
    fields: [
      { name: "name", label: "Nom", required: true },
      { name: "code", label: "Code" },
      { name: "description", label: "Description", textarea: true },
      { name: "parentId", label: "Parent", relation: "categories" },
      { name: "displayOrder", label: "Ordre", type: "number" }
    ],
    columns: ["name", "code", "parent", "description"]
  },
  items: {
    label: "Articles / modeles",
    endpoint: "/api/asset-items",
    fields: [
      { name: "name", label: "Nom", required: true },
      { name: "code", label: "Code" },
      { name: "description", label: "Description", textarea: true },
      { name: "unitLabel", label: "Unite" },
      { name: "categoryId", label: "Categorie", relation: "categories", required: true },
      { name: "supplierId", label: "Fournisseur", relation: "suppliers" },
      { name: "depreciationYears", label: "Duree indicative", type: "number" }
    ],
    columns: ["name", "code", "category", "supplier"]
  }
};

function emptyForm(resource) {
  return Object.fromEntries(resources[resource].fields.map((field) => [field.name, ""]));
}

function valueForColumn(item, column) {
  if (column === "parent") return item.parent?.name || "";
  if (column === "category") return item.category?.name || "";
  if (column === "supplier") return item.supplier?.name || "";
  return item[column] || "";
}

function hierarchyDepth(items, item) {
  let depth = 0;
  let current = item;
  const byId = new Map(items.map((entry) => [entry.id, entry]));
  while (current?.parentId && byId.has(current.parentId)) {
    depth += 1;
    current = byId.get(current.parentId);
  }
  return depth;
}

function childItems(items, itemId) {
  return items.filter((item) => item.parentId === itemId);
}

export default function ReferenceManager({ canWrite = false, initialActive = "suppliers", initialData = { suppliers: [], locations: [], categories: [], items: [] } }) {
  const [active, setActive] = useState(initialActive);
  const [data, setData] = useState(initialData);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState(emptyForm("suppliers"));
  const [editingId, setEditingId] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [message, setMessage] = useState("");

  const config = resources[active];

  async function loadAll() {
    const [suppliers, locations, categories, items] = await Promise.all([
      fetch("/api/suppliers").then((response) => response.json()),
      fetch("/api/locations").then((response) => response.json()),
      fetch("/api/asset-categories").then((response) => response.json()),
      fetch("/api/asset-items").then((response) => response.json())
    ]);

    setData({
      suppliers: suppliers.items || [],
      locations: locations.items || [],
      categories: categories.items || [],
      items: items.items || []
    });
  }

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    setActive(initialActive);
  }, [initialActive]);

  useEffect(() => {
    setForm(emptyForm(active));
    setEditingId(null);
    setSelectedItem(null);
    setMessage("");
  }, [active]);

  const filteredItems = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return data[active];
    return data[active].filter((item) =>
      [item.name, item.code, item.description, item.supplierType, item.locationType]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
    );
  }, [active, data, query]);

  function relationOptions(relation, currentId) {
    return data[relation].filter((item) => item.id !== currentId);
  }

  function startEdit(item) {
    const nextForm = emptyForm(active);
    for (const field of config.fields) {
      nextForm[field.name] = item[field.name] ?? "";
    }
    setEditingId(item.id);
    setSelectedItem(item);
    setForm(nextForm);
    setMessage("");
  }

  async function submitForm(event) {
    event.preventDefault();
    setMessage("");

    const payload = Object.fromEntries(
      Object.entries(form).map(([key, value]) => [key, value === "" ? null : value])
    );
    const url = editingId ? `${config.endpoint}/${editingId}` : config.endpoint;
    const method = editingId ? "PATCH" : "POST";
    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const error = await response.json();
      setMessage(error.error || "Operation impossible.");
      return;
    }

    await loadAll();
    setForm(emptyForm(active));
    setEditingId(null);
    setSelectedItem(null);
    setMessage(editingId ? "Modification enregistree." : "Creation enregistree.");
  }

  async function disableItem(item) {
    const response = await fetch(`${config.endpoint}/${item.id}`, { method: "DELETE" });
    if (!response.ok) {
      const error = await response.json();
      setMessage(error.error || "Desactivation impossible.");
      return;
    }
    await loadAll();
    setSelectedItem(null);
    setMessage("Element desactive.");
  }

  return (
    <section className="reference-layout">
      <nav className="tabs" aria-label="Referentiels">
        {Object.entries(resources).map(([key, resource]) => (
          <Link
            className={key === active ? "tab active" : "tab"}
            href={`/referentiels?tab=${key}`}
            key={key}
            onClick={() => {
              setActive(key);
              setQuery("");
            }}
          >
            {resource.label}
          </Link>
        ))}
      </nav>

      <div className="reference-grid referential-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>{config.label}</h2>
              <p className="summary-meta">
                {filteredItems.length} element(s). Les emplacements et categories peuvent etre hierarchiques.
              </p>
            </div>
            <input
              aria-label="Recherche"
              placeholder="Rechercher"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {config.columns.map((column) => (
                    <th key={column}>{column}</th>
                  ))}
                  <th>Statut</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => (
                  <tr key={item.id} onClick={() => setSelectedItem(item)}>
                    {config.columns.map((column) => (
                      <td key={column}>
                        {column === "name" && (active === "locations" || active === "categories") ? (
                          <span className="tree-cell" style={{ paddingLeft: `${hierarchyDepth(data[active], item) * 18}px` }}>
                            {hierarchyDepth(data[active], item) > 0 ? "└" : ""}
                            {valueForColumn(item, column)}
                          </span>
                        ) : (
                          valueForColumn(item, column)
                        )}
                      </td>
                    ))}
                    <td><span className={item.status === "ACTIVE" ? "status-badge active" : "status-badge disabled"}>{item.status === "ACTIVE" ? "Actif" : "Inactif"}</span></td>
                    <td>
                      <div className="row-actions">
                        {canWrite ? <button type="button" onClick={() => startEdit(item)}>
                          Modifier
                        </button> : null}
                        {canWrite ? <button type="button" onClick={() => disableItem(item)}>
                          Desactiver
                        </button> : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {canWrite ? <aside className="panel">
          <h2>{editingId ? "Modifier" : "Creer"}</h2>
          <form className="form" onSubmit={submitForm}>
            {config.fields.map((field) => (
              <label key={field.name}>
                <span>{field.label}</span>
                {field.relation ? (
                  <select
                    required={field.required}
                    value={form[field.name] || ""}
                    onChange={(event) => setForm({ ...form, [field.name]: event.target.value })}
                  >
                    <option value="">Aucun</option>
                    {relationOptions(field.relation, editingId).map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name}
                      </option>
                    ))}
                  </select>
                ) : field.textarea ? (
                  <textarea
                    value={form[field.name] || ""}
                    onChange={(event) => setForm({ ...form, [field.name]: event.target.value })}
                  />
                ) : (
                  <input
                    required={field.required}
                    type={field.type || "text"}
                    value={form[field.name] || ""}
                    onChange={(event) => setForm({ ...form, [field.name]: event.target.value })}
                  />
                )}
              </label>
            ))}
            {message ? <p className="form-message">{message}</p> : null}
            <div className="form-actions">
              <button className="button" type="submit">
                {editingId ? "Enregistrer" : "Creer"}
              </button>
              <button
                className="button secondary"
                type="button"
                onClick={() => {
                  setForm(emptyForm(active));
                  setEditingId(null);
                  setMessage("");
                }}
              >
                Annuler
              </button>
            </div>
          </form>
        </aside> : null}
      </div>

      <section className="panel detail-row">
        <div className="panel-heading">
          <div>
            <h2>Fiche referentiel</h2>
            <p className="summary-meta">Selectionner une ligne pour consulter son detail.</p>
          </div>
          {selectedItem ? (
            <button type="button" onClick={() => startEdit(selectedItem)}>Modifier</button>
          ) : null}
        </div>
        {selectedItem ? (
          <div className="detail-cards">
            <article className="info-box">
              <strong>{selectedItem.name}</strong>
              <p className="fact-line"><span>Code</span><strong>{selectedItem.code || "-"}</strong></p>
              <p className="fact-line"><span>Type</span><strong>{selectedItem.supplierType || selectedItem.locationType || selectedItem.unitLabel || "-"}</strong></p>
              <p className="fact-line"><span>Parent</span><strong>{selectedItem.parent?.name || selectedItem.category?.name || "-"}</strong></p>
              <p className="fact-line"><span>Statut</span><strong>{selectedItem.status === "ACTIVE" ? "Actif" : "Inactif"}</strong></p>
            </article>
            <article className="info-box">
              <strong>Hierarchy et liens</strong>
              {(active === "locations" || active === "categories") ? (
                <>
                  <p className="fact-line"><span>Niveau</span><strong>{hierarchyDepth(data[active], selectedItem) + 1}</strong></p>
                  <p className="fact-line"><span>Enfants directs</span><strong>{childItems(data[active], selectedItem.id).length}</strong></p>
                  <ul className="compact-list">
                    {childItems(data[active], selectedItem.id).map((child) => (
                      <li key={child.id}>{child.name}</li>
                    ))}
                    {childItems(data[active], selectedItem.id).length === 0 ? <li>Aucun enfant direct.</li> : null}
                  </ul>
                </>
              ) : (
                <p className="summary">Ce referentiel alimente les formulaires de l'application selon ses relations existantes.</p>
              )}
            </article>
            <article className="info-box">
              <strong>Notes</strong>
              <p>{selectedItem.notes || selectedItem.description || "Aucune note renseignee."}</p>
            </article>
          </div>
        ) : (
          <p className="summary">Aucune fiche selectionnee.</p>
        )}
      </section>
    </section>
  );
}
