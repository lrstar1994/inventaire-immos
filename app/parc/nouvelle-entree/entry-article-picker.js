"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ActionFeedback, { actionError } from "@/app/components/action-feedback";

const modeLabels = { I: "Individuel", Q: "Quantité", QI: "Quantité individualisable", E: "Indisponible" };

export default function EntryArticlePicker({ locations }) {
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
    <div className="section-heading park-heading wizard-heading"><div><p className="eyebrow">Nouvelle entrée</p><h1>Choisir l’article / modèle</h1><p className="summary">Aucun brouillon n’est créé avant votre confirmation.</p></div><Link className="button secondary" href="/parc">Retour au parc</Link></div>
    <ActionFeedback feedback={feedback} onClose={() => setFeedback(null)} />
    <div className="entry-picker-layout">
      <section className="panel entry-picker-results">
        <label><span>Rechercher un article ou modèle</span><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nom, code ou famille…" /></label>
        <p className="summary">{searchLoading ? "Recherche…" : `${results.length} référence(s) affichée(s) (maximum 20)`}</p>
        {searchError ? <p className="error-text">{searchError}</p> : null}
        <div className="entry-picker-list">{results.map((item) => <button className={`entry-picker-item ${selected?.id === item.id ? "selected" : ""}`} key={item.id} type="button" onClick={() => setSelected(item)}><span><strong>{item.name}</strong><small>{item.code} · {item.category?.name || "Famille non renseignée"}</small></span><span className="status-pill">{modeLabels[item.category?.trackingMode] || item.category?.trackingMode}</span></button>)}{!searchLoading && !results.length ? <p className="empty-state">Aucun article ne correspond à la recherche.</p> : null}</div>
      </section>
      <aside className="panel entry-picker-start"><h2>Démarrer l’entrée</h2><p className="summary">{selected ? selected.name : "Choisissez d’abord un article."}</p><label><span>Quantité</span><input min="1" step="1" type="number" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label><label><span>Emplacement initial</span><select value={locationId} onChange={(event) => setLocationId(event.target.value)}><option value="">Choisir</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label><div className="info-box">La confirmation crée uniquement un brouillon : aucun bien ni stock n’est créé.</div><button className="button" disabled={busy || !selected || !locationId} type="button" onClick={startDraft}>{busy ? "Création…" : "Créer le brouillon"}</button></aside>
    </div>
  </>;
}
