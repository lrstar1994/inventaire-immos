"use client";

import { useState } from "react";

function unavailableMessage(file, preview = false) {
  if (file?.accessStatus === "invalid") {
    return "Fichier indisponible.";
  }

  return preview
    ? "Aperçu indisponible. Rechargez la page."
    : "Fichier indisponible. Rechargez la page.";
}

export function AssetFileImage({ file, alt, className }) {
  const [failed, setFailed] = useState(false);
  const available =
    file?.accessStatus === "available" && Boolean(file.accessUrl) && !failed;

  if (!available) {
    return (
      <span className={`${className ?? ""} asset-file-unavailable`}>
        {unavailableMessage(file, true)}
      </span>
    );
  }

  return (
    <img
      src={file.accessUrl}
      alt={alt}
      className={className}
      onError={() => setFailed(true)}
    />
  );
}

export function AssetFileLink({ file, children }) {
  const available =
    file?.accessStatus === "available" && Boolean(file.accessUrl);

  if (!available) {
    return (
      <span className="asset-file-unavailable">
        {unavailableMessage(file)}
      </span>
    );
  }

  return (
    <a
      href={file.accessUrl}
      target="_blank"
      rel="noopener noreferrer"
      download={file.fileName || undefined}
    >
      {children}
    </a>
  );
}
