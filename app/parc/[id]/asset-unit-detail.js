"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const initialFileForm = {
  fileType: "MAIN_PHOTO",
  fileLabel: "",
  notes: "",
  isPrimary: true,
  file: null
};

function label(list, code) {
  return list?.find((item) => item.code === code)?.label || code || "-";
}

function primaryFile(unit) {
  return unit?.assetFiles?.find((file) => file.isPrimary) || unit?.assetFiles?.find((file) => file.mimeType?.startsWith("image/")) || null;
}

function imageFiles(unit) {
  return (unit?.assetFiles || []).filter((file) => file.mimeType?.startsWith("image/"));
}

function documentFiles(unit) {
  return (unit?.assetFiles || []).filter((file) => !file.mimeType?.startsWith("image/"));
}

function entryDocument(unit) {
  return unit?.documentLines?.find((line) => line.document?.documentType === "ENTRY_SLIP")?.document || null;
}

function lastMovement(unit) {
  return unit?.movementLines?.[0]?.movement || null;
}

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("fr-FR");
}

function categoryPath(categories, categoryId) {
  if (!categoryId) return "Categorie non renseignee";
  const byId = new Map(categories.map((category) => [category.id, category]));
  const path = [];
  let current = byId.get(categoryId);
  while (current) {
    path.unshift(current.name);
    current = current.parentId ? byId.get(current.parentId) : null;
  }
  return path.length ? path.join(" > ") : "Categorie non renseignee";
}

export default function AssetUnitDetail({ assetUnitId }) {
  const [options, setOptions] = useState(null);
  const [movementOptions, setMovementOptions] = useState(null);
  const [unit, setUnit] = useState(null);
  const [message, setMessage] = useState("");
  const [fileForm, setFileForm] = useState(initialFileForm);
  const [fileInputKey, setFileInputKey] = useState(0);

  async function loadData() {
    const [nextOptions, nextMovementOptions, nextUnit] = await Promise.all([
      fetch("/api/asset-options").then((response) => response.json()),
      fetch("/api/asset-movement-options").then((response) => response.json()),
      fetch(`/api/asset-units/${assetUnitId}`).then((response) => response.json())
    ]);
    setOptions(nextOptions);
    setMovementOptions(nextMovementOptions);
    setUnit(nextUnit.unit || null);
    if (!nextUnit.unit) setMessage(nextUnit.error || "Bien introuvable.");
  }

  useEffect(() => {
    loadData();
  }, [assetUnitId]);

  const historyLines = useMemo(() => {
    if (!unit) return [];
    const lines = [];
    if (unit.entry) {
      lines.push({
        key: `entry-${unit.entry.id}`,
        date: unit.createdAt,
        event: "Entree du bien",
        reference: unit.entry.entryNumber,
        location: unit.location?.name || "-",
        note: label(options?.entryTypes, unit.entry.entryType)
      });
    }
    for (const line of unit.documentLines || []) {
      lines.push({
        key: `doc-${line.id}`,
        date: line.document?.documentDate || line.createdAt,
        event: "Document",
        reference: line.document?.documentNumber,
        location: unit.location?.name || "-",
        note: label(options?.entryStatuses, line.document?.status) || line.document?.status
      });
    }
    for (const line of unit.movementLines || []) {
      lines.push({
        key: `mvt-${line.id}`,
        date: line.movement?.movementDate || line.createdAt,
        event: label(movementOptions?.movementTypes, line.movement?.movementType),
        reference: line.movement?.movementNumber,
        location: `${line.fromLocation?.name || "-"} vers ${line.toLocation?.name || "-"}`,
        note: line.movement?.reason || line.movement?.notes || "-"
      });
    }
    return lines.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  }, [movementOptions, options, unit]);

  async function saveUnit(event) {
    event.preventDefault();
    if (!unit) return;
    setMessage("");

    const response = await fetch(`/api/asset-units/${unit.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        condition: unit.condition,
        status: unit.status,
        informationStatus: unit.informationStatus,
        serialNumber: unit.serialNumber || null,
        notes: unit.notes || null
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

  async function submitAssetFile() {
    if (!unit) return;
    setMessage("");
    if (!fileForm.file) {
      setMessage("Choisir un fichier a ajouter.");
      return;
    }

    const formData = new FormData();
    formData.append("assetUnitId", unit.id);
    formData.append("fileType", fileForm.fileType);
    formData.append("fileLabel", fileForm.fileLabel);
    formData.append("notes", fileForm.notes);
    formData.append("isPrimary", String(fileForm.isPrimary));
    formData.append("file", fileForm.file);

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

  if (!options || !movementOptions) {
    return <p className="summary">Chargement de la fiche bien...</p>;
  }

  if (!unit) {
    return (
      <section className="panel">
        <p className="summary">{message || "Bien introuvable."}</p>
        <Link className="button secondary" href="/parc">Retour au parc</Link>
      </section>
    );
  }

  const mainPhoto = primaryFile(unit);
  const entryDoc = entryDocument(unit);
  const lastMvt = lastMovement(unit);

  return (
    <form className="form asset-unit-detail-form" onSubmit={saveUnit}>
      {message ? <p className="form-message">{message}</p> : null}

      <section className="asset-detail-banner">
        <div className="asset-detail-photo">
          {mainPhoto ? (
            <img alt={`Photo principale ${unit.assetCode}`} src={mainPhoto.filePath} />
          ) : (
            <div className="asset-photo-placeholder">Photo</div>
          )}
          <span>Photo principale</span>
        </div>
        <div className="asset-detail-title">
          <p className="eyebrow">Code du bien</p>
          <h2>{unit.assetCode}</h2>
          <p className="asset-model-name">{unit.assetItem?.name}</p>
          <p className="summary">{categoryPath(options.assetCategories, unit.assetItem?.categoryId)}</p>
          <p className="asset-location-line">{unit.location?.name || "Emplacement non renseigne"}</p>
        </div>
        <div className="asset-detail-status">
          <p><span>Etat</span><strong>{label(options.conditions, unit.condition)}</strong></p>
          <p><span>Statut</span><strong>{label(options.statuses, unit.status)}</strong></p>
          <p><span>Completude</span><strong>{label(options.informationStatuses, unit.informationStatus)}</strong></p>
          <p><span>Entree d'origine</span><strong>{unit.entry?.entryNumber || "Non renseignee"}</strong></p>
          <p><span>Document d'entree</span><strong>{entryDoc?.documentNumber || "Non rattache"}</strong></p>
        </div>
      </section>

      <div className="asset-detail-grid">
        <section className="info-box">
          <strong>Identification</strong>
          <p className="fact-line"><span>Code du bien</span><strong>{unit.assetCode}</strong></p>
          <p className="fact-line"><span>Article / modele</span><strong>{unit.assetItem?.name}</strong></p>
          <p className="fact-line"><span>Code article</span><strong>{unit.assetItem?.code || "Non renseigne"}</strong></p>
          <p className="fact-line"><span>Famille / categorie</span><strong>{categoryPath(options.assetCategories, unit.assetItem?.categoryId)}</strong></p>
          <label>
            <span>Numero de serie</span>
            <input value={unit.serialNumber || ""} onChange={(event) => setUnit({ ...unit, serialNumber: event.target.value })} />
          </label>
        </section>

        <section className="info-box">
          <strong>Situation actuelle</strong>
          <p className="fact-line"><span>Emplacement actuel</span><strong>{unit.location?.name || "Non renseigne"}</strong></p>
          <label>
            <span>Etat</span>
            <select value={unit.condition} onChange={(event) => setUnit({ ...unit, condition: event.target.value })}>
              {options.conditions.map((item) => (
                <option key={item.code} value={item.code}>{item.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Statut</span>
            <select value={unit.status} onChange={(event) => setUnit({ ...unit, status: event.target.value })}>
              {options.statuses.map((item) => (
                <option key={item.code} value={item.code}>{item.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Completude</span>
            <select value={unit.informationStatus} onChange={(event) => setUnit({ ...unit, informationStatus: event.target.value })}>
              {options.informationStatuses.map((item) => (
                <option key={item.code} value={item.code}>{item.label}</option>
              ))}
            </select>
          </label>
        </section>

        <section className="info-box">
          <strong>Tracabilite</strong>
          <p className="fact-line"><span>Entree d'origine</span><strong>{unit.entry?.entryNumber || "Non renseignee"}</strong></p>
          <p className="fact-line"><span>Document d'entree</span><strong>{entryDoc?.documentNumber || "Non rattache"}</strong></p>
          <p className="fact-line"><span>Dernier mouvement</span><strong>{lastMvt?.movementNumber || "Aucun"}</strong></p>
          <p className="fact-line"><span>Date d'entree</span><strong>{formatDate(unit.createdAt)}</strong></p>
        </section>
      </div>

      <div className="asset-detail-grid two-columns">
        <section className="info-box">
          <strong>Mouvements lies</strong>
          <ul className="compact-list asset-linked-list">
            {(unit.movementLines || []).map((line) => (
              <li key={line.id}>
                <strong>{line.movement?.movementNumber}</strong>
                <span>{label(movementOptions.movementTypes, line.movement?.movementType)}</span>
                <span>{line.fromLocation?.name || "-"} vers {line.toLocation?.name || "-"}</span>
              </li>
            ))}
            {unit.movementLines?.length ? null : <li>Aucun mouvement lie.</li>}
          </ul>
        </section>
        <section className="info-box">
          <strong>Documents lies</strong>
          <ul className="compact-list asset-linked-list">
            {(unit.documentLines || []).map((line) => (
              <li key={line.id}>
                <strong>{line.document?.documentNumber}</strong>
                <span>{line.document?.documentType}</span>
                <span>{line.document?.status}</span>
              </li>
            ))}
            {unit.documentLines?.length ? null : <li>Aucun document lie.</li>}
          </ul>
        </section>
      </div>

      <section className="info-box asset-files-section">
        <div className="asset-files-layout">
          <div>
            <strong>Photos et pieces jointes</strong>
            {mainPhoto ? (
              <div className="primary-photo">
                <img alt={`Photo principale ${unit.assetCode}`} src={mainPhoto.filePath} />
                <span>Photo principale</span>
              </div>
            ) : (
              <p className="summary">Aucune photo principale.</p>
            )}
            <div className="asset-thumbs">
              {imageFiles(unit).map((file) => (
                <article className="asset-thumb-card" key={file.id}>
                  <img alt={file.fileLabel || file.fileName} src={file.filePath} />
                  <span>{file.fileLabel || file.fileName}</span>
                  <div className="form-actions">
                    {!file.isPrimary ? (
                      <button className="secondary" type="button" onClick={() => setPrimaryAssetFile(file.id)}>Definir principale</button>
                    ) : null}
                    <button className="secondary" type="button" onClick={() => deleteAssetFile(file.id)}>Supprimer</button>
                  </div>
                </article>
              ))}
              {imageFiles(unit).length ? null : <p className="summary">Aucune autre photo.</p>}
            </div>
          </div>
          <div className="asset-files-side">
            <div>
              <strong>Pieces jointes</strong>
              <div className="file-list">
                {documentFiles(unit).map((file) => (
                  <article className="file-item" key={file.id}>
                    <a href={file.filePath} target="_blank">Ouvrir le document</a>
                    <div>
                      <p className="fact-line"><strong>{file.fileLabel || file.fileName}</strong><span>{label(options.assetFileOptions?.fileTypes, file.fileType)}</span></p>
                      <p className="summary">{Math.round(file.fileSize / 1024)} Ko</p>
                      {file.notes ? <p className="summary">{file.notes}</p> : null}
                      <div className="form-actions">
                        <button className="secondary" type="button" onClick={() => deleteAssetFile(file.id)}>Supprimer</button>
                      </div>
                    </div>
                  </article>
                ))}
                {documentFiles(unit).length ? null : <p className="summary">Aucune piece jointe.</p>}
              </div>
            </div>
            <div className="asset-upload-card">
              <strong>Ajouter un fichier</strong>
              <div className="form">
                <label>
                  <span>Fichier</span>
                  <input
                    key={fileInputKey}
                    name="assetFile"
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
                    onChange={(event) => setFileForm({ ...fileForm, file: event.target.files?.[0] || null })}
                  />
                </label>
                <div className="split-fields">
                  <label>
                    <span>Type</span>
                    <select value={fileForm.fileType} onChange={(event) => setFileForm({ ...fileForm, fileType: event.target.value, isPrimary: event.target.value === "MAIN_PHOTO" ? true : fileForm.isPrimary })}>
                      {options.assetFileOptions?.fileTypes?.map((type) => (
                        <option key={type.code} value={type.code}>{type.label}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Libelle</span>
                    <input value={fileForm.fileLabel} onChange={(event) => setFileForm({ ...fileForm, fileLabel: event.target.value })} />
                  </label>
                </div>
                <label>
                  <span>Note</span>
                  <textarea value={fileForm.notes} onChange={(event) => setFileForm({ ...fileForm, notes: event.target.value })} />
                </label>
                <label className="checkbox-row">
                  <input type="checkbox" checked={fileForm.isPrimary} onChange={(event) => setFileForm({ ...fileForm, isPrimary: event.target.checked })} />
                  <span>Definir comme photo principale</span>
                </label>
                <button className="secondary" type="button" onClick={submitAssetFile}>Ajouter le fichier</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="info-box">
        <strong>Historique detaille</strong>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Evenement</th>
                <th>Reference</th>
                <th>Emplacement</th>
                <th>Observation</th>
              </tr>
            </thead>
            <tbody>
              {historyLines.map((line) => (
                <tr key={line.key}>
                  <td>{formatDate(line.date)}</td>
                  <td>{line.event}</td>
                  <td>{line.reference || "-"}</td>
                  <td>{line.location}</td>
                  <td>{line.note}</td>
                </tr>
              ))}
              {historyLines.length ? null : (
                <tr>
                  <td colSpan="5">Aucun historique detaille disponible.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="asset-save-row">
        <Link className="button secondary" href="/parc">Retour au parc</Link>
        <button className="button" type="submit">Enregistrer la fiche bien</button>
      </div>
    </form>
  );
}
