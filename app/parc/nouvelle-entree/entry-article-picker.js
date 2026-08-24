"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ActionFeedback, { actionError } from "@/app/components/action-feedback";

const modeLabels = { I: "Individuel", Q: "Quantité", QI: "Quantité individualisable", E: "Indisponible" };

export default function EntryArticlePicker({ assetItems, locations }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [locationId, setLocationId] = useState("");
  const [feedback, setFeedback] = useState(null);
  const [busy, setBusy] = useState(false);
  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    return term ? assetItems.filter((item) => [item.name, item.code, item.category?.name].filter(Boolean).some((value) => value.toLowerCase().includes(term))) : assetItems;
  }, [assetItems, query]);
  const selected = assetItems.find((item) => item.id === selectedId);

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
        <p className="summary">{results.length} référence(s) disponible(s)</p>
        <div className="entry-picker-list">{results.map((item) => <button className={`entry-picker-item ${selectedId === item.id ? "selected" : ""}`} key={item.id} type="button" onClick={() => setSelectedId(item.id)}><span><strong>{item.name}</strong><small>{item.code} · {item.category?.name || "Famille non renseignée"}</small></span><span className="status-pill">{modeLabels[item.category?.trackingMode] || item.category?.trackingMode}</span></button>)}{!results.length ? <p className="empty-state">Aucun article ne correspond à la recherche.</p> : null}</div>
      </section>
      <aside className="panel entry-picker-start"><h2>Démarrer l’entrée</h2><p className="summary">{selected ? selected.name : "Choisissez d’abord un article."}</p><label><span>Quantité</span><input min="1" step="1" type="number" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label><label><span>Emplacement initial</span><select value={locationId} onChange={(event) => setLocationId(event.target.value)}><option value="">Choisir</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label><div className="info-box">La confirmation crée uniquement un brouillon : aucun bien ni stock n’est créé.</div><button className="button" disabled={busy || !selected || !locationId} type="button" onClick={startDraft}>{busy ? "Création…" : "Créer le brouillon"}</button></aside>
    </div>
  </>;
}
