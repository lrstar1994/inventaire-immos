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

function statusClass(status) {
  if (status === "VALIDATED") return "validated";
  if (status === "DRAFT") return "draft";
  if (status === "CANCELLED") return "cancelled";
  return "muted";
}

const initialForm = {
  documentType: "ENTRY_SLIP",
  documentDate: today(),
  title: "",
  notes: ""
};

export default function DocumentManager({ canWrite = false, initialOptions = null, initialDocuments = [] }) {
  const [options, setOptions] = useState(initialOptions);
  const [documents, setDocuments] = useState(initialDocuments);
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [selectedEntries, setSelectedEntries] = useState([]);
  const [filters, setFilters] = useState({
    mode: "MANUAL",
    startDate: today(),
    endDate: today(),
    supplierId: "",
    entryType: ""
  });
  const [form, setForm] = useState(initialForm);
  const [cancelReason, setCancelReason] = useState("");
  const [message, setMessage] = useState("");

  async function loadData() {
    const [nextOptions, nextDocuments] = await Promise.all([
      fetch("/api/document-options").then((response) => response.json()),
      fetch("/api/asset-documents").then((response) => response.json())
    ]);
    setOptions(nextOptions);
    setDocuments(nextDocuments.documents || []);
    setSelectedDocument((current) => {
      if (!current) return null;
      return (nextDocuments.documents || []).find((item) => item.id === current.id) || null;
    });
  }

  useEffect(() => {
    loadData();
  }, []);

  const entries = options?.entries || [];
  const activeDocumentTypes = options?.activeDocumentTypes || [];

  const preparedEntries = useMemo(() => {
    return entries.filter((entry) => {
      const activeDocumentLink = entry.documentEntries?.find((link) => link.document?.documentType === form.documentType);
      if (activeDocumentLink) return false;
      const entryDate = String(entry.entryDate || "").slice(0, 10);
      if (filters.mode === "TODAY" && entryDate !== today()) return false;
      if (filters.mode === "PERIOD") {
        if (filters.startDate && entryDate < filters.startDate) return false;
        if (filters.endDate && entryDate > filters.endDate) return false;
      }
      if (filters.mode === "SUPPLIER" && filters.supplierId && entry.supplierId !== filters.supplierId) return false;
      if (filters.mode === "ENTRY_TYPE" && filters.entryType && entry.entryType !== filters.entryType) return false;
      return entry.entryStatus === "VALIDATED";
    });
  }, [entries, filters, form.documentType]);

  function applyFilterSelection() {
    setSelectedEntries(preparedEntries.map((entry) => entry.id));
  }

  function toggleEntry(entryId) {
    setSelectedEntries((current) =>
      current.includes(entryId) ? current.filter((id) => id !== entryId) : [...current, entryId]
    );
  }

  async function createDocument(event) {
    event.preventDefault();
    setMessage("");
    if (selectedEntries.length === 0) {
      setMessage("Selectionner au moins une entree validee.");
      return;
    }

    const response = await fetch("/api/asset-documents/from-entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        entryIds: selectedEntries
      })
    });
    const result = await response.json();
    if (!response.ok) {
      setMessage(actionError(result.error || "Création du document impossible."));
      return;
    }

    setMessage(actionSuccess({
      title: "Brouillon créé",
      message: "Le document est disponible dans la liste et peut maintenant être validé.",
      item: result.document.title || "Document",
      code: result.document.documentNumber,
      status: "Brouillon",
      details: [{ label: "Entrées", value: result.document.entries.length }, { label: "Lignes", value: result.document.lines.length }],
      action: { label: "Ouvrir le document", onClick: () => setSelectedDocument(result.document) }
    }));
    setSelectedEntries([]);
    setForm(initialForm);
    await loadData();
    setSelectedDocument(result.document);
  }

  async function validateDocument() {
    if (!selectedDocument) return;
    setMessage("");
    const response = await fetch(`/api/asset-documents/${selectedDocument.id}/validate`, { method: "POST" });
    const result = await response.json();
    if (!response.ok) {
      setMessage(actionError(result.error || "Validation impossible."));
      return;
    }
    setMessage(actionSuccess({ title: "Document validé", message: "Le document est verrouillé et visible dans la liste.", item: result.document.title || "Document", code: result.document.documentNumber, status: "Validé", action: { label: "Voir le document", onClick: () => setSelectedDocument(result.document) } }));
    await loadData();
  }

  async function cancelDocument() {
    if (!selectedDocument) return;
    setMessage("");
    const response = await fetch(`/api/asset-documents/${selectedDocument.id}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: cancelReason })
    });
    const result = await response.json();
    if (!response.ok) {
      setMessage(actionError(result.error || "Annulation impossible."));
      return;
    }
    setMessage(actionSuccess({ title: "Document annulé", message: "Le statut a été mis à jour dans la liste.", item: result.document.title || "Document", code: result.document.documentNumber, status: "Annulé", action: { label: "Voir le document", onClick: () => setSelectedDocument(result.document) } }));
    setCancelReason("");
    await loadData();
  }

  if (!options) {
    return <p className="summary">Chargement des documents...</p>;
  }

  return (
    <section className="reference-layout">
      <ActionFeedback feedback={message} onClose={() => setMessage("")} />
      <div className="reference-grid wide">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Liste des documents</h2>
              <p className="summary">Consultez les brouillons, documents valides et documents annules.</p>
            </div>
            <span className="pill">{documents.length} document(s)</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Numero</th>
                  <th>Type</th>
                  <th>Date</th>
                  <th>Statut</th>
                  <th>Entrees</th>
                  <th>Lignes</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((document) => (
                  <tr key={document.id} onClick={() => setSelectedDocument(document)}>
                    <td>{document.documentNumber}</td>
                    <td>{label(options.documentTypes, document.documentType)}</td>
                    <td>{formatDate(document.documentDate)}</td>
                    <td>
                      <span className={`status-badge ${statusClass(document.status)}`}>
                        {label(options.documentStatuses, document.status)}
                      </span>
                    </td>
                    <td>{document.entries?.length || 0}</td>
                    <td>{document.lines?.length || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {canWrite ? <aside className="panel">
          <h2>Nouveau document</h2>
          <p className="summary">Le document est cree en brouillon. Il devra etre valide volontairement.</p>
          <form className="form" onSubmit={createDocument}>
            <label>
              <span>Type</span>
              <select value={form.documentType} onChange={(event) => setForm({ ...form, documentType: event.target.value })}>
                {activeDocumentTypes.map((item) => (
                  <option key={item.code} value={item.code}>{item.label}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Date du document</span>
              <input type="date" value={form.documentDate} onChange={(event) => setForm({ ...form, documentDate: event.target.value })} />
            </label>
            <label>
              <span>Titre</span>
              <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
            </label>
            <label>
              <span>Notes</span>
              <textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
            </label>
            <button className="button" type="submit">Creer un document avec les entrees selectionnees</button>
          </form>
        </aside> : null}
      </div>

      <div className="reference-grid detail-row">
        <section className="panel">
          <div className="panel-heading">
            <h2>Entrees disponibles a documenter</h2>
            <button className="secondary" type="button" onClick={applyFilterSelection}>Selectionner le groupe</button>
          </div>
          <p className="summary">
            Seules les entrees validees non rattachees a un document actif du meme type sont selectionnables.
          </p>
          <div className="filter-row documents-filter">
            <select value={filters.mode} onChange={(event) => setFilters({ ...filters, mode: event.target.value })}>
              <option value="MANUAL">Selection manuelle</option>
              <option value="TODAY">Entrees du jour</option>
              <option value="PERIOD">Periode</option>
              <option value="SUPPLIER">Fournisseur</option>
              <option value="ENTRY_TYPE">Type d'entree</option>
            </select>
            <input type="date" value={filters.startDate} onChange={(event) => setFilters({ ...filters, startDate: event.target.value })} />
            <input type="date" value={filters.endDate} onChange={(event) => setFilters({ ...filters, endDate: event.target.value })} />
            <select value={filters.supplierId} onChange={(event) => setFilters({ ...filters, supplierId: event.target.value })}>
              <option value="">Tous les fournisseurs</option>
              {options.suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
              ))}
            </select>
            <select value={filters.entryType} onChange={(event) => setFilters({ ...filters, entryType: event.target.value })}>
              <option value="">Tous les types</option>
              {options.entryTypes.map((item) => (
                <option key={item.code} value={item.code}>{item.label}</option>
              ))}
            </select>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th></th>
                  <th>Numero</th>
                  <th>Modele</th>
                  <th>Emplacement</th>
                  <th>Fournisseur</th>
                  <th>Quantite</th>
                </tr>
              </thead>
              <tbody>
                {preparedEntries.map((entry) => (
                  <tr key={entry.id}>
                    <td>
                      <input
                        aria-label={`Selection ${entry.entryNumber}`}
                        checked={selectedEntries.includes(entry.id)}
                        type="checkbox"
                        onChange={() => toggleEntry(entry.id)}
                      />
                    </td>
                    <td>{entry.entryNumber}</td>
                    <td>{entry.assetItem?.name}</td>
                    <td>{entry.location?.name}</td>
                    <td>{entry.supplier?.name || "Non renseigne"}</td>
                    <td>{entry.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="panel">
          <h2>Fiche document</h2>
          {selectedDocument ? (
            <div className="document-detail">
              <div className="document-card-head">
                <div>
                  <p className="eyebrow">Numero</p>
                  <h2>{selectedDocument.documentNumber}</h2>
                </div>
                <span className={`status-badge ${statusClass(selectedDocument.status)}`}>
                  {label(options.documentStatuses, selectedDocument.status)}
                </span>
              </div>
              <div className="detail-cards two">
                <div className="info-box">
                  <strong>Informations</strong>
                  <p className="fact-line"><span>Type</span><strong>{label(options.documentTypes, selectedDocument.documentType)}</strong></p>
                  <p className="fact-line"><span>Date</span><strong>{formatDate(selectedDocument.documentDate)}</strong></p>
                  <p className="fact-line"><span>Titre</span><strong>{selectedDocument.title || "Non renseigne"}</strong></p>
                  <p className="fact-line"><span>Notes</span><strong>{selectedDocument.notes || "Aucune note"}</strong></p>
                </div>
                <div className="info-box">
                  <strong>Validation</strong>
                  <p className="fact-line"><span>Createur</span><strong>{selectedDocument.createdById || "Non renseigne"}</strong></p>
                  <p className="fact-line"><span>Validateur</span><strong>{selectedDocument.validatedById || "Non valide"}</strong></p>
                  <p className="fact-line"><span>Date validation</span><strong>{formatDate(selectedDocument.validatedAt) || "Non valide"}</strong></p>
                </div>
              </div>
              {selectedDocument.status === "VALIDATED" ? (
                <p className="locked-note">
                  Document valide : contenu verrouille. Annulation indisponible tant que la validation Direction par code personnel n'est pas active.
                </p>
              ) : null}
              {selectedDocument.status === "CANCELLED" ? (
                <div className="warning-box">
                  <strong>Document annule</strong>
                  <p className="fact-line"><span>Date</span><strong>{formatDate(selectedDocument.cancelledAt)}</strong></p>
                  <p className="fact-line"><span>Utilisateur</span><strong>{selectedDocument.cancelledById || "Non renseigne"}</strong></p>
                  <p>{selectedDocument.cancellationReason || "Motif non renseigne."}</p>
                </div>
              ) : null}
              <h3>Entrees liees</h3>
              <ul className="compact-list">
                {selectedDocument.entries?.map((link) => (
                  <li key={link.id}>{link.assetEntry?.entryNumber} - {link.assetEntry?.assetItem?.name}</li>
                ))}
              </ul>
              <h3>Lignes detaillees</h3>
              <ul className="compact-list">
                {selectedDocument.lines?.map((line) => (
                  <li key={line.id}>{line.assetUnit?.assetCode || line.lineLabel} - {line.quantity}</li>
                ))}
              </ul>
              <div className="form-actions">
                {canWrite && selectedDocument.status !== "VALIDATED" && selectedDocument.status !== "CANCELLED" ? (
                  <button type="button" onClick={validateDocument}>Valider</button>
                ) : null}
              </div>
              {canWrite && selectedDocument.status !== "CANCELLED" && selectedDocument.status !== "VALIDATED" ? (
                <div className="form cancel-box">
                  <label>
                    <span>Motif d'annulation</span>
                    <textarea value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} />
                  </label>
                  <button className="secondary" type="button" onClick={cancelDocument}>Annuler le document</button>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="summary">Selectionner un document dans la liste.</p>
          )}
        </aside>
      </div>
    </section>
  );
}
