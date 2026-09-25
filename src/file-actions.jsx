import React, { useEffect, useRef, useState } from "react";
import { download } from "./exports.js";

// Prepare first; open, download and share only from a fresh user tap.
export function FileActions({ file, lang, onShare, onClose, onError }) {
  const [url, setUrl] = useState("");
  const downloadRef = useRef();
  const t = (ar, en) => (lang === "en" ? en : ar);
  useEffect(() => {
    const objectUrl = URL.createObjectURL(file.blob);
    setUrl(objectUrl);
    downloadRef.current?.focus({ preventScroll: true });
    return () => {
      // A preview opened just before closing this panel still needs time to load.
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
    };
  }, [file]);
  return (
    <section
      className="file-ready"
      role="region"
      aria-label={t("الملف جاهز", "File ready")}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <div className="file-ready-heading">
        <div>
          <strong>{t("الملف جاهز", "File ready")}</strong>
          <p>{file.name}</p>
        </div>
        <button
          className="text-control"
          aria-label={t("إغلاق خيارات الملف", "Close file options")}
          onClick={onClose}
        >
          {t("إغلاق", "Close")}
        </button>
      </div>
      <div className="file-ready-actions">
        <button
          ref={downloadRef}
          className="button primary"
          onClick={() => {
            try {
              download(file.blob, file.name);
            } catch {
              onError(
                t(
                  "تعذّر التنزيل. أعد المحاولة أو اختر المشاركة.",
                  "Download failed. Retry or choose Share.",
                ),
              );
            }
          }}
        >
          {t("تنزيل الملف", "Download file")}
        </button>
        <button className="button" onClick={onShare}>
          {t("مشاركة", "Share")}
        </button>
        {file.blob.type === "application/pdf" && url && (
          <a
            className="button"
            href={url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t("فتح في تبويب جديد", "Open in new tab")}
          </a>
        )}
      </div>
    </section>
  );
}
