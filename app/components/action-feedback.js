"use client";

import Link from "next/link";

export function actionError(message, title = "Action impossible") {
  return { type: "error", title, message };
}

export function actionSuccess({ title, message, item, code, status, details, action }) {
  return { type: "success", title, message, item, code, status, details, action };
}

export default function ActionFeedback({ feedback, onClose }) {
  if (!feedback) return null;
  const value = typeof feedback === "string"
    ? { type: "error", title: "Action à vérifier", message: feedback }
    : feedback;
  const action = value.action;
  return (
    <section className={`action-feedback ${value.type || "info"}`} role={value.type === "error" ? "alert" : "status"} aria-live="polite">
      <div className="action-feedback-head">
        <strong>{value.title || (value.type === "error" ? "Action impossible" : "Action confirmée")}</strong>
        {onClose ? <button aria-label="Fermer la confirmation" className="secondary" type="button" onClick={onClose}>Fermer</button> : null}
      </div>
      {value.message ? <p>{value.message}</p> : null}
      <div className="action-feedback-facts">
        {value.item ? <span><small>Élément</small><strong>{value.item}</strong></span> : null}
        {value.code ? <span><small>Code / numéro</small><strong>{value.code}</strong></span> : null}
        {value.status ? <span><small>Statut</small><strong>{value.status}</strong></span> : null}
        {(value.details || []).map((detail) => <span key={`${detail.label}-${detail.value}`}><small>{detail.label}</small><strong>{detail.value}</strong></span>)}
      </div>
      {action?.href ? <Link className="button secondary" href={action.href}>{action.label}</Link> : null}
      {action?.onClick ? <button className="button secondary" type="button" onClick={action.onClick}>{action.label}</button> : null}
    </section>
  );
}
