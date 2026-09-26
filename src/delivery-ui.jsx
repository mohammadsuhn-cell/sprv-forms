import React, { useEffect, useRef, useState } from "react";
import {
  activate,
  deliver,
  deliveryState,
  parseInvitation,
  previewInvitation,
  reconcileSaved,
  retryDelivery,
} from "./delivery.js";

export function useDelivery(saved, enabled) {
  const [state, setState] = useState({
    connection: null,
    records: [],
    pending: 0,
    blocked: 0,
    ready: false,
  });
  const [error, setError] = useState("");
  const mounted = useRef(true);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const refresh = async () => {
    const next = await deliveryState();
    if (mounted.current) setState({ ...next, ready: true });
    return next;
  };
  const tick = async () => {
    try {
      if (enabledRef.current) {
        await reconcileSaved();
        await refresh();
        await deliver();
      }
      await refresh();
      if (mounted.current) setError("");
    } catch {
      if (mounted.current) {
        setError("تعذّر حفظ قائمة الإرسال على هذا الجهاز");
        setState((s) => ({ ...s, ready: true }));
      }
    }
  };
  useEffect(() => {
    mounted.current = true;
    tick();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") tick();
    }, 15000);
    const visible = () => {
      if (document.visibilityState === "visible") tick();
    };
    window.addEventListener("online", tick);
    window.addEventListener("storage", tick);
    document.addEventListener("visibilitychange", visible);
    return () => {
      mounted.current = false;
      clearInterval(timer);
      window.removeEventListener("online", tick);
      window.removeEventListener("storage", tick);
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);
  useEffect(() => {
    tick();
  }, [saved, enabled]);
  return {
    ...state,
    error,
    refresh,
    tick,
    retry: async () => {
      if (enabledRef.current) await retryDelivery();
      await refresh();
    },
  };
}
export function DeliveryPanel({
  delivery,
  t,
  onActivated,
  onShareExisting,
  existingCount,
  initialInvitation = "",
}) {
  const [link, setLink] = useState(initialInvitation);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function run(fn) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel delivery-panel">
      <h2>{t("اتصال الإشراف العام", "General supervision connection")}</h2>
      {delivery.connection ? (
        <>
          <p>
            <strong>{delivery.connection.supervisor.name}</strong> ·{" "}
            {delivery.connection.supervisor.grade}
          </p>
          <p role="status">
            {delivery.blocked
              ? t("سجلات تحتاج مراجعة", "Records need review")
              : delivery.pending
                ? t("بانتظار الإرسال", "Awaiting delivery")
                : t("لا توجد سجلات بانتظار الإرسال", "No pending records")}{" "}
            · {delivery.pending}
          </p>
          <div className="backup-buttons">
            <button
              className="button"
              disabled={busy}
              onClick={() => run(() => delivery.retry())}
            >
              {t("إعادة محاولة الإرسال", "Retry delivery")}
            </button>
            {existingCount > 0 && (
              <button
                className="button"
                disabled={busy}
                onClick={onShareExisting}
              >
                {t("إرسال المحفوظات السابقة", "Send earlier saved forms")} (
                {existingCount})
              </button>
            )}
          </div>
          {delivery.records
            .filter((r) => r.blocked)
            .map((r) => (
              <p className="alert" key={r.formId}>
                {r.error}
              </p>
            ))}
        </>
      ) : (
        <>
          <label className="field">
            <span>{t("رابط التفعيل", "Activation link")}</span>
            <input
              type="text"
              dir="ltr"
              value={link}
              autoComplete="off"
              onChange={(e) => {
                setLink(e.target.value);
                setPreview(null);
              }}
            />
          </label>
          {!preview ? (
            <button
              className="button"
              disabled={busy || !link}
              onClick={() =>
                run(async () => {
                  const invitation = parseInvitation(link);
                  const info = await previewInvitation(invitation);
                  setPreview({ invitation, info });
                })
              }
            >
              {t("عرض بيانات الاتصال", "Review connection")}
            </button>
          ) : (
            <>
              <p>
                <strong>{preview.info.supervisor.name}</strong> ·{" "}
                {preview.info.supervisor.grade}
              </p>
              <p>
                {t(
                  "تُرسل النماذج بعد حفظها إلى الإشراف العام. تبقى المسودات على جهازك.",
                  "Saved forms are sent to general supervision. Drafts stay on your device.",
                )}
              </p>
              <button
                className="button primary"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    const c = await activate(preview.invitation);
                    await onActivated(c);
                    setLink("");
                    setPreview(null);
                    await delivery.refresh();
                  })
                }
              >
                {t("تفعيل الاتصال", "Activate connection")}
              </button>
            </>
          )}
        </>
      )}
      {(error || delivery.error) && (
        <p className="alert" role="alert">
          {error || delivery.error}
        </p>
      )}
    </section>
  );
}
