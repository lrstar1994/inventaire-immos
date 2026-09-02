"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import ActionFeedback, { actionError, actionSuccess } from "@/app/components/action-feedback";
import { AssetFileImage, AssetFileLink } from "./asset-file-access-view";

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

const initialEntryPhotoForm = { files: [], fileType: "OTHER", fileLabel: "", notes: "", isPrimary: false };
const initialEntryDocumentForm = { files: [], fileType: "OTHER", fileLabel: "", notes: "" };

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

export default function AssetPark({ canWrite = false, initialOptions = null, initialUnits = [], initialUnitPagination = null, initialEntries = [], initialQuantitativeStocks = null, initialEquipmentSets = null }) {
  const [options] = useState(initialOptions);
  const [units, setUnits] = useState(initialUnits);
  const [unitPagination, setUnitPagination] = useState(initialUnitPagination || { page: 1, pageSize: 25, total: initialUnits.length, totalPages: 1 });
  const [unitsLoading, setUnitsLoading] = useState(false);
  const [unitsError, setUnitsError] = useState("");
  const [entries, setEntries] = useState(initialEntries);
  const [quantitativeStocks, setQuantitativeStocks] = useState(initialQuantitativeStocks);
  const [equipmentSets, setEquipmentSets] = useState(initialEquipmentSets);
  const [equipmentUnits, setEquipmentUnits] = useState(null);
  const [stocksLoading, setStocksLoading] = useState(false);
  const [stocksError, setStocksError] = useState("");
  const [equipmentSetsLoading, setEquipmentSetsLoading] = useState(false);
  const [equipmentSetsError, setEquipmentSetsError] = useState("");
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
  const [entryFileContext, setEntryFileContext] = useState(null);
  const [entryFiles, setEntryFiles] = useState([]);
  const [entryFilesLoading, setEntryFilesLoading] = useState(false);
  const [entryPhotoForm, setEntryPhotoForm] = useState(initialEntryPhotoForm);
  const [entryDocumentForm, setEntryDocumentForm] = useState(initialEntryDocumentForm);
  const [entryPhotoInputKey, setEntryPhotoInputKey] = useState(0);
  const [entryDocumentInputKey, setEntryDocumentInputKey] = useState(0);

  async function loadUnits(page = 1, appliedFilters = filters) {
    setUnitsLoading(true);
    setUnitsError("");
    try {
      const params = new URLSearchParams({ paginate: "true", page: String(page), pageSize: String(unitPagination.pageSize || 25) });
      for (const key of ["q", "status", "condition", "informationStatus", "assetItemId", "locationId"]) {
        if (appliedFilters[key]) params.set(key, appliedFilters[key]);
      }
      const categoryId = appliedFilters.categoryPath?.[appliedFilters.categoryPath.length - 1];
      if (categoryId) params.set("categoryIds", collectCategoryDescendants(options.assetCategories, categoryId).join(","));
      const response = await fetch(`/api/asset-units?${params}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || result.error || "Chargement des biens impossible.");
      setUnits(result.units || []);
      setUnitPagination(result.pagination || unitPagination);
      setSelected((current) => current ? (result.units || []).find((unit) => unit.id === current.id) || null : null);
      return result;
    } catch (error) {
      setUnitsError(error.message || "Chargement des biens impossible.");
      return null;
    } finally {
      setUnitsLoading(false);
    }
  }

  async function loadQuantitativeStocks() {
    if (stocksLoading) return;
    setStocksLoading(true);
    setStocksError("");
    try {
      const response = await fetch("/api/quantitative-stock-positions");
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || result.error || "Chargement des stocks impossible.");
      setQuantitativeStocks(result.positions || []);
    } catch (error) {
      setStocksError(error.message || "Chargement des stocks impossible.");
    } finally {
      setStocksLoading(false);
    }
  }

  async function loadEquipmentSets() {
    if (equipmentSetsLoading) return;
    setEquipmentSetsLoading(true);
    setEquipmentSetsError("");
    try {
      const [setsResponse, unitsResponse] = await Promise.all([
        fetch("/api/equipment-sets"),
        fetch("/api/asset-units?purpose=equipment")
      ]);
      const [setsResult, unitsResult] = await Promise.all([setsResponse.json(), unitsResponse.json()]);
      if (!setsResponse.ok) throw new Error(setsResult.message || setsResult.error || "Chargement des ensembles impossible.");
      if (!unitsResponse.ok) throw new Error(unitsResult.message || unitsResult.error || "Chargement des biens compatibles impossible.");
      setEquipmentSets(setsResult.equipmentSets || []);
      setEquipmentUnits(unitsResult.units || []);
    } catch (error) {
      setEquipmentSetsError(error.message || "Chargement des ensembles impossible.");
    } finally {
      setEquipmentSetsLoading(false);
    }
  }

  async function loadData() {
    const requests = [
      loadUnits(unitPagination.page),
      fetch("/api/asset-entries?limit=8").then(async (response) => {
        const result = await response.json();
        if (response.ok) setEntries(result.entries || []);
      })
    ];
    if (quantitativeStocks !== null) requests.push(loadQuantitativeStocks());
    if (equipmentSets !== null) requests.push(loadEquipmentSets());
    await Promise.all(requests);
  }

  const filteredUnits = units;

  const visibleCategoryParentId = filters.categoryPath[filters.categoryPath.length - 1] || null;
  const visibleCategories = useMemo(() => {
    if (!options) return [];
    return options.assetCategories.filter((category) => (category.parentId || null) === visibleCategoryParentId);
  }, [options, visibleCategoryParentId]);

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
    const nextFilters = { ...filters, assetItemId };
    setFilters(nextFilters);
    setShowDetails(true);
    loadUnits(1, nextFilters);
  }

  function resetFilters() {
    const emptyFilters = {
      q: "",
      status: "",
      condition: "",
      informationStatus: "",
      categoryPath: [],
      assetItemId: "",
      locationId: ""
    };
    setFilters(emptyFilters);
    setShowDetails(false);
    loadUnits(1, emptyFilters);
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

  function entryFileTypeOptions(fileKind) {
    const category = fileKind === "MATERIAL_PHOTO" ? "image" : "document";
    return (options.assetFileOptions?.fileTypes || []).filter((item) =>
      item.code !== "MAIN_PHOTO" && (item.category === category || item.category === "mixed")
    );
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

  async function loadEntryFiles(context = entryFileContext) {
    if (!context?.id) return;
    setEntryFilesLoading(true);
    try {
      const response = await fetch(`/api/asset-entries/${context.id}/files`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Chargement des fichiers impossible.");
      setEntryFiles(result.files || []);
    } catch (error) {
      setMessage(actionError(error.message));
    } finally {
      setEntryFilesLoading(false);
    }
  }

  function openEntryFiles(context) {
    setEntryFileContext(context);
    setEntryFiles([]);
    loadEntryFiles(context);
  }

  async function uploadEntryFiles(event, fileKind) {
    event.preventDefault();
    if (!entryFileContext) return;
    const form = fileKind === "MATERIAL_PHOTO" ? entryPhotoForm : entryDocumentForm;
    const files = Array.from(form.files || []);
    if (!files.length) {
      setMessage(actionError("Choisissez au moins un fichier."));
      return;
    }
    let uploaded = 0;
    for (const [index, file] of files.entries()) {
      const formData = new FormData();
      formData.append("fileKind", fileKind);
      formData.append("fileType", form.fileType);
      formData.append("fileLabel", form.fileLabel);
      formData.append("notes", form.notes);
      if (fileKind === "MATERIAL_PHOTO") formData.append("isPrimary", String(form.isPrimary && index === 0));
      formData.append("file", file);
      const response = await fetch(`/api/asset-entries/${entryFileContext.id}/files`, { method: "POST", body: formData });
      const result = await response.json();
      if (!response.ok) {
        await loadEntryFiles();
        setMessage(actionError(`${uploaded ? `${uploaded} fichier(s) ajouté(s). ` : ""}${result.error || "Ajout impossible."}`));
        return;
      }
      uploaded += 1;
    }
    await loadEntryFiles();
    if (fileKind === "MATERIAL_PHOTO") {
      setEntryPhotoForm(initialEntryPhotoForm);
      setEntryPhotoInputKey((current) => current + 1);
    } else {
      setEntryDocumentForm(initialEntryDocumentForm);
      setEntryDocumentInputKey((current) => current + 1);
    }
    setMessage(actionSuccess({
      title: fileKind === "MATERIAL_PHOTO" ? `${uploaded} photo${uploaded > 1 ? "s" : ""} ajoutée${uploaded > 1 ? "s" : ""}` : "Document justificatif ajouté",
      message: `Le fichier est disponible sur l'entrée ${entryFileContext.entryNumber}.`,
      item: entryFileContext.itemName,
      code: entryFileContext.entryNumber,
      status: "Disponible"
    }));
  }

  async function setPrimaryEntryFile(fileId) {
    const response = await fetch(`/api/asset-entries/${entryFileContext.id}/files/${fileId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPrimary: true })
    });
    const result = await response.json();
    if (!response.ok) return setMessage(actionError(result.error || "Photo principale impossible."));
    await loadEntryFiles();
    setMessage(actionSuccess({ title: "Photo principale définie", message: `La galerie de l'entrée ${entryFileContext.entryNumber} a été actualisée.`, code: entryFileContext.entryNumber, status: "Photo principale" }));
  }

  async function updateEntryFileType(fileId, fileType) {
    const response = await fetch(`/api/asset-entries/${entryFileContext.id}/files/${fileId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileType })
    });
    const result = await response.json();
    if (!response.ok) return setMessage(actionError(result.error || "Modification de la catégorie impossible."));
    await loadEntryFiles();
    setMessage(actionSuccess({ title: "Catégorie mise à jour", message: `Le fichier de l'entrée ${entryFileContext.entryNumber} a été reclassé.`, code: entryFileContext.entryNumber, status: fileType === "OTHER" ? "Non classé" : fileTypeLabel(fileType) }));
  }

  async function deleteEntryFile(fileId, labelValue) {
    const response = await fetch(`/api/asset-entries/${entryFileContext.id}/files/${fileId}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok) return setMessage(actionError(result.error || "Suppression impossible."));
    await loadEntryFiles();
    setMessage(actionSuccess({ title: "Fichier supprimé", message: `${labelValue || "Le fichier"} n'apparaît plus parmi les fichiers actifs.`, code: entryFileContext.entryNumber, status: "Supprimé" }));
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
    const createdEntryContext = { id: result.entry.id, entryNumber: result.entry.entryNumber, quantity: result.entry.quantity, itemName: selectedAssetItem?.name || "Référence matériel", trackingMode };
    setMessage(actionSuccess({
      title: ["Q", "QI"].includes(trackingMode) ? "Entrée quantitative créée" : "Entrée individuelle créée",
      message: "La nouvelle entrée est visible dans le Parc physique.",
      item: selectedAssetItem?.name || "Référence matériel",
      code: result.entry.entryNumber,
      status: "Validée",
      details: [{ label: "Quantité", value: result.entry.quantity }, { label: "Emplacement", value: entryLocation }],
      actions: [
        { label: "Ajouter des photos / pièces jointes", onClick: () => openEntryFiles(createdEntryContext) },
        { label: "Créer une autre", onClick: () => document.getElementById("new-asset-entry-form")?.scrollIntoView({ behavior: "smooth", block: "start" }) }
      ]
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
    const position = (quantitativeStocks || []).find((item) => item.id === equipmentComponentForm.stockPositionId);
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
  const stockItems = quantitativeStocks || [];
  const equipmentSetItems = equipmentSets || [];
  const selectedEquipmentSet = equipmentSetItems.find((item) => item.id === equipmentComponentForm.equipmentSetId);
  const usedAssetUnitIds = new Set(equipmentSetItems.flatMap((item) => item.components || []).map((component) => component.assetUnitId).filter(Boolean));
  const compatibleEquipmentUnits = selectedEquipmentSet
    ? (equipmentUnits || []).filter((unit) => unit.location?.id === selectedEquipmentSet.locationId && unit.status !== "RETIRED" && !usedAssetUnitIds.has(unit.id))
    : [];
  const compatibleEquipmentStocks = selectedEquipmentSet
    ? stockItems.filter((position) => position.location?.id === selectedEquipmentSet.locationId && position.availableQuantity > 0)
    : [];

  return (
    <section className="reference-layout park-layout">
      <ActionFeedback feedback={message} onClose={() => setMessage("")} />
      <div className="park-main-grid">
        <section className="panel park-search-panel">
          <div className="panel-heading">
            <div>
              <h2>⌕ Recherche</h2>
            </div>
            <input
              aria-label="Recherche parc"
              placeholder="Rechercher par article, modèle, référence…"
              value={filters.q}
              onChange={(event) => setFilters({ ...filters, q: event.target.value })}
            />
          </div>
          <details className="category-picker park-category-picker">
            <summary>Filtrer par famille / catégorie</summary>
            <div className="park-category-picker-content">
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
          </details>
          <div className="filter-row park-filter-row">
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
            <button className="button" type="button" onClick={() => { setShowDetails(true); loadUnits(1); }} disabled={unitsLoading}>
              {unitsLoading ? "Chargement…" : "⌕ Voir les biens"}
            </button>
            <button className="secondary" type="button" onClick={resetFilters}>↻ Réinitialiser</button>
            {showDetails ? <button className="secondary" type="button" onClick={() => setShowDetails(false)}>Voir la synthèse</button> : null}
          </div>
          {unitsError ? <p className="error-text">{unitsError}</p> : null}
          {!showDetails ? <div className="park-summary-heading"><span className="summary-heading-icon">⌘</span><div><h2>Synthèse par famille</h2><p>Aperçu du parc physique par famille d'articles.</p></div></div> : null}
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
                  <div className="family-card-title"><span className="family-card-icon">◇</span><strong>{group.family}</strong><span><b>{group.total}</b><small>biens</small></span></div>
                  <h3>Modèles les plus présents</h3>
                  <ul className="family-model-list">{group.models.slice(0, 3).map(([model, count]) => <li key={model}><span>{model}</span><strong>{count}</strong></li>)}</ul>
                  <h3>Emplacements principaux</h3>
                  <div className="location-grid">
                    {group.locations.slice(0, 3).map(([location, count]) => (
                      <p className="location-pair" key={location}><span>{location}</span><strong>{count}</strong></p>
                    ))}
                  </div>
                  <button className="family-detail-link" type="button" onClick={() => { setShowDetails(true); loadUnits(1); }}>Voir le détail →</button>
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
          <div className="form-actions park-pagination" aria-label="Pagination des biens">
            <button className="secondary" type="button" disabled={unitsLoading || unitPagination.page <= 1} onClick={() => loadUnits(unitPagination.page - 1)}>Page précédente</button>
            <span>Page {unitPagination.page} sur {unitPagination.totalPages} · {unitPagination.total} bien(s)</span>
            <button className="secondary" type="button" disabled={unitsLoading || unitPagination.page >= unitPagination.totalPages} onClick={() => loadUnits(unitPagination.page + 1)}>Page suivante</button>
          </div>
        </section>

        {false && canWrite ? <aside className="panel park-entry-panel">
          <div className="park-panel-title">
            <h2>Nouvelle entree</h2>
            <p className="summary">Enregistrez des biens individuels ou une entrée suivie en quantité.</p>
          </div>
          <form className="form" id="new-asset-entry-form" onSubmit={submitEntry}>
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

      {entryFileContext ? <section className="panel entry-files-panel" aria-labelledby="entry-files-title">
        <div className="park-panel-title">
          <div><h2 id="entry-files-title">Photos / pièces jointes</h2><p className="summary"><strong>{entryFileContext.entryNumber}</strong> — {entryFileContext.itemName} — quantité {entryFileContext.quantity}</p></div>
          <button className="secondary" type="button" onClick={() => setEntryFileContext(null)}>Fermer</button>
        </div>
        {entryFilesLoading ? <p className="summary">Chargement…</p> : null}
        <div className="entry-files-grid">
          <section className="entry-file-section">
            <h3>Photos du matériel</h3>
            <div className="asset-thumbs">
              {entryFiles.filter((file) => file.fileKind === "MATERIAL_PHOTO").map((file) => <article className="asset-thumb-card" key={file.id}>
                <AssetFileImage file={file} alt={file.fileLabel || file.fileName || "Photo du matériel"} />
                <strong>{file.fileLabel || file.fileName}</strong>
                <small>{file.fileType === "OTHER" ? "Non classée" : fileTypeLabel(file.fileType)}</small>
                {file.isPrimary ? <span className="entry-file-badge">Principale</span> : null}
                {canWrite ? <div className="form-actions">
                  <label><span>Catégorie</span><select aria-label={`Catégorie de ${file.fileLabel || file.fileName}`} value={file.fileType} onChange={(event) => updateEntryFileType(file.id, event.target.value)}>{entryFileTypeOptions("MATERIAL_PHOTO").map((item) => <option key={item.code} value={item.code}>{item.code === "OTHER" ? "Non classée" : item.label}</option>)}</select></label>
                  {!file.isPrimary ? <button className="secondary" type="button" onClick={() => setPrimaryEntryFile(file.id)}>Définir comme principale</button> : null}
                  <button className="secondary danger" type="button" onClick={() => deleteEntryFile(file.id, "La photo")}>Supprimer</button>
                </div> : null}
              </article>)}
              {!entryFiles.some((file) => file.fileKind === "MATERIAL_PHOTO") ? <p className="summary">Aucune photo ajoutée.</p> : null}
            </div>
            {canWrite ? <form className="form asset-upload-card" onSubmit={(event) => uploadEntryFiles(event, "MATERIAL_PHOTO")}>
              <label><span>Photos (appareil ou galerie)</span><input key={entryPhotoInputKey} required multiple accept="image/*" type="file" onChange={(event) => setEntryPhotoForm({ ...entryPhotoForm, files: event.target.files })} /></label>
              <label><span>Libellé</span><input value={entryPhotoForm.fileLabel} onChange={(event) => setEntryPhotoForm({ ...entryPhotoForm, fileLabel: event.target.value })} /></label>
              <label><span>Catégorie (facultatif)</span><select value={entryPhotoForm.fileType} onChange={(event) => setEntryPhotoForm({ ...entryPhotoForm, fileType: event.target.value })}>{entryFileTypeOptions("MATERIAL_PHOTO").map((item) => <option key={item.code} value={item.code}>{item.code === "OTHER" ? "Non classée" : item.label}</option>)}</select></label>
              <label className="checkbox-line"><input type="checkbox" checked={entryPhotoForm.isPrimary} onChange={(event) => setEntryPhotoForm({ ...entryPhotoForm, isPrimary: event.target.checked })} /><span>Définir la première comme photo principale</span></label>
              <button className="button" type="submit">Ajouter les photos</button>
            </form> : null}
          </section>
          <section className="entry-file-section">
            <h3>Documents justificatifs</h3>
            <ul className="file-list">
              {entryFiles.filter((file) => file.fileKind === "SUPPORTING_DOCUMENT").map((file) => <li key={file.id}><div><strong>{file.fileLabel || file.fileName}</strong><small>{file.fileType === "OTHER" ? "Autre document" : fileTypeLabel(file.fileType)}</small></div><div className="form-actions">{canWrite ? <select aria-label={`Catégorie de ${file.fileLabel || file.fileName}`} value={file.fileType} onChange={(event) => updateEntryFileType(file.id, event.target.value)}>{entryFileTypeOptions("SUPPORTING_DOCUMENT").map((item) => <option key={item.code} value={item.code}>{item.code === "OTHER" ? "Autre document" : item.label}</option>)}</select> : null}<AssetFileLink file={file}>Ouvrir</AssetFileLink>{canWrite ? <button className="secondary danger" type="button" onClick={() => deleteEntryFile(file.id, "Le document")}>Supprimer</button> : null}</div></li>)}
              {!entryFiles.some((file) => file.fileKind === "SUPPORTING_DOCUMENT") ? <li>Aucun document justificatif ajouté.</li> : null}
            </ul>
            {canWrite ? <form className="form asset-upload-card" onSubmit={(event) => uploadEntryFiles(event, "SUPPORTING_DOCUMENT")}>
              <label><span>Documents</span><input key={entryDocumentInputKey} required multiple accept="image/*,.pdf" type="file" onChange={(event) => setEntryDocumentForm({ ...entryDocumentForm, files: event.target.files })} /></label>
              <label><span>Libellé</span><input value={entryDocumentForm.fileLabel} onChange={(event) => setEntryDocumentForm({ ...entryDocumentForm, fileLabel: event.target.value })} /></label>
              <label><span>Catégorie (facultatif)</span><select value={entryDocumentForm.fileType} onChange={(event) => setEntryDocumentForm({ ...entryDocumentForm, fileType: event.target.value })}>{entryFileTypeOptions("SUPPORTING_DOCUMENT").map((item) => <option key={item.code} value={item.code}>{item.code === "OTHER" ? "Non classé" : item.label}</option>)}</select></label>
              <button className="button" type="submit">Ajouter les documents</button>
            </form> : null}
          </section>
        </div>
      </section> : null}

      <details className="panel park-recent-panel park-secondary-section" onToggle={(event) => { if (event.currentTarget.open && quantitativeStocks === null) loadQuantitativeStocks(); }}>
        <summary className="park-panel-title">
          <h2>Stocks quantitatifs</h2>
          <p className="summary">Lots suivis en quantité, distincts des biens individualisés.</p>
        </summary>
        {stocksLoading ? <p className="summary">Chargement des stocks…</p> : null}
        {stocksError ? <div className="error-text"><p>{stocksError}</p><button className="secondary" type="button" onClick={loadQuantitativeStocks}>Réessayer</button></div> : null}
        {!stocksLoading && !stocksError ? <div className="table-wrap">
          <table>
            <thead><tr><th>Référence</th><th>Famille</th><th>Mode</th><th>Lot</th><th>Emplacement</th><th>Disponible</th><th>Acquise</th><th>Fournisseur</th><th>Date</th><th>Prix</th>{canWrite ? <th>Action</th> : null}</tr></thead>
            <tbody>
              {stockItems.map((position) => {
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
              {!stockItems.length ? <tr><td colSpan={canWrite ? 11 : 10}>Aucun stock quantitatif enregistré.</td></tr> : null}
            </tbody>
          </table>
        </div> : null}
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
      </details>

      <details className="panel park-recent-panel park-secondary-section" onToggle={(event) => { if (event.currentTarget.open && equipmentSets === null) loadEquipmentSets(); }}>
        <summary className="park-panel-title">
          <h2>Ensembles installés</h2>
          <p className="summary">Composition logique de patrimoines existants, sans création ni réservation de stock.</p>
        </summary>
        {equipmentSetsLoading ? <p className="summary">Chargement des ensembles…</p> : null}
        {equipmentSetsError ? <div className="error-text"><p>{equipmentSetsError}</p><button className="secondary" type="button" onClick={loadEquipmentSets}>Réessayer</button></div> : null}
        {!equipmentSetsLoading && !equipmentSetsError ? <div className="summary-list park-summary-list">
          {equipmentSetItems.map((equipmentSet) => (
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
          {!equipmentSetItems.length ? <p className="summary">Aucun ensemble installé actif.</p> : null}
        </div> : null}

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
            <label><span>Ensemble</span><select required value={equipmentComponentForm.equipmentSetId} onChange={(event) => setEquipmentComponentForm({ ...initialEquipmentComponentForm, equipmentSetId: event.target.value })}><option value="">Choisir</option>{equipmentSetItems.map((item) => <option key={item.id} value={item.id}>{item.code} — {item.name}</option>)}</select></label>
            <label><span>Type</span><select value={equipmentComponentForm.type} onChange={(event) => setEquipmentComponentForm({ ...equipmentComponentForm, type: event.target.value, assetUnitId: "", stockPositionId: "", quantity: 1 })}><option value="INDIVIDUAL">Unité individuelle</option><option value="QUANTITATIVE">Quantité d'un lot</option></select></label>
            {equipmentComponentForm.type === "INDIVIDUAL" ? <label><span>Bien individuel compatible</span><select required value={equipmentComponentForm.assetUnitId} onChange={(event) => setEquipmentComponentForm({ ...equipmentComponentForm, assetUnitId: event.target.value })}><option value="">Choisir</option>{compatibleEquipmentUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.assetCode} — {unit.assetItem?.name}</option>)}</select></label> : <>
              <label><span>Lot quantitatif au même emplacement</span><select required value={equipmentComponentForm.stockPositionId} onChange={(event) => setEquipmentComponentForm({ ...equipmentComponentForm, stockPositionId: event.target.value })}><option value="">Choisir</option>{compatibleEquipmentStocks.map((position) => <option key={position.id} value={position.id}>{position.assetEntry?.entryNumber} — {position.assetEntry?.assetItem?.name} — disponible {position.availableQuantity}</option>)}</select></label>
              <label><span>Quantité descriptive</span><input required type="number" min="1" step="1" value={equipmentComponentForm.quantity} onChange={(event) => setEquipmentComponentForm({ ...equipmentComponentForm, quantity: event.target.value })} /></label>
            </>}
            <label><span>Notes</span><textarea value={equipmentComponentForm.notes} onChange={(event) => setEquipmentComponentForm({ ...equipmentComponentForm, notes: event.target.value })} /></label>
            <button className="button" type="submit" disabled={!equipmentComponentForm.equipmentSetId}>Ajouter le composant</button>
          </form>
        </div> : null}
      </details>

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
                  <th>Fichiers</th>
                </tr>
              </thead>
              <tbody>
                {entries.slice(0, 8).map((item) => (
                  <tr key={item.id}>
                    <td>{item.entryNumber}</td>
                    <td>{item.assetItem?.name}</td>
                    <td>{item.quantity}</td>
                    <td>{label(options.entryStatuses, item.entryStatus)}</td>
                    <td><button className="secondary" type="button" onClick={() => openEntryFiles({ id: item.id, entryNumber: item.entryNumber, quantity: item.quantity, itemName: item.assetItem?.name || "Référence matériel" })}>Photos / pièces jointes</button></td>
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
