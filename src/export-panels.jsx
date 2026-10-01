import React, { useState } from "react";
import { FileActions } from "./file-actions.jsx";

export function ExportButtons({ title, formats, busy, onPrepare }) {
  return (
    <div className="export-toolbar">
      <strong>{title}</strong>
      <div className="history-actions">
        {formats.map((extension) => (
          <button
            className="button"
            key={extension}
            disabled={busy}
            onClick={() => onPrepare(extension)}
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
  );
}

export function ExportOptions({ title, formats, busy, onPrepare }) {
  return (
    <section className="history-export" aria-label={title}>
      <ExportButtons
        title={title}
        formats={formats}
        busy={busy}
        onPrepare={onPrepare}
      />
    </section>
  );
}

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
      <ExportButtons
        title={title}
        formats={formats}
        busy={busy}
        onPrepare={(extension) => {
          setPosition(where);
          onPrepare(extension);
        }}
      />
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
