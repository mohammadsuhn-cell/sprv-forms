import React, { useState } from "react";
import { FileActions } from "./file-actions.jsx";

// Both ends operate on one preparation/file state owned by the caller.
export function ExportPanels({
  title,
  formats = ["pdf", "docx", "xlsx"],
  busy,
  error,
  file,
  lang,
  t,
  onPrepare,
  onShare,
  onClose,
  onError,
  children,
}) {
  const [position, setPosition] = useState("top");
  const controls = (where) => (
    <section
      className="history-export"
      data-position={where}
      aria-label={title}
    >
      <div className="export-toolbar">
        <strong>{title}</strong>
        <div className="history-actions">
          {formats.map((extension) => (
            <button
              className="button"
              key={extension}
              disabled={busy}
              onClick={() => {
                setPosition(where);
                onPrepare(extension);
              }}
            >
              {extension === "docx"
                ? "Word"
                : extension === "xlsx"
                  ? "Excel"
                  : "PDF"}
            </button>
          ))}
        </div>
      </div>
      {where === position && (
        <>
          {busy && (
            <p role="status">{t("جارٍ تجهيز الملف…", "Preparing document…")}</p>
          )}
          {error && <p role="alert">{error}</p>}
          {file && (
            <FileActions
              file={file}
              lang={lang}
              onShare={onShare}
              onClose={onClose}
              onError={onError}
            />
          )}
        </>
      )}
    </section>
  );
  return (
    <>
      {controls("top")}
      {children}
      {controls("bottom")}
    </>
  );
}
