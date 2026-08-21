"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import ActionFeedback, { actionError, actionSuccess } from "@/app/components/action-feedback";
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

const initialEquipmentSetForm = { code: "", name: "", description: "", locationId: "" };
const initialEquipmentComponentForm = { equipmentSetId: "", type: "INDIVIDUAL", assetUnitId: "", stockPositionId: "", quantity: 1, notes: "" };

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

export default function AssetPark({ canWrite = false, initialOptions = null, initialUnits = [], initialEntries = [], initialQuantitativeStocks = [], initialEquipmentSets = [] }) {
  const [options, setOptions] = useState(initialOptions);
  const [units, setUnits] = useState(initialUnits);
  const [entries, setEntries] = useState(initialEntries);
  const [quantitativeStocks, setQuantitativeStocks] = useState(initialQuantitativeStocks);
  const [equipmentSets, setEquipmentSets] = useState(initialEquipmentSets);
  const [equipmentSetForm, setEquipmentSetForm] = useState(initialEquipmentSetForm);
  const [equipmentComponentForm, setEquipmentComponentForm] = useState(initialEquipmentComponentForm);
  const [transfer, setTransfer] = useState(null);
  const [individualization, setIndividualization] = useState(null);
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
    const [nextOptions, nextUnits, nextEntries, nextStocks, nextEquipmentSets] = await Promise.all([
      fetch("/api/asset-options").then((response) => response.json()),
      fetch("/api/asset-units").then((response) => response.json()),
      fetch("/api/asset-entries").then((response) => response.json()),
      fetch("/api/quantitative-stock-positions").then((response) => response.json()),
      fetch("/api/equipment-sets").then((response) => response.json())
    ]);
    setOptions(nextOptions);
    setUnits(nextUnits.units || []);
    setEntries(nextEntries.entries || []);
    setQuantitativeStocks(nextStocks.positions || []);
    setEquipmentSets(nextEquipmentSets.equipmentSets || []);
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
      setMessage(actionError(result.error || "Ajout du fichier impossible."));
      return;
    }
    setMessage(actionSuccess({ title: "Fichier ajouté", message: "Le fichier est maintenant visible sur la fiche du bien.", item: selected?.assetItem?.name || "Bien", code: selected?.assetCode, status: "Disponible", action: { label: "Ouvrir la fiche", href: selected ? `/parc/${selected.id}` : "/parc" } }));
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
      setMessage(actionError(result.error || "Photo principale impossible."));
      return;
    }
    setMessage(actionSuccess({ title: "Photo principale définie", message: "La fiche affiche maintenant cette image en priorité.", item: selected?.assetItem?.name || "Bien", code: selected?.assetCode, status: "Photo principale", action: { label: "Ouvrir la fiche", href: selected ? `/parc/${selected.id}` : "/parc" } }));
    await loadData();
  }

  async function deleteAssetFile(fileId) {
    setMessage("");
    const response = await fetch(`/api/asset-files/${fileId}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok) {
      setMessage(actionError(result.error || "Suppression impossible."));
      return;
    }
    setMessage(actionSuccess({ title: "Fichier supprimé", message: "Le fichier reste tracé mais n'est plus visible parmi les fichiers actifs.", item: selected?.assetItem?.name || "Bien", code: selected?.assetCode, status: "Supprimé", action: { label: "Ouvrir la fiche", href: selected ? `/parc/${selected.id}` : "/parc" } }));
    await loadData();
  }

  async function submitEntry(event) {
    event.preventDefault();
    setMessage("");
    setDuplicateAlert(null);
    const selectedAssetItem = options.assetItems.find((item) => item.id === entry.assetItemId);
    const trackingMode = selectedAssetItem?.category?.trackingMode || "I";
    if (trackingMode === "E") {
      setMessage("TRACKING_MODE_NOT_OPERATIONAL");
      return;
    }
    const duplicateParams = new URLSearchParams({
      assetItemId: entry.assetItemId,
      locationId: entry.locationId
    });
    if (entry.supplierKnown && entry.supplierId) duplicateParams.set("supplierId", entry.supplierId);
    if (entry.serialNumber) duplicateParams.set("serialNumber", entry.serialNumber);

    if (trackingMode === "I") {
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
    }

    const payload = {
      ...entry,
      quantity: ["Q", "QI"].includes(trackingMode) ? entry.quantity : Number.parseInt(entry.quantity, 10),
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
      setMessage(actionError(result.error || "Création impossible."));
      return;
    }

    const entryLocation = options.locations.find((item) => item.id === entry.locationId)?.name || "Emplacement renseigné";
    setMessage(actionSuccess({
      title: ["Q", "QI"].includes(trackingMode) ? "Entrée quantitative créée" : "Entrée individuelle créée",
      message: "La nouvelle entrée est visible dans le Parc physique.",
      item: selectedAssetItem?.name || "Référence matériel",
      code: result.entry.entryNumber,
      status: "Validée",
      details: [{ label: "Quantité", value: result.entry.quantity }, { label: "Emplacement", value: entryLocation }],
      action: { label: "Voir dans la liste", onClick: () => setFilters((current) => ({ ...current, assetItemId: result.entry.assetItemId })) }
    }));
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
      setMessage(actionError(result.error || "Modification impossible."));
      return;
    }

    setMessage(actionSuccess({ title: "Bien mis à jour", message: "La fiche et la liste affichent les nouvelles informations.", item: result.unit.assetItem?.name || selected.assetItem?.name || "Bien", code: result.unit.assetCode, status: label(options.statuses, result.unit.status), action: { label: "Ouvrir la fiche", href: `/parc/${result.unit.id}` } }));
    await loadData();
  }

  async function submitQuantitativeTransfer(event) {
    event.preventDefault();
    if (!transfer) return;
    setMessage("");
    const response = await fetch("/api/quantitative-stock-transfers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assetEntryId: transfer.assetEntryId,
        fromLocationId: transfer.fromLocationId,
        toLocationId: transfer.toLocationId,
        quantity: transfer.quantity,
        reason: transfer.reason,
        notes: transfer.notes
      })
    });
    const result = await response.json();
    if (!response.ok) {
      setMessage(actionError(result.error || "Transfert impossible."));
      return;
    }
    setMessage(actionSuccess({ title: "Transfert quantitatif enregistré", message: "Les positions source et destination ont été actualisées.", item: transfer.itemName, code: transfer.entryNumber, status: "Transféré", details: [{ label: "Quantité", value: result.transferredQuantity }, { label: "Destination", value: options.locations.find((item) => item.id === transfer.toLocationId)?.name || "Emplacement choisi" }], action: { label: "Voir les stocks", onClick: () => setTransfer(null) } }));
    setTransfer(null);
    await loadData();
  }

  async function submitIndividualization(event) {
    event.preventDefault();
    if (!individualization) return;
    setMessage("");
    const response = await fetch("/api/quantitative-stock-individualizations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assetEntryId: individualization.assetEntryId,
        locationId: individualization.locationId,
        quantity: individualization.quantity
      })
    });
    const result = await response.json();
    if (!response.ok) {
      setMessage(actionError(result.error || "Individualisation impossible."));
      return;
    }
    setMessage(actionSuccess({ title: "Individualisation terminée", message: "Les nouveaux biens sont visibles dans la liste des biens individualisés.", item: individualization.itemName, code: individualization.entryNumber, status: "Individualisé", details: [{ label: "Quantité", value: result.individualizedQuantity }, { label: "Emplacement", value: individualization.locationName }], action: { label: "Voir les biens", onClick: () => setShowDetails(true) } }));
    setIndividualization(null);
    await loadData();
  }

  async function submitEquipmentSet(event) {
    event.preventDefault();
    setMessage("");
    const response = await fetch("/api/equipment-sets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(equipmentSetForm)
    });
    const result = await response.json();
    if (!response.ok) {
      setMessage(actionError(result.error || "Création de l'ensemble impossible."));
      return;
    }
    setMessage(actionSuccess({ title: "Ensemble installé créé", message: "Vous pouvez maintenant lui ajouter des composants.", item: result.equipmentSet.name, code: result.equipmentSet.code, status: "Brouillon", details: [{ label: "Emplacement", value: options.locations.find((item) => item.id === result.equipmentSet.locationId)?.name || "Emplacement choisi" }] }));
    setEquipmentSetForm(initialEquipmentSetForm);
    await loadData();
  }

  async function submitEquipmentComponent(event) {
    event.preventDefault();
    setMessage("");
    const position = quantitativeStocks.find((item) => item.id === equipmentComponentForm.stockPositionId);
    const payload = equipmentComponentForm.type === "INDIVIDUAL"
      ? { assetUnitId: equipmentComponentForm.assetUnitId, quantity: 1, notes: equipmentComponentForm.notes }
      : { assetEntryId: position?.assetEntry?.id, sourceLocationId: position?.location?.id, quantity: equipmentComponentForm.quantity, notes: equipmentComponentForm.notes };
    const response = await fetch(`/api/equipment-sets/${equipmentComponentForm.equipmentSetId}/components`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok) {
      setMessage(actionError(result.error || "Ajout du composant impossible."));
      return;
    }
    setMessage(actionSuccess({ title: "Composant ajouté", message: "La composition est mise à jour sans modifier le patrimoine ni le stock.", item: selectedEquipmentSet?.name || "Ensemble installé", code: selectedEquipmentSet?.code, status: "Composant actif", action: { label: "Voir l'ensemble", onClick: () => setEquipmentComponentForm((current) => ({ ...current, equipmentSetId: selectedEquipmentSet?.id || "" })) } }));
    setEquipmentComponentForm(initialEquipmentComponentForm);
    await loadData();
  }

  async function disableEquipmentSetFromUi(id) {
    if (!window.confirm("Désactiver logiquement cet ensemble ?")) return;
    setMessage("");
    const response = await fetch(`/api/equipment-sets/${id}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok) {
      setMessage(actionError(result.error || "Désactivation impossible."));
      return;
    }
    setMessage(actionSuccess({ title: "Ensemble désactivé", message: "L'ensemble reste conservé dans l'historique.", item: result.equipmentSet.name, code: result.equipmentSet.code, status: "Désactivé" }));
    await loadData();
  }

  if (!options) {
    return <p className="summary">Chargement du parc physique...</p>;
  }

  const selectedEntryItem = options.assetItems.find((item) => item.id === entry.assetItemId);
  const selectedTrackingMode = selectedEntryItem?.category?.trackingMode || "I";
  const selectedEquipmentSet = equipmentSets.find((item) => item.id === equipmentComponentForm.equipmentSetId);
  const usedAssetUnitIds = new Set(equipmentSets.flatMap((item) => item.components || []).map((component) => component.assetUnitId).filter(Boolean));
  const compatibleEquipmentUnits = selectedEquipmentSet
    ? units.filter((unit) => unit.location?.id === selectedEquipmentSet.locationId && !unit.deletedAt && unit.status !== "RETIRED" && !usedAssetUnitIds.has(unit.id))
    : [];
  const compatibleEquipmentStocks = selectedEquipmentSet
    ? quantitativeStocks.filter((position) => position.location?.id === selectedEquipmentSet.locationId && position.availableQuantity > 0)
    : [];

  return (
    <section className="reference-layout park-layout">
      <ActionFeedback feedback={message} onClose={() => setMessage("")} />
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
            <p className="summary">Enregistrez des biens individuels ou une entrée suivie en quantité.</p>
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
            {entry.assetItemId ? (
              <div className={["Q", "QI"].includes(selectedTrackingMode) ? "info-box" : "warning-box"}>
                {selectedTrackingMode === "I" ? "Suivi individuel : chaque exemplaire sera individualisé." : null}
                {selectedTrackingMode === "Q" ? "Suivi en quantité : aucune unité individuelle ne sera créée." : null}
                {selectedTrackingMode === "QI" ? "Suivi en quantité individualisable : aucune unité ne sera créée automatiquement." : null}
                {selectedTrackingMode === "E" ? "Ensemble / kit — bientôt disponible." : null}
              </div>
            ) : null}
            <label>
              <span>Quantite</span>
              <input min="1" step="1" required type="number" value={entry.quantity} onChange={(event) => setEntry({ ...entry, quantity: event.target.value, duplicateConfirmed: false, duplicateReason: "" })} />
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
            {selectedTrackingMode === "I" && Number.parseInt(entry.quantity, 10) === 1 ? (
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
            <button className="button" type="submit" disabled={selectedTrackingMode === "E"}>Creer l'entree</button>
          </form>
        </aside> : null}
      </div>

      <section className="panel park-recent-panel">
        <div className="park-panel-title">
          <h2>Stocks quantitatifs</h2>
          <p className="summary">Lots suivis en quantité, distincts des biens individualisés.</p>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Référence</th><th>Famille</th><th>Mode</th><th>Lot</th><th>Emplacement</th><th>Disponible</th><th>Acquise</th><th>Fournisseur</th><th>Date</th><th>Prix</th>{canWrite ? <th>Action</th> : null}</tr></thead>
            <tbody>
              {quantitativeStocks.map((position) => {
                const item = position.assetEntry?.assetItem;
                const family = item?.category;
                return <tr key={position.id}>
                  <td>{item?.name || "-"}</td><td>{family?.name || "-"}</td><td>{family?.trackingMode === "QI" ? "Quantité individualisable" : "Quantité"}</td><td>{position.assetEntry?.entryNumber || "-"}</td>
                  <td>{position.location?.name || "-"}</td><td>{position.availableQuantity}</td><td>{position.assetEntry?.quantity}</td>
                  <td>{position.assetEntry?.supplier?.name || "-"}</td><td>{position.assetEntry?.entryDate ? String(position.assetEntry.entryDate).slice(0, 10) : "-"}</td>
                  <td>{position.assetEntry?.priceKnown ? (position.assetEntry.totalPrice ?? position.assetEntry.unitPrice ?? "-") : "-"}</td>
                  {canWrite ? <td>
                    {family?.trackingMode === "Q" ? <button className="secondary" type="button" disabled={position.availableQuantity <= 0} onClick={() => { setIndividualization(null); setTransfer({ assetEntryId: position.assetEntry.id, entryNumber: position.assetEntry.entryNumber, itemName: item?.name || "Référence", fromLocationId: position.location.id, fromLocationName: position.location.name, availableQuantity: position.availableQuantity, toLocationId: "", quantity: 1, reason: "Transfert interne", notes: "" }); }}>Transférer</button> : null}
                    {family?.trackingMode === "QI" ? <button className="secondary" type="button" disabled={position.availableQuantity <= 0} onClick={() => { setTransfer(null); setIndividualization({ assetEntryId: position.assetEntry.id, entryNumber: position.assetEntry.entryNumber, itemName: item?.name || "Référence", locationId: position.location.id, locationName: position.location.name, availableQuantity: position.availableQuantity, quantity: 1 }); }}>Individualiser</button> : null}
                  </td> : null}
                </tr>;
              })}
              {!quantitativeStocks.length ? <tr><td colSpan={canWrite ? 11 : 10}>Aucun stock quantitatif enregistré.</td></tr> : null}
            </tbody>
          </table>
        </div>
        {transfer ? <form className="form" onSubmit={submitQuantitativeTransfer}>
          <div className="info-box"><strong>{transfer.itemName} — {transfer.entryNumber}</strong><p>Source : {transfer.fromLocationName} · Disponible : {transfer.availableQuantity}</p></div>
          <label><span>Destination</span><select required value={transfer.toLocationId} onChange={(event) => setTransfer({ ...transfer, toLocationId: event.target.value })}><option value="">Choisir</option>{options.locations.filter((location) => location.id !== transfer.fromLocationId).map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
          <label><span>Quantité</span><input required type="number" min="1" step="1" max={transfer.availableQuantity} value={transfer.quantity} onChange={(event) => setTransfer({ ...transfer, quantity: event.target.value })} /></label>
          <label><span>Motif</span><input required value={transfer.reason} onChange={(event) => setTransfer({ ...transfer, reason: event.target.value })} /></label>
          <label><span>Notes</span><textarea value={transfer.notes} onChange={(event) => setTransfer({ ...transfer, notes: event.target.value })} /></label>
          <div className="form-actions"><button className="button" type="submit">Confirmer le transfert</button><button className="secondary" type="button" onClick={() => setTransfer(null)}>Annuler</button></div>
        </form> : null}
        {individualization ? <form className="form" onSubmit={submitIndividualization}>
          <div className="info-box"><strong>{individualization.itemName} — {individualization.entryNumber}</strong><p>Emplacement : {individualization.locationName} · Disponible : {individualization.availableQuantity}</p></div>
          <label><span>Quantité à individualiser</span><input required type="number" min="1" step="1" max={individualization.availableQuantity} value={individualization.quantity} onChange={(event) => setIndividualization({ ...individualization, quantity: event.target.value })} /></label>
          <div className="form-actions"><button className="button" type="submit">Confirmer l'individualisation</button><button className="secondary" type="button" onClick={() => setIndividualization(null)}>Annuler</button></div>
        </form> : null}
      </section>

      <section className="panel park-recent-panel">
        <div className="park-panel-title">
          <h2>Ensembles installés</h2>
          <p className="summary">Composition logique de patrimoines existants, sans création ni réservation de stock.</p>
        </div>
        <div className="summary-list park-summary-list">
          {equipmentSets.map((equipmentSet) => (
            <article className="summary-item park-summary-card" key={equipmentSet.id}>
              <p className="fact-line"><strong>{equipmentSet.code} — {equipmentSet.name}</strong><span>{equipmentSet.status}</span></p>
              <p className="summary-meta">Emplacement : {equipmentSet.location?.name || "-"}</p>
              {equipmentSet.description ? <p className="summary-meta">{equipmentSet.description}</p> : null}
              <ul className="compact-list">
                {(equipmentSet.components || []).map((component) => (
                  <li key={component.id}>
                    {component.assetUnit
                      ? `${component.assetUnit.assetCode} — ${component.assetUnit.assetItem?.name || "Unité individuelle"}`
                      : `${component.assetEntry?.assetItem?.name || "Lot quantitatif"} — ${component.assetEntry?.entryNumber || "Lot"} — quantité ${component.quantity}`}
                  </li>
                ))}
              </ul>
              {!equipmentSet.components?.length ? <p className="summary-meta">Aucun composant.</p> : null}
              {canWrite ? <div className="form-actions"><button className="secondary" type="button" onClick={() => disableEquipmentSetFromUi(equipmentSet.id)}>Désactiver</button></div> : null}
            </article>
          ))}
          {!equipmentSets.length ? <p className="summary">Aucun ensemble installé actif.</p> : null}
        </div>

        {canWrite ? <div className="park-detail-grid detail-row">
          <form className="form" onSubmit={submitEquipmentSet}>
            <h3>Créer un ensemble</h3>
            <label><span>Code</span><input required value={equipmentSetForm.code} onChange={(event) => setEquipmentSetForm({ ...equipmentSetForm, code: event.target.value })} /></label>
            <label><span>Nom</span><input required value={equipmentSetForm.name} onChange={(event) => setEquipmentSetForm({ ...equipmentSetForm, name: event.target.value })} /></label>
            <label><span>Emplacement</span><select required value={equipmentSetForm.locationId} onChange={(event) => setEquipmentSetForm({ ...equipmentSetForm, locationId: event.target.value })}><option value="">Choisir</option>{options.locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
            <label><span>Description</span><textarea value={equipmentSetForm.description} onChange={(event) => setEquipmentSetForm({ ...equipmentSetForm, description: event.target.value })} /></label>
            <button className="button" type="submit">Créer l'ensemble</button>
          </form>

          <form className="form" onSubmit={submitEquipmentComponent}>
            <h3>Ajouter un composant</h3>
            <div className="info-box">Un composant quantitatif est descriptif : il ne réserve et ne décrémente pas le stock.</div>
            <label><span>Ensemble</span><select required value={equipmentComponentForm.equipmentSetId} onChange={(event) => setEquipmentComponentForm({ ...initialEquipmentComponentForm, equipmentSetId: event.target.value })}><option value="">Choisir</option>{equipmentSets.map((item) => <option key={item.id} value={item.id}>{item.code} — {item.name}</option>)}</select></label>
            <label><span>Type</span><select value={equipmentComponentForm.type} onChange={(event) => setEquipmentComponentForm({ ...equipmentComponentForm, type: event.target.value, assetUnitId: "", stockPositionId: "", quantity: 1 })}><option value="INDIVIDUAL">Unité individuelle</option><option value="QUANTITATIVE">Quantité d'un lot</option></select></label>
            {equipmentComponentForm.type === "INDIVIDUAL" ? <label><span>Bien individuel compatible</span><select required value={equipmentComponentForm.assetUnitId} onChange={(event) => setEquipmentComponentForm({ ...equipmentComponentForm, assetUnitId: event.target.value })}><option value="">Choisir</option>{compatibleEquipmentUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.assetCode} — {unit.assetItem?.name}</option>)}</select></label> : <>
              <label><span>Lot quantitatif au même emplacement</span><select required value={equipmentComponentForm.stockPositionId} onChange={(event) => setEquipmentComponentForm({ ...equipmentComponentForm, stockPositionId: event.target.value })}><option value="">Choisir</option>{compatibleEquipmentStocks.map((position) => <option key={position.id} value={position.id}>{position.assetEntry?.entryNumber} — {position.assetEntry?.assetItem?.name} — disponible {position.availableQuantity}</option>)}</select></label>
              <label><span>Quantité descriptive</span><input required type="number" min="1" step="1" value={equipmentComponentForm.quantity} onChange={(event) => setEquipmentComponentForm({ ...equipmentComponentForm, quantity: event.target.value })} /></label>
            </>}
            <label><span>Notes</span><textarea value={equipmentComponentForm.notes} onChange={(event) => setEquipmentComponentForm({ ...equipmentComponentForm, notes: event.target.value })} /></label>
            <button className="button" type="submit" disabled={!equipmentComponentForm.equipmentSetId}>Ajouter le composant</button>
          </form>
        </div> : null}
      </section>

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
