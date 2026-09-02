"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ActionFeedback, { actionError, actionSuccess } from "@/app/components/action-feedback";
import EntryWorkflowStepper from "../entry-workflow-stepper";

const modeLabels = { I: "Individuel", Q: "Quantité", QI: "Quantité individualisable", E: "Indisponible" };

const emptyArticleForm = { categoryId: "", name: "", code: "", description: "" };

export default function EntryArticlePicker({ locations, canCreateArticle = false }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(null);
  const [searchLoading, setSearchLoading] = useState(true);
  const [searchError, setSearchError] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [locationId, setLocationId] = useState("");
  const [feedback, setFeedback] = useState(null);
  const [busy, setBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [articleForm, setArticleForm] = useState(emptyArticleForm);
  const [familyQuery, setFamilyQuery] = useState("");
  const [families, setFamilies] = useState([]);
  const [familyLoading, setFamilyLoading] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearchLoading(true);
      setSearchError("");
      try {
        const params = new URLSearchParams({ picker: "true", limit: "20" });
        if (query.trim()) params.set("search", query.trim());
        const response = await fetch(`/api/asset-items?${params}`, { signal: controller.signal });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || result.error || "Recherche impossible.");
        setResults(result.items || []);
      } catch (error) {
        if (error.name !== "AbortError") setSearchError(error.message || "Recherche impossible.");
      } finally {
        if (!controller.signal.aborted) setSearchLoading(false);
      }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query]);

  useEffect(() => {
    if (!createOpen || !canCreateArticle) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setFamilyLoading(true);
      try {
        const params = new URLSearchParams({ picker: "true", limit: "20" });
        if (familyQuery.trim()) params.set("search", familyQuery.trim());
        const response = await fetch(`/api/asset-categories?${params}`, { signal: controller.signal });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || result.error || "Recherche des familles impossible.");
        setFamilies(result.items || []);
      } catch (error) {
        if (error.name !== "AbortError") setFeedback(actionError(error.message || "Recherche des familles impossible."));
      } finally {
        if (!controller.signal.aborted) setFamilyLoading(false);
      }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [canCreateArticle, createOpen, familyQuery]);

  function closeQuickCreate() {
    if (createBusy) return;
    setCreateOpen(false);
    setArticleForm(emptyArticleForm);
    setFamilyQuery("");
  }

  async function createAndSelectArticle(event) {
    event.preventDefault();
    const name = articleForm.name.trim();
    const code = articleForm.code.trim();
    if (!articleForm.categoryId || !name || !code) return setFeedback(actionError("La famille, la désignation et le code référence sont obligatoires."));
    setCreateBusy(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/asset-items", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ categoryId: articleForm.categoryId, name, code, description: articleForm.description.trim() || null }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || result.error || "Création de l’article impossible.");
      const item = result.item;
      setResults((current) => [item, ...current.filter((candidate) => candidate.id !== item.id)].slice(0, 20));
      setSelected(item);
      setCreateOpen(false);
      setArticleForm(emptyArticleForm);
      setFamilyQuery("");
      setFeedback(actionSuccess({ title: "Article créé et sélectionné", message: "La référence est prête pour cette nouvelle entrée. Aucun brouillon ni patrimoine n’a encore été créé.", item: item.name, code: item.code, status: "Référence active" }));
    } catch (error) {
      setFeedback(actionError(error.message || "Création de l’article impossible."));
    } finally {
      setCreateBusy(false);
    }
  }

  async function startDraft() {
    if (!selected || !locationId || !Number.isInteger(Number(quantity)) || Number(quantity) < 1) return setFeedback(actionError("Choisissez un article, une quantité entière et un emplacement."));
    if (selected.category?.trackingMode === "E") return setFeedback(actionError("Le mode Ensemble est déprécié et ne peut pas créer d’entrée."));
    setBusy(true);
    setFeedback(null);
    const response = await fetch("/api/asset-entries/drafts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assetItemId: selected.id, locationId, quantity: Number(quantity), entryType: "PROGRESSIVE_INVENTORY", entryDate: new Date().toISOString().slice(0, 10), initialCondition: "GOOD", initialStatus: "IN_STOCK", informationStatus: "PARTIAL", supplierKnown: false })
    });
    const result = await response.json();
    if (!response.ok) {
      setFeedback(actionError(result.message || result.error || "Création du brouillon impossible."));
      setBusy(false);
      return;
    }
    router.push(`/parc/entries/${result.entry.id}?created=1`);
  }

  return <>
    <div className="section-heading park-heading wizard-heading ui-page-heading"><div><h1>Choisir l’article</h1><p className="summary">Sélectionnez le modèle à enregistrer pour commencer la fiche du bien.</p></div></div>
    <EntryWorkflowStepper active={3} />
    <ActionFeedback feedback={feedback} onClose={() => setFeedback(null)} />
    <div className="entry-picker-layout">
      <section className="panel entry-picker-results">
        <h2>Article / modèle</h2>
        <label className="ui-search-field"><span>⌕</span><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher un article, une famille ou un modèle…" /></label>
        <div className="picker-filter-bar"><span className="ui-filter-chip">Famille</span><span className="ui-filter-chip">Mode</span><span className="ui-filter-chip muted">☆ Résultats les plus pertinents</span></div>
        <p className="summary">{searchLoading ? "Recherche…" : `${results.length} référence(s) affichée(s) (maximum 20)`}</p>
        {searchError ? <p className="error-text">{searchError}</p> : null}
        <div className="entry-picker-list">{results.map((item) => <button className={`entry-picker-item ${selected?.id === item.id ? "selected" : ""}`} key={item.id} type="button" onClick={() => setSelected(item)}><span><strong>{item.name}</strong><small>{item.code}</small></span><span className="picker-family">{item.category?.name || "Famille non renseignée"}</span><span className="status-pill">{modeLabels[item.category?.trackingMode] || item.category?.trackingMode}</span></button>)}{!searchLoading && !results.length ? <p className="empty-state">Aucun article ne correspond à la recherche.</p> : null}</div>
        {canCreateArticle ? <div className="quick-create-trigger"><button className="button secondary" type="button" onClick={() => setCreateOpen(true)}>＋ Créer un nouvel article</button><small>Réservé aux gestionnaires autorisés du référentiel.</small></div> : null}
      </section>
      <div className="picker-side-column"><aside className="panel entry-picker-start"><h2>Nouvelle entrée</h2><label><span>Article / modèle</span><input readOnly value={selected?.name || "Sélectionnez un article"} /></label><label><span>Quantité</span><input min="1" step="1" type="number" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label><label><span>Emplacement</span><select value={locationId} onChange={(event) => setLocationId(event.target.value)}><option value="">Sélectionner un emplacement</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label><label><span>Type d'entrée</span><input readOnly value="Inventaire progressif" /></label><label><span>Date d'entrée</span><input readOnly value={new Intl.DateTimeFormat("fr-FR").format(new Date())} /></label><label><span>État initial</span><input readOnly value="Bon état" /></label><label><span>Statut initial</span><input readOnly value="En stock" /></label><label><span>Complétude</span><input readOnly value="Partielle" /></label><div className="picker-actions"><button className="secondary" disabled={busy || !selected || !locationId} type="button" onClick={startDraft}>Enregistrer en brouillon</button><button className="button" disabled={busy || !selected || !locationId} type="button" onClick={startDraft}>{busy ? "Création…" : "Continuer →"}</button></div></aside><aside className="panel picker-advice"><strong>💡 Conseil</strong><p>La recherche serveur vous aide à trouver rapidement le bon article sans parcourir tout le référentiel. Aucun bien ni stock n’est créé avant votre confirmation.</p></aside></div>
    </div>
    {createOpen && canCreateArticle ? <div className="quick-create-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeQuickCreate(); }}><section aria-labelledby="quick-create-title" aria-modal="true" className="panel quick-create-dialog" role="dialog"><div className="quick-create-heading"><div><span className="eyebrow">Référentiel</span><h2 id="quick-create-title">Nouvel article</h2><p>Créez uniquement la référence nécessaire, puis poursuivez la même entrée.</p></div><button aria-label="Fermer" className="secondary quick-create-close" disabled={createBusy} type="button" onClick={closeQuickCreate}>×</button></div><form onSubmit={createAndSelectArticle}><label><span>Rechercher une famille existante</span><input value={familyQuery} onChange={(event) => setFamilyQuery(event.target.value)} placeholder="Nom ou code de famille" /></label><label><span>Famille *</span><select required value={articleForm.categoryId} onChange={(event) => setArticleForm((current) => ({ ...current, categoryId: event.target.value }))}><option value="">{familyLoading ? "Recherche…" : "Sélectionner une famille active"}</option>{families.map((family) => <option key={family.id} value={family.id}>{family.name} — {modeLabels[family.trackingMode] || family.trackingMode}</option>)}</select></label><div className="quick-create-fields"><label><span>Désignation / nom *</span><input required value={articleForm.name} onChange={(event) => setArticleForm((current) => ({ ...current, name: event.target.value }))} /></label><label><span>Code référence *</span><input required value={articleForm.code} onChange={(event) => setArticleForm((current) => ({ ...current, code: event.target.value }))} /></label></div><label><span>Description <small>(facultative)</small></span><textarea rows="3" value={articleForm.description} onChange={(event) => setArticleForm((current) => ({ ...current, description: event.target.value }))} /></label><p className="quick-create-note">Le mode de suivi I, Q ou QI sera repris automatiquement depuis la famille choisie. Cette action ne crée aucun bien, stock, mouvement ou brouillon d’entrée.</p><div className="quick-create-actions"><button className="button secondary" disabled={createBusy} type="button" onClick={closeQuickCreate}>Annuler</button><button className="button" disabled={createBusy} type="submit">{createBusy ? "Création…" : "Créer et sélectionner"}</button></div></form></section></div> : null}
  </>;
}
