"use client";

import { useEffect, useMemo, useState } from "react";
import ActionFeedback, { actionError, actionSuccess } from "@/app/components/action-feedback";

function today() {
  return new Date().toISOString().slice(0, 10);
}

function label(list, code) {
  return list.find((item) => item.code === code)?.label || code;
}

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("fr-FR");
}

function shortText(value, max = 46) {
  if (!value) return "";
  return value.length > max ? `${value.slice(0, max)}...` : value;
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

function statusClass(status) {
  if (status === "VALIDATED") return "validated";
  if (status === "DRAFT") return "draft";
  if (status === "CANCELLED") return "cancelled";
  return "muted";
}

const initialForm = {
  movementType: "ASSIGNMENT",
  movementDate: today(),
  reason: "",
  notes: "",
  selectedAssetIds: [],
  fromLocationId: "",
  categoryPath: [],
  assetItemId: "",
  toLocationId: "",
  relatedMovementId: ""
};

const RETURN_DEPARTURE_TYPES = {
  RETURN_FROM_LOAN_EVENT: "LOAN_EVENT",
  RETURN_FROM_WORKSHOP_REPAIR: "WORKSHOP_REPAIR"
};

export default function MovementManager({ canCreate = false, canManage = false, initialOptions = null, initialMovements = [] }) {
  const [options, setOptions] = useState(initialOptions);
  const [movements, setMovements] = useState(initialMovements);
  const [selectedMovement, setSelectedMovement] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [filters, setFilters] = useState({ q: "", status: "" });
  const [cancelReason, setCancelReason] = useState("");
  const [message, setMessage] = useState("");
  const [returnProposal, setReturnProposal] = useState("");

  async function loadData() {
    const [nextOptions, nextMovements] = await Promise.all([
      fetch("/api/asset-movement-options").then((response) => response.json()),
      fetch("/api/asset-movements").then((response) => response.json())
    ]);
    setOptions(nextOptions);
    setMovements(nextMovements.movements || []);
    setSelectedMovement((current) => {
      if (!current) return null;
      return (nextMovements.movements || []).find((item) => item.id === current.id) || null;
    });
  }

  useEffect(() => {
    loadData();
  }, []);

  const filteredUnits = useMemo(() => {
    if (!options) return [];
    const term = filters.q.trim().toLowerCase();
    const selectedCategoryId = form.categoryPath[form.categoryPath.length - 1] || "";
    const categoryIds = selectedCategoryId ? collectCategoryDescendants(options.assetCategories, selectedCategoryId) : [];
    return options.assetUnits.filter((unit) => {
      const matchesText =
        !term ||
        [unit.assetCode, unit.assetItem?.name, unit.location?.name]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term));
      const matchesLocation = !form.fromLocationId || unit.location?.id === form.fromLocationId;
      const matchesCategory = !selectedCategoryId || categoryIds.includes(unit.assetItem?.categoryId);
      const matchesItem = !form.assetItemId || unit.assetItem?.id === form.assetItemId;
      return matchesText && matchesLocation && matchesCategory && matchesItem;
    });
  }, [filters.q, form.assetItemId, form.categoryPath, form.fromLocationId, options]);

  const directSearchTerm = filters.q.trim().toLowerCase();
  const directSearchUnits = useMemo(() => {
    if (!options || !directSearchTerm) return [];
    return options.assetUnits.filter((unit) => unit.assetCode.toLowerCase().includes(directSearchTerm));
  }, [directSearchTerm, options]);

  const directExactUnit = useMemo(() => {
    if (!options || !directSearchTerm) return null;
    return options.assetUnits.find((unit) => unit.assetCode.toLowerCase() === directSearchTerm) || null;
  }, [directSearchTerm, options]);

  const displayedUnits = directSearchTerm ? directSearchUnits : filteredUnits;

  const visibleCategoryParentId = form.categoryPath[form.categoryPath.length - 1] || null;
  const visibleCategories = useMemo(() => {
    if (!options) return [];
    return options.assetCategories.filter((category) => (category.parentId || null) === visibleCategoryParentId);
  }, [options, visibleCategoryParentId]);

  const selectedCategory = form.categoryPath[form.categoryPath.length - 1] || "";
  const categoryScope = options && selectedCategory ? collectCategoryDescendants(options.assetCategories, selectedCategory) : [];
  const filteredItems = useMemo(() => {
    if (!options) return [];
    return options.assetItems.filter((item) => !selectedCategory || categoryScope.includes(item.categoryId));
  }, [categoryScope, options, selectedCategory]);

  const categoryBreadcrumb = useMemo(() => {
    if (!options) return [];
    return form.categoryPath
      .map((id) => options.assetCategories.find((category) => category.id === id))
      .filter(Boolean)
      .map((category) => category.name);
  }, [form.categoryPath, options]);

  const filteredMovements = useMemo(() => {
    return movements.filter((movement) => !filters.status || movement.movementStatus === filters.status);
  }, [filters.status, movements]);

  useEffect(() => {
    if (!options || !directSearchTerm) return;
    const exactUnit = options.assetUnits.find((unit) => unit.assetCode.toLowerCase() === directSearchTerm);
    if (!exactUnit?.location?.id || form.fromLocationId === exactUnit.location.id) return;
    setForm((current) => ({
      ...current,
      fromLocationId: exactUnit.location.id,
      categoryPath: [],
      assetItemId: ""
    }));
  }, [directSearchTerm, form.fromLocationId, options]);

  useEffect(() => {
    const departureType = RETURN_DEPARTURE_TYPES[form.movementType];
    if (!departureType || form.selectedAssetIds.length !== 1) {
      setReturnProposal("");
      if (!departureType) {
        setForm((current) => (current.relatedMovementId ? { ...current, relatedMovementId: "" } : current));
      }
      return;
    }

    const assetUnitId = form.selectedAssetIds[0];
    const activeReturns = new Set(
      movements
        .filter((movement) => movement.relatedMovementId && movement.movementStatus !== "CANCELLED")
        .map((movement) => movement.relatedMovementId)
    );
    const candidates = movements
      .filter(
        (movement) =>
          movement.movementType === departureType &&
          movement.movementStatus === "VALIDATED" &&
          !activeReturns.has(movement.id) &&
          movement.lines?.some((line) => line.assetUnitId === assetUnitId)
      )
      .sort((a, b) => new Date(b.validatedAt || b.movementDate).getTime() - new Date(a.validatedAt || a.movementDate).getTime());

    const departure = candidates[0];
    if (!departure) {
      setReturnProposal("Aucun mouvement de depart correspondant trouve. Choisissez manuellement l'emplacement d'arrivee.");
      setForm((current) => (current.relatedMovementId ? { ...current, relatedMovementId: "" } : current));
      return;
    }

    const line = departure.lines.find((item) => item.assetUnitId === assetUnitId);
    const proposedLocationId = line?.fromLocationId || "";
    const proposedLocationName = line?.fromLocation?.name || "emplacement d'origine";
    setReturnProposal(`Retour propose vers l'emplacement d'origine : ${proposedLocationName}.`);
    setForm((current) => ({
      ...current,
      toLocationId: current.relatedMovementId === departure.id && current.toLocationId ? current.toLocationId : proposedLocationId,
      relatedMovementId: departure.id
    }));
  }, [form.movementType, form.selectedAssetIds, movements]);

  function toggleAsset(assetId) {
    const unit = options?.assetUnits.find((item) => item.id === assetId);
    setForm((current) => ({
      ...current,
      fromLocationId:
        !current.selectedAssetIds.includes(assetId) && unit?.location?.id
          ? unit.location.id
          : current.fromLocationId,
      selectedAssetIds: current.selectedAssetIds.includes(assetId)
        ? current.selectedAssetIds.filter((id) => id !== assetId)
        : [...current.selectedAssetIds, assetId]
    }));
  }

  function chooseCategory(categoryId) {
    setForm((current) => ({
      ...current,
      categoryPath: [...current.categoryPath, categoryId],
      assetItemId: "",
      selectedAssetIds: []
    }));
  }

  function resetCategory() {
    setForm((current) => ({ ...current, categoryPath: [], assetItemId: "", selectedAssetIds: [] }));
  }

  async function createMovement(event) {
    event.preventDefault();
    setMessage("");
    if (!form.toLocationId || form.selectedAssetIds.length === 0) {
      setMessage("Selectionner au moins un bien et un emplacement d'arrivee.");
      return;
    }

    const response = await fetch("/api/asset-movements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        movementType: form.movementType,
        movementDate: form.movementDate,
        reason: form.reason,
        notes: form.notes,
        relatedMovementId: form.relatedMovementId || null,
        lines: form.selectedAssetIds.map((assetUnitId) => ({
          assetUnitId,
          toLocationId: form.toLocationId
        }))
      })
    });
    const result = await response.json();
    if (!response.ok) {
      setMessage(actionError(result.error || "Création impossible."));
      return;
    }
    setMessage(actionSuccess({ title: "Brouillon créé", message: "Le mouvement est visible dans la liste et peut maintenant être validé.", item: "Mouvement", code: result.movement.movementNumber, status: "Brouillon", details: [{ label: "Biens", value: result.movement.lines?.length || form.selectedAssetIds.length }], action: { label: "Voir le mouvement", onClick: () => setSelectedMovement(result.movement) } }));
    setForm(initialForm);
    await loadData();
    setSelectedMovement(result.movement);
  }

  async function validateMovement() {
    if (!selectedMovement) return;
    setMessage("");
    const response = await fetch(`/api/asset-movements/${selectedMovement.id}/validate`, { method: "POST" });
    const result = await response.json();
    if (!response.ok) {
      setMessage(actionError(result.error || "Validation impossible."));
      return;
    }
    setMessage(actionSuccess({ title: "Mouvement validé", message: "Les emplacements concernés ont été actualisés.", item: "Mouvement", code: result.movement.movementNumber, status: "Validé", action: { label: "Voir le mouvement", onClick: () => setSelectedMovement(result.movement) } }));
    await loadData();
  }

  async function cancelMovement() {
    if (!selectedMovement) return;
    setMessage("");
    const response = await fetch(`/api/asset-movements/${selectedMovement.id}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: cancelReason })
    });
    const result = await response.json();
    if (!response.ok) {
      setMessage(actionError(result.error || "Annulation impossible."));
      return;
    }
    setMessage(actionSuccess({ title: "Mouvement annulé", message: "Le statut a été actualisé dans la liste.", item: "Mouvement", code: result.movement.movementNumber, status: "Annulé", action: { label: "Voir le mouvement", onClick: () => setSelectedMovement(result.movement) } }));
    setCancelReason("");
    await loadData();
  }

  if (!options) return <p className="summary">Chargement des mouvements...</p>;

  return (
    <section className="reference-layout">
      <ActionFeedback feedback={message} onClose={() => setMessage("")} />
      <div className="reference-grid wide">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Liste des mouvements</h2>
              <p className="summary">Suivez les brouillons, mouvements valides et mouvements annules.</p>
            </div>
            <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
              <option value="">Tous les statuts</option>
              {options.movementStatuses.map((status) => (
                <option key={status.code} value={status.code}>{status.label}</option>
              ))}
            </select>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Numero</th>
                  <th>Type</th>
                  <th>Date</th>
                  <th>Statut</th>
                  <th>Motif / probleme</th>
                  <th>Lignes</th>
                </tr>
              </thead>
              <tbody>
                {filteredMovements.map((movement) => (
                  <tr key={movement.id} onClick={() => setSelectedMovement(movement)}>
                    <td>{movement.movementNumber}</td>
                    <td>{label(options.movementTypes, movement.movementType)}</td>
                    <td>{formatDate(movement.movementDate)}</td>
                    <td>
                      <span className={`status-badge ${statusClass(movement.movementStatus)}`}>
                        {label(options.movementStatuses, movement.movementStatus)}
                      </span>
                    </td>
                    <td>{shortText(movement.notes || movement.reason)}</td>
                    <td>{movement.lines?.length || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {canCreate ? <aside className="panel">
          <h2>Nouveau mouvement</h2>
          <p className="summary">Le brouillon n'applique aucun changement d'emplacement avant validation.</p>
          <form className="form" onSubmit={createMovement}>
            <label>
              <span>Type</span>
              <select value={form.movementType} onChange={(event) => setForm({ ...form, movementType: event.target.value })}>
                {options.activeMovementTypes.map((type) => (
                  <option key={type.code} value={type.code}>{type.label}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Date</span>
              <input type="date" value={form.movementDate} onChange={(event) => setForm({ ...form, movementDate: event.target.value })} />
            </label>
            <label>
              <span>Emplacement de depart</span>
              <select value={form.fromLocationId} onChange={(event) => setForm({ ...form, fromLocationId: event.target.value, selectedAssetIds: [] })}>
                <option value="">Choisir</option>
                {options.locations.map((location) => (
                  <option key={location.id} value={location.id}>{location.name}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Emplacement d'arrivee</span>
              <select value={form.toLocationId} onChange={(event) => setForm({ ...form, toLocationId: event.target.value })}>
                <option value="">Choisir</option>
                {options.locations.map((location) => (
                  <option key={location.id} value={location.id}>{location.name}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Motif</span>
              <input value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} />
            </label>
            <label>
              <span>Explication du mouvement</span>
              <textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
            </label>
            {returnProposal ? <p className="form-message">{returnProposal}</p> : null}
            <button className="button" type="submit">Creer le brouillon</button>
          </form>
        </aside> : null}
      </div>

      <div className="reference-grid detail-row">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Biens a deplacer</h2>
              <p className="summary">Cherchez par code ou filtrez par emplacement, categorie et article.</p>
            </div>
            <input
              placeholder="Code du bien ou recherche partielle"
              value={filters.q}
              onChange={(event) => setFilters({ ...filters, q: event.target.value })}
            />
          </div>
          {directSearchTerm ? (
            <div className="info-box">
              <strong>Recherche directe par code</strong>
              {directExactUnit && directSearchUnits.length === 1 ? (
                <p>Bien trouve. Cochez la ligne pour l'ajouter au mouvement.</p>
              ) : directSearchUnits.length ? (
                <p>
                  {directSearchUnits.length} bien(s) trouve(s). Le bien exact renseigne automatiquement son emplacement actuel comme depart.
                </p>
              ) : (
                <p>Aucun bien trouve avec ce code.</p>
              )}
            </div>
          ) : null}
          <div className="filter-stack">
            <label>
              <span>Emplacement de depart</span>
              <select value={form.fromLocationId} onChange={(event) => setForm({ ...form, fromLocationId: event.target.value, selectedAssetIds: [] })}>
                <option value="">Choisir un emplacement</option>
                {options.locations.map((location) => (
                  <option key={location.id} value={location.id}>{location.name}</option>
                ))}
              </select>
            </label>
            <div>
              <p className="fact-line"><span>Categorie</span><strong>{categoryBreadcrumb.join(" > ") || "Toutes"}</strong></p>
              <div className="row-actions">
                {form.categoryPath.length > 0 ? <button className="secondary" type="button" onClick={resetCategory}>Revenir aux familles</button> : null}
                {visibleCategories.map((category) => (
                  <button className="secondary" key={category.id} type="button" onClick={() => chooseCategory(category.id)}>
                    {category.name}
                  </button>
                ))}
              </div>
            </div>
            <label>
              <span>Article / modele</span>
              <select value={form.assetItemId} onChange={(event) => setForm({ ...form, assetItemId: event.target.value, selectedAssetIds: [] })}>
                <option value="">Tous les articles</option>
                {filteredItems.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th></th>
                  <th>Code</th>
                  <th>Modele</th>
                  <th>Emplacement actuel</th>
                </tr>
              </thead>
              <tbody>
                {form.fromLocationId || directSearchTerm ? displayedUnits.map((unit) => (
                  <tr key={unit.id}>
                    <td>
                      <input
                        aria-label={`Selection ${unit.assetCode}`}
                        checked={form.selectedAssetIds.includes(unit.id)}
                        type="checkbox"
                        onChange={() => toggleAsset(unit.id)}
                      />
                    </td>
                    <td>{unit.assetCode}</td>
                    <td>{unit.assetItem?.name}</td>
                    <td>{unit.location?.name}</td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan="4">Choisir un emplacement de depart ou saisir directement le code du bien.</td>
                  </tr>
                )}
                {(form.fromLocationId || directSearchTerm) && displayedUnits.length === 0 ? (
                  <tr>
                    <td colSpan="4">{directSearchTerm ? "Aucun bien trouve avec ce code." : "Aucun bien dans cette selection."}</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="panel">
          <h2>Fiche mouvement</h2>
          {selectedMovement ? (
            <div className="document-detail">
              <div className="document-card-head">
                <div>
                  <p className="eyebrow">Numero</p>
                  <h2>{selectedMovement.movementNumber}</h2>
                </div>
                <span className={`status-badge ${statusClass(selectedMovement.movementStatus)}`}>
                  {label(options.movementStatuses, selectedMovement.movementStatus)}
                </span>
              </div>
              <div className="detail-cards two">
                <div className="info-box">
                  <strong>Definition du mouvement</strong>
                  <p className="fact-line"><span>Type</span><strong>{label(options.movementTypes, selectedMovement.movementType)}</strong></p>
                  <p className="fact-line"><span>Date</span><strong>{formatDate(selectedMovement.movementDate)}</strong></p>
                  <p className="fact-line"><span>Motif court</span><strong>{selectedMovement.reason}</strong></p>
                </div>
                <div className="info-box">
                  <strong>Validation</strong>
                  <p className="fact-line"><span>Cree par</span><strong>{selectedMovement.createdById || "Non renseigne"}</strong></p>
                  <p className="fact-line"><span>Valide par</span><strong>{selectedMovement.validatedById || "Non valide"}</strong></p>
                  <p className="fact-line"><span>Date validation</span><strong>{formatDate(selectedMovement.validatedAt) || "Non valide"}</strong></p>
                </div>
              </div>
              {selectedMovement.relatedMovement ? (
                <p className="fact-line">
                  <span>Mouvement de depart lie</span>
                  <strong>{selectedMovement.relatedMovement.movementNumber}</strong>
                </p>
              ) : null}
              <div className="info-box">
                <strong>Explication du mouvement</strong>
                <p>{selectedMovement.notes || "Non renseignee."}</p>
              </div>
              {selectedMovement.movementStatus === "VALIDATED" ? (
                <p className="locked-note">
                  Mouvement valide : emplacement mis a jour et fiche verrouillee. Annulation indisponible tant que la validation Direction par code personnel n'est pas active.
                </p>
              ) : null}
              {selectedMovement.movementStatus === "CANCELLED" ? (
                <div className="warning-box">
                  <strong>Mouvement annule</strong>
                  <p className="fact-line"><span>Date</span><strong>{formatDate(selectedMovement.cancelledAt)}</strong></p>
                  <p>{selectedMovement.cancellationReason || "Motif non renseigne."}</p>
                </div>
              ) : null}
              <h3>Lignes</h3>
              <ul className="compact-list">
                {selectedMovement.lines?.map((line) => (
                  <li key={line.id}>
                    {line.assetUnit?.assetCode} - {line.fromLocation?.name} vers {line.toLocation?.name}
                  </li>
                ))}
              </ul>
              {canManage && selectedMovement.movementStatus === "DRAFT" ? (
                <div className="form-actions">
                  <button type="button" onClick={validateMovement}>Valider</button>
                </div>
              ) : null}
              {canManage && selectedMovement.movementStatus === "DRAFT" ? (
                <div className="form cancel-box">
                  <label>
                    <span>Motif d'annulation</span>
                    <textarea value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} />
                  </label>
                  <button className="secondary" type="button" onClick={cancelMovement}>Annuler le mouvement</button>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="summary">Selectionner un mouvement dans la liste.</p>
          )}
        </aside>
      </div>
    </section>
  );
}
