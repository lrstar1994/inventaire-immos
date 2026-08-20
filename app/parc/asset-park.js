"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AssetFileImage } from "./asset-file-access-view";

function today() {
  return new Date().toISOString().slice(0, 10);
}

const initialEntry = {
  assetItemId: "",
  locationId: "",
  supplierId: "",
  supplierKnown: false,
  quantity: 1,
  entryType: "PROGRESSIVE_INVENTORY",
  entryDate: today(),
  initialCondition: "GOOD",
  initialStatus: "IN_SERVICE",
  informationStatus: "PARTIAL",
  purchaseDateKnown: false,
  purchaseDate: "",
  priceKnown: false,
  unitPrice: "",
  totalPrice: "",
  invoiceAvailable: false,
  invoiceReference: "",
  serialNumber: "",
  duplicateConfirmed: false,
  duplicateReason: "",
  notes: ""
};

const initialFileForm = {
  fileType: "MAIN_PHOTO",
  fileLabel: "",
  notes: "",
  isPrimary: true,
  file: null
};

function label(list, code) {
  return list.find((item) => item.code === code)?.label || code;
}

function assetItemOptionLabel(item) {
  const family = item.category?.name || "Famille non renseignée";
  const mode = item.category?.trackingMode ? ({ I: "Individuel", Q: "Quantité", QI: "Quantité individualisable", E: "Ensemble" }[item.category.trackingMode] || item.category.trackingMode) : "Mode non renseigné";
  return `${item.name} — ${family} — ${mode}`;
}

function collectCategoryDescendants(categories, categoryId) {
  const ids = new Set([categoryId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const category of categories) {
      if (category.parentId && ids.has(category.parentId) && !ids.has(category.id)) {
        ids.add(category.id);
        changed = true;
      }
    }
  }
  return [...ids];
}

function rootCategoryFor(categories, categoryId) {
  const byId = new Map(categories.map((category) => [category.id, category]));
  let current = byId.get(categoryId);
  while (current?.parentId && byId.has(current.parentId)) {
    current = byId.get(current.parentId);
  }
  return current || null;
}

export default function AssetPark({ canWrite = false, initialOptions = null, initialUnits = [], initialEntries = [] }) {
  const [options, setOptions] = useState(initialOptions);
  const [units, setUnits] = useState(initialUnits);
  const [entries, setEntries] = useState(initialEntries);
  const [filters, setFilters] = useState({
    q: "",
    status: "",
    condition: "",
    informationStatus: "",
    categoryPath: [],
    assetItemId: "",
    locationId: ""
  });
  const [entry, setEntry] = useState(initialEntry);
  const [selected, setSelected] = useState(null);
  const [message, setMessage] = useState("");
  const [duplicateAlert, setDuplicateAlert] = useState(null);
  const [showDetails, setShowDetails] = useState(false);
  const [fileForm, setFileForm] = useState(initialFileForm);
  const [fileInputKey, setFileInputKey] = useState(0);

  async function loadData() {
    const [nextOptions, nextUnits, nextEntries] = await Promise.all([
      fetch("/api/asset-options").then((response) => response.json()),
      fetch("/api/asset-units").then((response) => response.json()),
      fetch("/api/asset-entries").then((response) => response.json())
    ]);
    setOptions(nextOptions);
    setUnits(nextUnits.units || []);
    setEntries(nextEntries.entries || []);
    setSelected((current) => {
      if (!current) return null;
      return (nextUnits.units || []).find((unit) => unit.id === current.id) || null;
    });
  }

  useEffect(() => {
    loadData();
  }, []);

  const filteredUnits = useMemo(() => {
    if (!options) return [];
    const term = filters.q.trim().toLowerCase();
    const selectedCategoryId = filters.categoryPath[filters.categoryPath.length - 1] || "";
    const categoryIds = selectedCategoryId ? collectCategoryDescendants(options.assetCategories, selectedCategoryId) : [];
    return units.filter((unit) => {
      const matchesText =
        !term ||
        [unit.assetCode, unit.serialNumber, unit.assetItem?.name, unit.location?.name]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term));
      return (
        matchesText &&
        (!filters.locationId || unit.location?.id === filters.locationId) &&
        (!filters.assetItemId || unit.assetItem?.id === filters.assetItemId) &&
        (!selectedCategoryId || categoryIds.includes(unit.assetItem?.categoryId)) &&
        (!filters.status || unit.status === filters.status) &&
        (!filters.condition || unit.condition === filters.condition) &&
        (!filters.informationStatus || unit.informationStatus === filters.informationStatus)
      );
    });
  }, [filters, options, units]);

  const visibleCategoryParentId = filters.categoryPath[filters.categoryPath.length - 1] || null;
  const visibleCategories = useMemo(() => {
    if (!options) return [];
    return options.assetCategories.filter((category) => (category.parentId || null) === visibleCategoryParentId);
  }, [options, visibleCategoryParentId]);

  const selectedCategoryId = filters.categoryPath[filters.categoryPath.length - 1] || "";
  const categoryScope = options && selectedCategoryId ? collectCategoryDescendants(options.assetCategories, selectedCategoryId) : [];
  const filteredAssetItems = useMemo(() => {
    if (!options) return [];
    return options.assetItems.filter((item) => !selectedCategoryId || categoryScope.includes(item.categoryId));
  }, [categoryScope, options, selectedCategoryId]);

  const categoryBreadcrumb = useMemo(() => {
    if (!options) return [];
    return filters.categoryPath
      .map((id) => options.assetCategories.find((category) => category.id === id))
      .filter(Boolean)
      .map((category) => category.name);
  }, [filters.categoryPath, options]);

  const unitSummaries = useMemo(() => {
    const groups = new Map();
    for (const unit of filteredUnits) {
      const key = `${unit.assetItem?.id || "unknown"}`;
      const current = groups.get(key) || {
        key,
        assetItemId: unit.assetItem?.id || "",
        model: unit.assetItem?.name || "Modele inconnu",
        total: 0,
        locations: new Map(),
        statuses: new Map(),
        conditions: new Map()
      };
      current.total += 1;
      const locationName = unit.location?.name || "Emplacement inconnu";
      current.locations.set(locationName, (current.locations.get(locationName) || 0) + 1);
      current.statuses.set(unit.status, (current.statuses.get(unit.status) || 0) + 1);
      current.conditions.set(unit.condition, (current.conditions.get(unit.condition) || 0) + 1);
      groups.set(key, current);
    }
    return [...groups.values()].map((group) => ({
      ...group,
      locations: [...group.locations.entries()],
      statuses: [...group.statuses.entries()],
      conditions: [...group.conditions.entries()]
    }));
  }, [filteredUnits]);

  const hasFocusedFilter = Boolean(
    filters.q ||
      filters.status ||
      filters.condition ||
      filters.informationStatus ||
      filters.categoryPath.length ||
      filters.assetItemId ||
      filters.locationId
  );

  const familySummaries = useMemo(() => {
    if (!options) return [];
    const groups = new Map();
    for (const unit of units) {
      const rootCategory = rootCategoryFor(options.assetCategories, unit.assetItem?.categoryId);
      const key = rootCategory?.id || "unknown";
      const current = groups.get(key) || {
        key,
        family: rootCategory?.name || "Famille non renseignee",
        total: 0,
        models: new Map(),
        locations: new Map()
      };
      current.total += 1;
      current.models.set(unit.assetItem?.name || "Modele inconnu", (current.models.get(unit.assetItem?.name || "Modele inconnu") || 0) + 1);
      current.locations.set(unit.location?.name || "Emplacement inconnu", (current.locations.get(unit.location?.name || "Emplacement inconnu") || 0) + 1);
      groups.set(key, current);
    }
    return [...groups.values()].map((group) => ({
      ...group,
      models: [...group.models.entries()],
      locations: [...group.locations.entries()]
    }));
  }, [options, units]);

  function chooseCategory(categoryId) {
    setFilters((current) => ({
      ...current,
      categoryPath: [...current.categoryPath, categoryId],
      assetItemId: ""
    }));
    setShowDetails(false);
  }

  function resetCategory() {
    setFilters((current) => ({ ...current, categoryPath: [], assetItemId: "" }));
    setShowDetails(false);
  }

  function chooseCategoryFromSelect(categoryId) {
    if (!categoryId) return;
    chooseCategory(categoryId);
  }

  function showModelDetails(assetItemId) {
    setFilters((current) => ({ ...current, assetItemId }));
    setShowDetails(true);
  }

  function resetFilters() {
    setFilters({
      q: "",
      status: "",
      condition: "",
      informationStatus: "",
      categoryPath: [],
      assetItemId: "",
      locationId: ""
    });
    setShowDetails(false);
  }

  function lastMovement(unit) {
    return unit.movementLines?.[0]?.movement || null;
  }

  function entryDocument(unit) {
    return unit.documentLines?.find((line) => line.document?.documentType === "ENTRY_SLIP")?.document || null;
  }

  function primaryFile(unit) {
    return unit.assetFiles?.find((file) => file.isPrimary) || unit.assetFiles?.find((file) => file.mimeType?.startsWith("image/")) || null;
  }

  function imageFiles(unit) {
    return (unit.assetFiles || []).filter((file) => file.mimeType?.startsWith("image/"));
  }

  function documentFiles(unit) {
    return (unit.assetFiles || []).filter((file) => !file.mimeType?.startsWith("image/"));
  }

  function categoryName(unit) {
    return options.assetCategories.find((category) => category.id === unit.assetItem?.categoryId)?.name || "Categorie non renseignee";
  }

  function fileTypeLabel(code) {
    return options.assetFileOptions?.fileTypes?.find((item) => item.code === code)?.label || code;
  }

  async function submitAssetFile() {
    if (!selected) return;
    setMessage("");
    const file = fileForm.file;
    if (!file) {
      setMessage("Choisir un fichier a ajouter.");
      return;
    }

    const formData = new FormData();
    formData.append("assetUnitId", selected.id);
    formData.append("fileType", fileForm.fileType);
    formData.append("fileLabel", fileForm.fileLabel);
    formData.append("notes", fileForm.notes);
    formData.append("isPrimary", String(fileForm.isPrimary));
    formData.append("file", file);

    const response = await fetch("/api/asset-files", { method: "POST", body: formData });
    const result = await response.json();
    if (!response.ok) {
      setMessage(result.error || "Ajout du fichier impossible.");
      return;
    }
    setMessage("Fichier ajoute au bien.");
    setFileForm(initialFileForm);
    setFileInputKey((current) => current + 1);
    await loadData();
  }

  async function setPrimaryAssetFile(fileId) {
    setMessage("");
    const response = await fetch(`/api/asset-files/${fileId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPrimary: true })
    });
    const result = await response.json();
    if (!response.ok) {
      setMessage(result.error || "Photo principale impossible.");
      return;
    }
    setMessage("Photo principale mise a jour.");
    await loadData();
  }

  async function deleteAssetFile(fileId) {
    setMessage("");
    const response = await fetch(`/api/asset-files/${fileId}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok) {
      setMessage(result.error || "Suppression impossible.");
      return;
    }
    setMessage("Fichier supprime logiquement.");
    await loadData();
  }

  async function submitEntry(event) {
    event.preventDefault();
    setMessage("");
    setDuplicateAlert(null);
    const duplicateParams = new URLSearchParams({
      assetItemId: entry.assetItemId,
      locationId: entry.locationId
    });
    if (entry.supplierKnown && entry.supplierId) duplicateParams.set("supplierId", entry.supplierId);
    if (entry.serialNumber) duplicateParams.set("serialNumber", entry.serialNumber);

    const duplicateResponse = await fetch(`/api/asset-duplicate-check?${duplicateParams.toString()}`);
    const duplicateResult = await duplicateResponse.json();
    if (duplicateResult.serialDuplicateBlocked) {
      setDuplicateAlert(duplicateResult);
      setMessage("Numero de serie deja utilise par un bien actif.");
      return;
    }
    if (duplicateResult.possibleDuplicate && (!entry.duplicateConfirmed || !entry.duplicateReason.trim())) {
      setDuplicateAlert(duplicateResult);
      setMessage("Doublon probable detecte : confirmer et saisir un motif pour continuer.");
      return;
    }

    const payload = {
      ...entry,
      quantity: Number.parseInt(entry.quantity, 10),
      supplierId: entry.supplierKnown ? entry.supplierId || null : null,
      unitPrice: entry.priceKnown ? entry.unitPrice || null : null,
      totalPrice: entry.priceKnown ? entry.totalPrice || null : null,
      purchaseDate: entry.purchaseDateKnown ? entry.purchaseDate || null : null,
      invoiceReference: entry.invoiceAvailable ? entry.invoiceReference || null : null,
      serialNumber: entry.quantity === 1 ? entry.serialNumber || null : null,
      entryStatus: "VALIDATED"
    };

    const response = await fetch("/api/asset-entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    if (!response.ok) {
      setMessage(result.error || "Creation impossible.");
      return;
    }

    setMessage(`${result.units.length} bien(s) cree(s) depuis ${result.entry.entryNumber}.`);
    setEntry(initialEntry);
    setDuplicateAlert(null);
    await loadData();
  }

  async function saveSelected(event) {
    event.preventDefault();
    if (!selected) return;

    const response = await fetch(`/api/asset-units/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        condition: selected.condition,
        status: selected.status,
        informationStatus: selected.informationStatus,
        serialNumber: selected.serialNumber || null,
        notes: selected.notes || null
      })
    });

    const result = await response.json();
    if (!response.ok) {
      setMessage(result.error || "Modification impossible.");
      return;
    }

    setMessage(`Bien ${result.unit.assetCode} mis a jour.`);
    await loadData();
  }

  if (!options) {
    return <p className="summary">Chargement du parc physique...</p>;
  }

  return (
    <section className="reference-layout park-layout">
      <div className="park-main-grid">
        <section className="panel park-search-panel">
          <div className="panel-heading">
            <div>
              <h2>Rechercher et filtrer</h2>
              <p className="summary">Affinez la vue avant d'ouvrir les fiches individuelles.</p>
            </div>
            <input
              aria-label="Recherche parc"
              placeholder="Rechercher un code, un modele, un numero de serie..."
              value={filters.q}
              onChange={(event) => setFilters({ ...filters, q: event.target.value })}
            />
          </div>
          <div className="info-box park-guide-box">
            <strong>Consultation progressive du parc</strong>
            <p>Choisir une famille, un modele ou un emplacement pour obtenir une synthese. La fiche individuelle reste accessible ensuite.</p>
          </div>
          <div className="category-picker park-category-picker">
            <div className="fact-line">
              <span>Famille / categorie</span>
              <strong>{categoryBreadcrumb.length ? categoryBreadcrumb.join(" > ") : "Toutes les familles"}</strong>
            </div>
            {visibleCategories.length ? (
              <label>
                <span>{filters.categoryPath.length ? "Niveau suivant" : "Famille / grande categorie"}</span>
                <select value="" onChange={(event) => chooseCategoryFromSelect(event.target.value)}>
                  <option value="">Choisir</option>
                  {visibleCategories.map((category) => (
                    <option key={category.id} value={category.id}>{category.name}</option>
                  ))}
                </select>
              </label>
            ) : (
              <p className="summary">Aucun niveau inferieur disponible.</p>
            )}
            {filters.categoryPath.length ? (
              <button className="secondary" type="button" onClick={resetCategory}>Revenir a toutes les familles</button>
            ) : null}
          </div>
          <div className="filter-row park-filter-row">
            <select value={filters.assetItemId} onChange={(event) => { setFilters({ ...filters, assetItemId: event.target.value }); setShowDetails(false); }}>
              <option value="">Tous les articles / modeles</option>
              {filteredAssetItems.map((item) => (
                <option key={item.id} value={item.id}>{assetItemOptionLabel(item)}</option>
              ))}
            </select>
            <select value={filters.locationId} onChange={(event) => { setFilters({ ...filters, locationId: event.target.value }); setShowDetails(false); }}>
              <option value="">Tous les emplacements</option>
              {options.locations.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
            <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
              <option value="">Tous les statuts</option>
              {options.statuses.map((item) => (
                <option key={item.code} value={item.code}>{item.label}</option>
              ))}
            </select>
          </div>
          <div className="filter-row park-filter-row secondary-filters">
            <select value={filters.condition} onChange={(event) => setFilters({ ...filters, condition: event.target.value })}>
              <option value="">Tous les etats</option>
              {options.conditions.map((item) => (
                <option key={item.code} value={item.code}>{item.label}</option>
              ))}
            </select>
            <select value={filters.informationStatus} onChange={(event) => setFilters({ ...filters, informationStatus: event.target.value })}>
              <option value="">Toutes les completudes</option>
              {options.informationStatuses.map((item) => (
                <option key={item.code} value={item.code}>{item.label}</option>
              ))}
            </select>
          </div>
          <div className="form-actions park-filter-actions">
            <button className="secondary" type="button" onClick={() => setShowDetails(!showDetails)} disabled={!filteredUnits.length}>
              {showDetails ? "Voir la synthese" : "Voir les biens"}
            </button>
            <button className="secondary" type="button" onClick={resetFilters}>Reinitialiser</button>
          </div>
          {showDetails ? (
            <div className="table-wrap park-units-table">
              <table>
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Photo</th>
                    <th>Modele</th>
                    <th>Emplacement</th>
                    <th>Etat</th>
                    <th>Statut</th>
                    <th>Completude</th>
                    <th>Entree</th>
                    <th>Document</th>
                    <th>Dernier mouvement</th>
                    <th>Doublon</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUnits.map((unit) => (
                    <tr key={unit.id} onClick={() => setSelected(unit)}>
                      <td>{unit.assetCode}</td>
                      <td>
                        {primaryFile(unit) ? (
                          <AssetFileImage
                            className="asset-thumb"
                            alt={`Photo ${unit.assetCode}`}
                            file={primaryFile(unit)}
                          />
                        ) : (
                          "-"
                        )}
                      </td>
                      <td>{unit.assetItem?.name}</td>
                      <td>{unit.location?.name}</td>
                      <td>{label(options.conditions, unit.condition)}</td>
                      <td>{label(options.statuses, unit.status)}</td>
                      <td>{label(options.informationStatuses, unit.informationStatus)}</td>
                      <td>{unit.entry?.entryNumber || "-"}</td>
                      <td>{entryDocument(unit)?.documentNumber || "-"}</td>
                      <td>{lastMovement(unit)?.movementNumber || "-"}</td>
                      <td>{unit.possibleDuplicate ? "A verifier" : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : !hasFocusedFilter ? (
            <div className="summary-list park-summary-list">
              {familySummaries.map((group) => (
                <article className="summary-item park-summary-card" key={group.key}>
                  <p className="fact-line"><strong>{group.family}</strong><span>Total : {group.total}</span></p>
                  <p className="summary-meta">
                    Modeles : {group.models.slice(0, 5).map(([model, count]) => `${model} (${count})`).join(", ")}
                    {group.models.length > 5 ? "..." : ""}
                  </p>
                  <div className="location-grid">
                    {group.locations.slice(0, 12).map(([location, count]) => (
                      <p className="location-pair" key={location}><span>{location}</span><strong>{count}</strong></p>
                    ))}
                  </div>
                  {group.locations.length > 12 ? <p className="summary-meta">Autres emplacements disponibles apres filtrage.</p> : null}
                </article>
              ))}
              {!familySummaries.length ? <p className="summary">Choisissez une famille, une categorie ou un article pour afficher la synthese.</p> : null}
            </div>
          ) : (
            <div className="summary-list park-summary-list">
              {unitSummaries.map((group) => (
                <article className="summary-item park-summary-card" key={group.key}>
                  <p className="fact-line"><strong>{group.model}</strong><span>Total : {group.total}</span></p>
                  <div className="location-grid">
                    {group.locations.map(([location, count]) => (
                      <p className="location-pair" key={location}><span>{location}</span><strong>{count}</strong></p>
                    ))}
                  </div>
                  <p className="summary-meta">
                    Statuts : {group.statuses.map(([status, count]) => `${label(options.statuses, status)} (${count})`).join(", ")}
                  </p>
                  <p className="summary-meta">
                    Etats : {group.conditions.map(([condition, count]) => `${label(options.conditions, condition)} (${count})`).join(", ")}
                  </p>
                  <div className="form-actions">
                    <button className="secondary" type="button" onClick={() => showModelDetails(group.assetItemId)}>
                      Voir les biens
                    </button>
                  </div>
                </article>
              ))}
              {!unitSummaries.length ? <p className="summary">Aucun bien ne correspond aux filtres.</p> : null}
            </div>
          )}
        </section>

        {canWrite ? <aside className="panel park-entry-panel">
          <div className="park-panel-title">
            <h2>Nouvelle entree</h2>
            <p className="summary">Enregistrez un ou plusieurs biens physiques distincts.</p>
          </div>
          <form className="form" onSubmit={submitEntry}>
            <label>
              <span>Article / modele</span>
              <select required value={entry.assetItemId} onChange={(event) => setEntry({ ...entry, assetItemId: event.target.value, duplicateConfirmed: false, duplicateReason: "" })}>
                <option value="">Choisir</option>
                {options.assetItems.map((item) => (
                  <option key={item.id} value={item.id}>{assetItemOptionLabel(item)}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Quantite</span>
              <input min="1" required type="number" value={entry.quantity} onChange={(event) => setEntry({ ...entry, quantity: event.target.value, duplicateConfirmed: false, duplicateReason: "" })} />
            </label>
            <label>
              <span>Emplacement</span>
              <select required value={entry.locationId} onChange={(event) => setEntry({ ...entry, locationId: event.target.value, duplicateConfirmed: false, duplicateReason: "" })}>
                <option value="">Choisir</option>
                {options.locations.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
            </label>
            <label className="checkbox-row">
              <input type="checkbox" checked={entry.supplierKnown} onChange={(event) => setEntry({ ...entry, supplierKnown: event.target.checked, supplierId: "" })} />
              <span>Fournisseur connu</span>
            </label>
            {entry.supplierKnown ? (
              <label>
                <span>Fournisseur</span>
                <select value={entry.supplierId} onChange={(event) => setEntry({ ...entry, supplierId: event.target.value, duplicateConfirmed: false, duplicateReason: "" })}>
                  <option value="">Choisir</option>
                  {options.suppliers.map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </select>
              </label>
            ) : null}
            <label>
              <span>Type d'entree</span>
              <select value={entry.entryType} onChange={(event) => setEntry({ ...entry, entryType: event.target.value })}>
                {options.entryTypes.map((item) => (
                  <option key={item.code} value={item.code}>{item.label}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Date d'entree</span>
              <input required type="date" value={entry.entryDate} onChange={(event) => setEntry({ ...entry, entryDate: event.target.value })} />
            </label>
            <label>
              <span>Etat initial</span>
              <select value={entry.initialCondition} onChange={(event) => setEntry({ ...entry, initialCondition: event.target.value })}>
                {options.conditions.map((item) => (
                  <option key={item.code} value={item.code}>{item.label}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Statut initial</span>
              <select value={entry.initialStatus} onChange={(event) => setEntry({ ...entry, initialStatus: event.target.value })}>
                {options.statuses.map((item) => (
                  <option key={item.code} value={item.code}>{item.label}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Completude</span>
              <select value={entry.informationStatus} onChange={(event) => setEntry({ ...entry, informationStatus: event.target.value })}>
                {options.informationStatuses.map((item) => (
                  <option key={item.code} value={item.code}>{item.label}</option>
                ))}
              </select>
            </label>
            <label className="checkbox-row">
              <input type="checkbox" checked={entry.purchaseDateKnown} onChange={(event) => setEntry({ ...entry, purchaseDateKnown: event.target.checked, purchaseDate: "" })} />
              <span>Date d'achat connue</span>
            </label>
            {entry.purchaseDateKnown ? (
              <label>
                <span>Date d'achat</span>
                <input type="date" value={entry.purchaseDate} onChange={(event) => setEntry({ ...entry, purchaseDate: event.target.value })} />
              </label>
            ) : null}
            <label className="checkbox-row">
              <input type="checkbox" checked={entry.priceKnown} onChange={(event) => setEntry({ ...entry, priceKnown: event.target.checked, unitPrice: "", totalPrice: "" })} />
              <span>Prix connu</span>
            </label>
            {entry.priceKnown ? (
              <div className="split-fields">
                <label>
                  <span>Prix unitaire Ar</span>
                  <input type="number" min="0" value={entry.unitPrice} onChange={(event) => setEntry({ ...entry, unitPrice: event.target.value })} />
                </label>
                <label>
                  <span>Total Ar</span>
                  <input type="number" min="0" value={entry.totalPrice} onChange={(event) => setEntry({ ...entry, totalPrice: event.target.value })} />
                </label>
              </div>
            ) : null}
            <label className="checkbox-row">
              <input type="checkbox" checked={entry.invoiceAvailable} onChange={(event) => setEntry({ ...entry, invoiceAvailable: event.target.checked, invoiceReference: "" })} />
              <span>Facture disponible</span>
            </label>
            {entry.invoiceAvailable ? (
              <label>
                <span>Reference facture</span>
                <input value={entry.invoiceReference} onChange={(event) => setEntry({ ...entry, invoiceReference: event.target.value })} />
              </label>
            ) : null}
            {Number.parseInt(entry.quantity, 10) === 1 ? (
              <label>
                <span>Numero de serie</span>
                <input value={entry.serialNumber} onChange={(event) => setEntry({ ...entry, serialNumber: event.target.value, duplicateConfirmed: false, duplicateReason: "" })} />
              </label>
            ) : null}
            {duplicateAlert?.possibleDuplicate ? (
              <div className="warning-box">
                <strong>Biens similaires deja existants</strong>
                <ul className="compact-list">
                  {duplicateAlert.similarUnits.map((unit) => (
                    <li key={unit.id}>{unit.assetCode} - {unit.assetItem?.name} - {unit.location?.name}</li>
                  ))}
                </ul>
                <label className="checkbox-row">
                  <input type="checkbox" checked={entry.duplicateConfirmed} onChange={(event) => setEntry({ ...entry, duplicateConfirmed: event.target.checked })} />
                  <span>Je confirme qu'il s'agit d'un autre exemplaire physique</span>
                </label>
                <label>
                  <span>Motif de confirmation</span>
                  <textarea value={entry.duplicateReason} onChange={(event) => setEntry({ ...entry, duplicateReason: event.target.value })} />
                </label>
              </div>
            ) : null}
            {duplicateAlert?.serialDuplicateBlocked ? (
              <div className="warning-box">
                <strong>Numero de serie deja utilise</strong>
                <ul className="compact-list">
                  {duplicateAlert.serialDuplicates.map((unit) => (
                    <li key={unit.id}>{unit.assetCode} - {unit.assetItem?.name} - {unit.location?.name}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <label>
              <span>Notes</span>
              <textarea value={entry.notes} onChange={(event) => setEntry({ ...entry, notes: event.target.value })} />
            </label>
            {message ? <p className="form-message">{message}</p> : null}
            <button className="button" type="submit">Creer l'entree</button>
          </form>
        </aside> : null}
      </div>

      <div className="park-detail-grid detail-row">
        <section className="panel park-recent-panel">
          <div className="park-panel-title">
            <h2>Dernieres entrees</h2>
            <p className="summary">Controle rapide des dernieres creations progressives.</p>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Numero</th>
                  <th>Modele</th>
                  <th>Quantite</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {entries.slice(0, 8).map((item) => (
                  <tr key={item.id}>
                    <td>{item.entryNumber}</td>
                    <td>{item.assetItem?.name}</td>
                    <td>{item.quantity}</td>
                    <td>{label(options.entryStatuses, item.entryStatus)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="panel park-asset-card">
          <div className="park-panel-title">
            <h2>Fiche bien</h2>
            <p className="summary">Apercu rapide du bien selectionne. La fiche complete s'ouvre dans un ecran dedie.</p>
          </div>
          {selected ? (
            <article className="asset-preview-card">
              <div className="asset-preview-media">
                {primaryFile(selected) ? (
                  <AssetFileImage
                    alt={`Photo principale ${selected.assetCode}`}
                    file={primaryFile(selected)}
                  />
                ) : (
                  <div className="asset-photo-placeholder">Photo</div>
                )}
              </div>
              <div className="asset-preview-content">
                <p className="eyebrow">Bien selectionne</p>
                <h3>{selected.assetCode}</h3>
                <p className="asset-model-name">{selected.assetItem?.name}</p>
                <div className="asset-preview-grid">
                  <p><span>Emplacement actuel</span><strong>{selected.location?.name || "Non renseigne"}</strong></p>
                  <p><span>Etat</span><strong>{label(options.conditions, selected.condition)}</strong></p>
                  <p><span>Statut</span><strong>{label(options.statuses, selected.status)}</strong></p>
                  <p><span>Entree d'origine</span><strong>{selected.entry?.entryNumber || "Non renseignee"}</strong></p>
                  <p><span>Document d'entree</span><strong>{entryDocument(selected)?.documentNumber || "Non rattache"}</strong></p>
                  <p><span>Dernier mouvement</span><strong>{lastMovement(selected)?.movementNumber || "Aucun"}</strong></p>
                </div>
                <Link className="button" href={`/parc/${selected.id}`}>
                  Voir la fiche complete
                </Link>
              </div>
            </article>
          ) : (
            <p className="summary">Selectionner un bien dans la liste.</p>
          )}
        </aside>
      </div>
    </section>
  );
}
