"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const levelLabels = { CATEGORY: "Catégorie", SUBCATEGORY: "Sous-catégorie", FAMILY: "Famille" };
const trackingLabels = { I: "Individuel", Q: "Quantité", QI: "Quantité individualisable", E: "Ensemble" };
const controlLabels = { C1: "Standard", C2: "À contrôler", C3: "Sensible", C4: "Critique" };

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
    label: "Catégories / Sous-catégories / Familles",
    endpoint: "/api/asset-categories",
    fields: [
      { name: "name", label: "Nom", required: true },
      { name: "hierarchyLevel", label: "Type", required: true, options: levelLabels },
      { name: "code", label: "Code", required: true },
      { name: "description", label: "Description", textarea: true },
      { name: "parentId", label: "Parent", relation: "categories", visible: (form) => form.hierarchyLevel !== "CATEGORY" },
      { name: "trackingMode", label: "Mode de suivi", options: trackingLabels, visible: (form) => form.hierarchyLevel === "FAMILY" },
      { name: "controlLevel", label: "Niveau de contrôle", options: controlLabels, visible: (form) => form.hierarchyLevel === "FAMILY" },
      { name: "status", label: "Statut", options: { ACTIVE: "Actif", DISABLED: "Inactif" } },
      { name: "displayOrder", label: "Ordre", type: "number" }
    ],
    columns: ["name", "code", "hierarchyLevel", "parent", "trackingMode", "controlLevel"]
  },
  items: {
    label: "Références matériel",
    endpoint: "/api/asset-items",
    fields: [
      { name: "name", label: "Nom", required: true },
      { name: "code", label: "Code" },
      { name: "description", label: "Description", textarea: true },
      { name: "unitLabel", label: "Unite" },
      { name: "categoryId", label: "Famille", relation: "categories", required: true, familyOnly: true },
      { name: "supplierId", label: "Fournisseur", relation: "suppliers" },
      { name: "depreciationYears", label: "Duree indicative", type: "number" }
    ],
    columns: ["name", "code", "category", "supplier"]
  }
};

function emptyForm(resource) {
  const form = Object.fromEntries(resources[resource].fields.map((field) => [field.name, ""]));
  if (resource === "categories") form.hierarchyLevel = "CATEGORY";
  return form;
}

function valueForColumn(item, column) {
  if (column === "parent") return item.parent?.name || "";
  if (column === "category") return item.category?.name || "";
  if (column === "supplier") return item.supplier?.name || "";
  if (column === "hierarchyLevel") return levelLabels[item.hierarchyLevel] || item.hierarchyLevel || "";
  if (column === "trackingMode") return trackingLabels[item.trackingMode] || "-";
  if (column === "controlLevel") return controlLabels[item.controlLevel] || "-";
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

  function relationOptions(field, currentId) {
    let options = data[field.relation].filter((item) => item.id !== currentId);
    if (field.familyOnly) options = options.filter((item) => item.hierarchyLevel === "FAMILY");
    if (active === "categories" && field.name === "parentId") {
      const expected = form.hierarchyLevel === "SUBCATEGORY" ? "CATEGORY" : "SUBCATEGORY";
      options = options.filter((item) => item.hierarchyLevel === expected);
    }
    return options;
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
            {config.fields.filter((field) => !field.visible || field.visible(form)).map((field) => (
              <label key={field.name}>
                <span>{field.label}</span>
                {field.relation ? (
                  <select
                    required={field.required}
                    value={form[field.name] || ""}
                    onChange={(event) => setForm({ ...form, [field.name]: event.target.value })}
                  >
                    <option value="">Aucun</option>
                    {relationOptions(field, editingId).map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name}
                      </option>
                    ))}
                  </select>
                ) : field.options ? (
                  <select
                    required={field.required}
                    value={form[field.name] || ""}
                    onChange={(event) => {
                      const next = { ...form, [field.name]: event.target.value };
                      if (field.name === "hierarchyLevel") {
                        next.parentId = "";
                        next.trackingMode = event.target.value === "FAMILY" ? (form.trackingMode || "I") : "";
                        next.controlLevel = event.target.value === "FAMILY" ? (form.controlLevel || "C1") : "";
                      }
                      setForm(next);
                    }}
                  >
                    <option value="">Choisir</option>
                    {Object.entries(field.options).map(([optionValue, optionLabel]) => (
                      <option key={optionValue} value={optionValue}>{optionLabel}</option>
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
              {active === "categories" ? <p className="fact-line"><span>Niveau</span><strong>{levelLabels[selectedItem.hierarchyLevel] || "-"}</strong></p> : null}
              <p className="fact-line"><span>Parent</span><strong>{selectedItem.parent?.name || selectedItem.category?.name || "-"}</strong></p>
              {active === "categories" && selectedItem.hierarchyLevel === "FAMILY" ? <>
                <p className="fact-line"><span>Mode de suivi</span><strong>{trackingLabels[selectedItem.trackingMode] || "-"}</strong></p>
                <p className="fact-line"><span>Niveau de contrôle</span><strong>{controlLabels[selectedItem.controlLevel] || "-"}</strong></p>
              </> : null}
              {active === "items" ? <>
                <p className="fact-line"><span>Mode de suivi</span><strong>{trackingLabels[selectedItem.category?.trackingMode] || "-"}</strong></p>
                <p className="fact-line"><span>Niveau de contrôle</span><strong>{controlLabels[selectedItem.category?.controlLevel] || "-"}</strong></p>
              </> : null}
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
