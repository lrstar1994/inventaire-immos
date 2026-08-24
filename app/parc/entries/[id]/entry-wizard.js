"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ActionFeedback, { actionError, actionSuccess } from "@/app/components/action-feedback";
import { AssetFileImage, AssetFileLink } from "../../asset-file-access-view";

const STEPS = [["details", "Fiche d’entrée"], ["files", "Photos & documents"], ["finances", "Données financières"], ["review", "Vérification"], ["confirmation", "Confirmation"]];
const dateValue = (value) => value ? String(value).slice(0, 10) : "";
const initialFileForm = { files: [], fileType: "OTHER", fileLabel: "", isPrimary: false };

function entryForm(entry) {
  return { assetItemId: entry.assetItemId, locationId: entry.locationId, quantity: entry.quantity, entryType: entry.entryType, entryDate: dateValue(entry.entryDate), initialCondition: entry.initialCondition, initialStatus: entry.initialStatus, informationStatus: entry.informationStatus, notes: entry.notes || "", supplierKnown: Boolean(entry.supplierKnown), supplierId: entry.supplierId || "", purchaseDateKnown: Boolean(entry.purchaseDateKnown), purchaseDate: dateValue(entry.purchaseDate), priceKnown: Boolean(entry.priceKnown), unitPrice: entry.unitPrice ?? "", totalPrice: entry.totalPrice ?? "", invoiceAvailable: Boolean(entry.invoiceAvailable), invoiceReference: entry.invoiceReference || "" };
}

export default function EntryWizard({ initialData, canWrite }) {
  const router = useRouter();
  const [entry, setEntry] = useState(initialData.entry);
  const [form, setForm] = useState(() => entryForm(initialData.entry));
  const [progress, setProgress] = useState(initialData.progress);
  const [step, setStep] = useState(entry.entryStatus === "VALIDATED" ? "confirmation" : initialData.requestedStep);
  const [feedback, setFeedback] = useState(initialData.created ? actionSuccess({ title: "Brouillon créé", message: "Aucun effet patrimonial n’a été produit.", item: entry.assetItem.name, code: entry.entryNumber, status: "Brouillon" }) : null);
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState([]);
  const [fileOptions, setFileOptions] = useState(initialData.options.assetFiles);
  const [photoForm, setPhotoForm] = useState(initialFileForm);
  const [documentForm, setDocumentForm] = useState(initialFileForm);
  const [fileKey, setFileKey] = useState(0);
  const [serialNumber, setSerialNumber] = useState("");
  const [entrySlip, setEntrySlip] = useState(initialData.entry.documentEntries?.[0]?.document || null);
  const mode = entry.assetItem.category?.trackingMode;
  const activeStep = entry.entryStatus === "VALIDATED" ? "confirmation" : step;
  const photos = files.filter((file) => file.fileKind === "MATERIAL_PHOTO");
  const documents = files.filter((file) => file.fileKind === "SUPPORTING_DOCUMENT");
  const typeLabel = (code) => fileOptions.fileTypes?.find((item) => item.code === code)?.label || code;
  const compatibleTypes = (kind) => fileOptions.fileTypes?.filter((item) => item.code !== "MAIN_PHOTO" && (item.category === (kind === "MATERIAL_PHOTO" ? "image" : "document") || item.category === "mixed")) || [];

  async function loadFiles() {
    const response = await fetch(`/api/asset-entries/${entry.id}/files`);
    const result = await response.json();
    if (!response.ok) return setFeedback(actionError(result.error || "Chargement des fichiers impossible."));
    setFiles(result.files || []); if (result.options) setFileOptions(result.options);
  }
  useEffect(() => { loadFiles(); }, [entry.id]);

  function navigate(next) { setStep(next); router.replace(`/parc/entries/${entry.id}?step=${next}`, { scroll: false }); }

  async function saveDraft({ nextStep, leave = false } = {}) {
    if (entry.entryStatus !== "DRAFT") return setFeedback(actionError("Une entrée validée ne peut plus être modifiée."));
    setBusy(true); setFeedback(null);
    const response = await fetch(`/api/asset-entries/${entry.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const result = await response.json(); setBusy(false);
    if (!response.ok) return setFeedback(actionError(result.message || result.error || "Sauvegarde impossible."));
    setEntry((current) => ({ ...current, ...result.entry, assetItem: current.assetItem, location: initialData.locations.find((item) => item.id === result.entry.locationId) || null, supplier: initialData.suppliers.find((item) => item.id === result.entry.supplierId) || null }));
    setProgress(result.progress);
    setFeedback(actionSuccess({ title: "Brouillon enregistré", message: "Les données sont conservées sans effet patrimonial.", item: entry.assetItem.name, code: entry.entryNumber, status: "Brouillon" }));
    if (leave) return router.push("/parc/entrees-en-cours");
    if (nextStep) navigate(nextStep);
  }

  async function upload(event, kind) {
    event.preventDefault(); const current = kind === "MATERIAL_PHOTO" ? photoForm : documentForm; const selected = Array.from(current.files || []);
    if (!selected.length) return setFeedback(actionError("Choisissez au moins un fichier."));
    setBusy(true); let uploaded = 0;
    for (const [index, file] of selected.entries()) {
      const data = new FormData(); data.append("fileKind", kind); data.append("fileType", current.fileType); data.append("fileLabel", current.fileLabel); data.append("notes", ""); data.append("file", file); if (kind === "MATERIAL_PHOTO") data.append("isPrimary", String(current.isPrimary && index === 0));
      const response = await fetch(`/api/asset-entries/${entry.id}/files`, { method: "POST", body: data }); const result = await response.json();
      if (!response.ok) { setBusy(false); await loadFiles(); return setFeedback(actionError(`${uploaded ? `${uploaded} fichier(s) ajouté(s). ` : ""}${result.error || "Upload impossible."}`)); }
      uploaded += 1;
    }
    await loadFiles(); setBusy(false); setFileKey((value) => value + 1); if (kind === "MATERIAL_PHOTO") setPhotoForm(initialFileForm); else setDocumentForm(initialFileForm);
    setFeedback(actionSuccess({ title: `${uploaded} fichier(s) ajouté(s)`, message: `Les fichiers restent liés au brouillon ${entry.entryNumber}.`, code: entry.entryNumber, status: "Disponible" })); router.refresh();
  }

  async function patchFile(fileId, body, title) {
    const response = await fetch(`/api/asset-entries/${entry.id}/files/${fileId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const result = await response.json();
    if (!response.ok) return setFeedback(actionError(result.error || "Modification impossible."));
    await loadFiles(); setFeedback(actionSuccess({ title, message: "La galerie a été actualisée.", code: entry.entryNumber, status: "Enregistré" })); router.refresh();
  }

  async function deleteFile(fileId) {
    const response = await fetch(`/api/asset-entries/${entry.id}/files/${fileId}`, { method: "DELETE" }); const result = await response.json();
    if (!response.ok) return setFeedback(actionError(result.error || "Suppression impossible."));
    await loadFiles(); setFeedback(actionSuccess({ title: "Fichier supprimé", message: "La suppression logique est enregistrée.", code: entry.entryNumber, status: "Supprimé" })); router.refresh();
  }

  async function validateEntry() {
    if (!progress.readyToValidate) return setFeedback(actionError("Complétez l’identification et l’affectation avant la validation."));
    setBusy(true); setFeedback(null);
    const response = await fetch(`/api/asset-entries/${entry.id}/validate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ serialNumber }) }); const result = await response.json(); setBusy(false);
    if (!response.ok) return setFeedback(actionError(result.message || result.error || "Validation impossible."));
    setEntry((current) => ({ ...current, ...result.entry, assetUnits: result.units || [], quantitativePositions: result.quantitativePosition ? [result.quantitativePosition] : [] })); setEntrySlip(result.entrySlip || null); setProgress(result.progress);
    setFeedback(actionSuccess({ title: "Entrée validée", message: result.entrySlip ? `Patrimoine enregistré et bon ${result.entrySlip.documentNumber} généré en brouillon.` : "La création patrimoniale atomique est terminée.", item: entry.assetItem.name, code: entry.entryNumber, status: "Validée" })); navigate("confirmation"); router.refresh();
  }

  const actions = (previous, next) => <div className="wizard-actions"><button className="secondary" disabled={busy || !canWrite} onClick={() => saveDraft({ leave: true })} type="button">Enregistrer et quitter</button>{previous ? <button className="secondary" onClick={() => navigate(previous)} type="button">Étape précédente</button> : <Link className="button secondary" href="/parc/entrees-en-cours">Entrées en cours</Link>}<button className="button" disabled={busy || !canWrite} onClick={() => saveDraft({ nextStep: next })} type="button">{busy ? "Enregistrement…" : "Continuer"}</button></div>;

  return <><div className="section-heading park-heading wizard-heading"><div><p className="eyebrow">Entrée {entry.entryStatus === "DRAFT" ? "en cours" : "validée"}</p><h1>{STEPS.find(([code]) => code === activeStep)?.[1]}</h1><p className="summary">{entry.entryNumber} · {entry.assetItem.name} · mode {mode}</p></div><div className="hero-actions"><Link className="button secondary" href="/parc/entrees-en-cours">Entrées en cours</Link><Link className="button secondary" href="/parc">Parc physique</Link></div></div><nav className="entry-wizard-steps" aria-label="Progression de l’entrée">{STEPS.map(([code, label], index) => <button className={activeStep === code ? "active" : ""} disabled={busy || (entry.entryStatus === "VALIDATED" && code !== "confirmation") || (entry.entryStatus === "DRAFT" && code === "confirmation")} key={code} onClick={() => entry.entryStatus === "DRAFT" ? saveDraft({ nextStep: code }) : navigate(code)} type="button"><span>{index + 4}</span>{label}</button>)}</nav><ActionFeedback feedback={feedback} onClose={() => setFeedback(null)} />
    {activeStep === "details" ? <Details form={form} setForm={setForm} entry={entry} mode={mode} data={initialData} actions={actions} /> : null}
    {activeStep === "files" ? <Files busy={busy} canWrite={canWrite} compatibleTypes={compatibleTypes} deleteFile={deleteFile} documents={documents} fileKey={fileKey} fileOptions={fileOptions} patchFile={patchFile} photoForm={photoForm} photos={photos} setDocumentForm={setDocumentForm} setPhotoForm={setPhotoForm} typeLabel={typeLabel} upload={upload} actions={actions} documentForm={documentForm} /> : null}
    {activeStep === "finances" ? <Finances form={form} setForm={setForm} suppliers={initialData.suppliers} actions={actions} /> : null}
    {activeStep === "review" ? <Review busy={busy} canWrite={canWrite} data={initialData} documents={documents} entry={entry} form={form} mode={mode} navigate={navigate} photos={photos} progress={progress} serialNumber={serialNumber} setSerialNumber={setSerialNumber} validateEntry={validateEntry} /> : null}
    {activeStep === "confirmation" ? <Confirmation entry={entry} entrySlip={entrySlip} mode={mode} /> : null}</>;
}

function Details({ form, setForm, entry, mode, data, actions }) {
  return <section className="panel wizard-panel"><div className="wizard-section-grid"><div className="form"><h2>Identification</h2><label><span>Numéro d’entrée</span><input disabled value={entry.entryNumber} /></label><label><span>Article / modèle</span><input disabled value={`${entry.assetItem.code} — ${entry.assetItem.name}`} /></label><label><span>Mode de suivi</span><input disabled value={mode} /></label><label><span>Quantité</span><input min="1" step="1" type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></label><label><span>Type d’entrée</span><select value={form.entryType} onChange={(e) => setForm({ ...form, entryType: e.target.value })}>{data.options.entryTypes.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</select></label><label><span>Date d’entrée</span><input type="date" value={form.entryDate} onChange={(e) => setForm({ ...form, entryDate: e.target.value })} /></label><label><span>Notes</span><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label></div><div className="form"><h2>Affectation / état</h2><label><span>Emplacement</span><select value={form.locationId} onChange={(e) => setForm({ ...form, locationId: e.target.value })}>{data.locations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label><span>État initial</span><select value={form.initialCondition} onChange={(e) => setForm({ ...form, initialCondition: e.target.value })}>{data.options.conditions.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</select></label><label><span>Statut initial</span><select value={form.initialStatus} onChange={(e) => setForm({ ...form, initialStatus: e.target.value })}>{data.options.statuses.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</select></label><label><span>Complétude</span><select value={form.informationStatus} onChange={(e) => setForm({ ...form, informationStatus: e.target.value })}>{data.options.informationStatuses.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</select></label><div className="info-box">Mode {mode} : aucun effet patrimonial avant la validation finale.</div></div></div>{actions(null, "files")}</section>;
}

function Files({ actions, busy, canWrite, compatibleTypes, deleteFile, documentForm, documents, fileKey, fileOptions, patchFile, photoForm, photos, setDocumentForm, setPhotoForm, typeLabel, upload }) {
  const accepted = (fileOptions.acceptedExtensions || []).join(", "); const maxSize = Math.round((fileOptions.maxFileSize || 0) / 1024 / 1024);
  return <section className="panel wizard-panel"><div className="wizard-file-grid"><div><h2>Photos du matériel</h2><div className="asset-thumbs">{photos.map((file) => <article className="asset-thumb-card" key={file.id}><AssetFileImage file={file} alt={file.fileLabel || file.fileName} /><strong>{file.fileLabel || file.fileName}</strong><small>{typeLabel(file.fileType)}</small>{file.isPrimary ? <span className="entry-file-badge">Principale</span> : null}{canWrite ? <div className="form-actions">{!file.isPrimary ? <button className="secondary" onClick={() => patchFile(file.id, { isPrimary: true }, "Photo principale définie")} type="button">Définir principale</button> : null}<button className="secondary danger" onClick={() => deleteFile(file.id)} type="button">Supprimer</button></div> : null}</article>)}{!photos.length ? <p>Aucune photo. La photo principale est recommandée mais facultative.</p> : null}</div>{canWrite ? <form className="form asset-upload-card" onSubmit={(e) => upload(e, "MATERIAL_PHOTO")}><label><span>Photos</span><input accept="image/*" key={`p-${fileKey}`} multiple required type="file" onChange={(e) => setPhotoForm({ ...photoForm, files: e.target.files })} /></label><label><span>Catégorie facultative</span><select value={photoForm.fileType} onChange={(e) => setPhotoForm({ ...photoForm, fileType: e.target.value })}>{compatibleTypes("MATERIAL_PHOTO").map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</select></label><label><span>Libellé</span><input value={photoForm.fileLabel} onChange={(e) => setPhotoForm({ ...photoForm, fileLabel: e.target.value })} /></label><label className="checkbox-line"><input checked={photoForm.isPrimary} type="checkbox" onChange={(e) => setPhotoForm({ ...photoForm, isPrimary: e.target.checked })} /><span>Première photo principale</span></label><button className="button" disabled={busy}>Ajouter les photos</button></form> : null}</div><div><h2>Documents justificatifs</h2><ul className="file-list">{documents.map((file) => <li key={file.id}><div><strong>{file.fileLabel || file.fileName}</strong><small>{typeLabel(file.fileType)}</small></div><div className="form-actions"><AssetFileLink file={file}>Ouvrir</AssetFileLink>{canWrite ? <button className="secondary danger" onClick={() => deleteFile(file.id)} type="button">Supprimer</button> : null}</div></li>)}{!documents.length ? <li>Aucun document justificatif.</li> : null}</ul>{canWrite ? <form className="form asset-upload-card" onSubmit={(e) => upload(e, "SUPPORTING_DOCUMENT")}><label><span>Documents</span><input accept="image/*,.pdf" key={`d-${fileKey}`} multiple required type="file" onChange={(e) => setDocumentForm({ ...documentForm, files: e.target.files })} /></label><label><span>Catégorie facultative</span><select value={documentForm.fileType} onChange={(e) => setDocumentForm({ ...documentForm, fileType: e.target.value })}>{compatibleTypes("SUPPORTING_DOCUMENT").map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</select></label><label><span>Libellé</span><input value={documentForm.fileLabel} onChange={(e) => setDocumentForm({ ...documentForm, fileLabel: e.target.value })} /></label><button className="button" disabled={busy}>Ajouter les documents</button></form> : null}</div></div><p className="summary">Formats acceptés : {accepted || "formats configurés"}. Taille maximale : {maxSize} Mo par fichier.</p>{actions("details", "finances")}</section>;
}

function Finances({ form, setForm, suppliers, actions }) {
  return <section className="panel wizard-panel"><div className="info-box">Cette étape est facultative et peut être complétée plus tard.</div><div className="form wizard-finance-form"><label className="checkbox-line"><input checked={form.supplierKnown} type="checkbox" onChange={(e) => setForm({ ...form, supplierKnown: e.target.checked, supplierId: "" })} /><span>Fournisseur connu</span></label>{form.supplierKnown ? <label><span>Fournisseur</span><select value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })}><option value="">Choisir</option>{suppliers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label> : null}<label className="checkbox-line"><input checked={form.purchaseDateKnown} type="checkbox" onChange={(e) => setForm({ ...form, purchaseDateKnown: e.target.checked, purchaseDate: "" })} /><span>Date d’achat connue</span></label>{form.purchaseDateKnown ? <label><span>Date d’achat</span><input type="date" value={form.purchaseDate} onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })} /></label> : null}<label className="checkbox-line"><input checked={form.priceKnown} type="checkbox" onChange={(e) => setForm({ ...form, priceKnown: e.target.checked, unitPrice: "", totalPrice: "" })} /><span>Prix connu</span></label>{form.priceKnown ? <div className="split-fields"><label><span>Prix unitaire Ar</span><input inputMode="numeric" min="0" type="number" value={form.unitPrice} onChange={(e) => setForm({ ...form, unitPrice: e.target.value })} /></label><label><span>Prix total Ar</span><input inputMode="numeric" min="0" type="number" value={form.totalPrice} onChange={(e) => setForm({ ...form, totalPrice: e.target.value })} /></label></div> : null}<label className="checkbox-line"><input checked={form.invoiceAvailable} type="checkbox" onChange={(e) => setForm({ ...form, invoiceAvailable: e.target.checked, invoiceReference: "" })} /><span>Facture disponible</span></label>{form.invoiceAvailable ? <label><span>Référence facture</span><input value={form.invoiceReference} onChange={(e) => setForm({ ...form, invoiceReference: e.target.value })} /></label> : null}</div>{actions("files", "review")}</section>;
}

function Review({ busy, canWrite, data, documents, entry, form, mode, navigate, photos, progress, serialNumber, setSerialNumber, validateEntry }) {
  return <section className="panel wizard-panel"><div className="review-grid"><article><h2>Identification</h2><p><strong>{entry.assetItem.name}</strong></p><p>{entry.assetItem.code} · mode {mode}</p><p>Quantité : {form.quantity}</p><button className="secondary" onClick={() => navigate("details")} type="button">Modifier</button></article><article><h2>Affectation / état</h2><p>{data.locations.find((item) => item.id === form.locationId)?.name || "À compléter"}</p><p>{form.initialCondition} · {form.initialStatus}</p><button className="secondary" onClick={() => navigate("details")} type="button">Modifier</button></article><article><h2>Photos & documents</h2><p>{photos.length} photo(s), {documents.length} document(s)</p><p>Photo principale : {photos.some((file) => file.isPrimary) ? "oui" : "non (facultative)"}</p><button className="secondary" onClick={() => navigate("files")} type="button">Modifier</button></article><article><h2>Données financières</h2><p>Fournisseur : {form.supplierKnown ? data.suppliers.find((item) => item.id === form.supplierId)?.name || "À préciser" : "Non renseigné"}</p><p>Prix : {form.priceKnown ? `${form.totalPrice || form.unitPrice || 0} Ar` : "Non renseigné (facultatif)"}</p><button className="secondary" onClick={() => navigate("finances")} type="button">Modifier</button></article></div><div className={progress.readyToValidate ? "info-box" : "warning-box"}><strong>{progress.readyToValidate ? "Préconditions métier satisfaites" : "Entrée à compléter"}</strong><p>Article, quantité entière, date, emplacement, état et statut sont les prérequis. Photos, documents et finances sont facultatifs.</p></div>{mode === "I" && Number(form.quantity) === 1 ? <label className="form"><span>Numéro de série (facultatif, appliqué à la validation)</span><input value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} /></label> : null}<div className="wizard-actions"><button className="secondary" onClick={() => navigate("finances")} type="button">Retour</button><button className="button" disabled={busy || !canWrite || !progress.readyToValidate} onClick={validateEntry} type="button">{busy ? "Validation en cours…" : "Valider l’entrée"}</button></div></section>;
}

function Confirmation({ entry, entrySlip, mode }) {
  const units = entry.assetUnits || []; const position = (entry.quantitativePositions || entry.quantitativeStockPositions)?.[0];
  return <section className="panel wizard-confirmation"><div className="confirmation-mark">✓</div><h2>Entrée validée avec succès</h2><p><strong>{entry.entryNumber}</strong></p><p>{entry.assetItem.name} · mode {mode}</p><p>Emplacement : {entry.location?.name || position?.location?.name || "-"}</p><p>Statut : Validée</p>{mode === "I" ? <div className="info-box">{units.length} bien(s) individualisé(s) créé(s).{units.length === 1 ? <><br /><Link href={`/parc/${units[0].id}`}>Ouvrir la fiche du bien {units[0].assetCode}</Link></> : null}</div> : <div className="info-box">Stock quantitatif créé : {position?.availableQuantity ?? entry.quantity} unité(s).</div>}{entrySlip ? <div className="info-box"><strong>Bon d’entrée généré : {entrySlip.documentNumber}</strong><br />Statut : Brouillon. Sa validation reste une opération documentaire séparée.</div> : <div className="warning-box">Bon d’entrée indisponible.</div>}<div className="form-actions">{entrySlip ? <Link className="button" href={`/documents?documentId=${entrySlip.id}`}>Voir le bon d’entrée</Link> : null}<Link className="button secondary" href="/parc/nouvelle-entree">Nouvelle entrée</Link><Link className="button secondary" href="/parc">Retour au parc physique</Link></div></section>;
}
