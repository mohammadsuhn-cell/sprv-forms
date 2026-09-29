import React, { useEffect, useRef, useState } from "react";
import {
  activate,
  deliver,
  deliveryState,
  parseInvitation,
  previewInvitation,
  reconcileSaved,
  retryDelivery,
  queueWithdrawal,
} from "./delivery.js";
import { titles, dateLabel } from "./model.js";

export function WithdrawalAction({ record, delivery, t }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!record) return null;
  return (
    <div className="withdrawal-action">
      {record.withdrawalRequestedAt ? (
        <span role="status">
          {record.withdrawn
            ? t("تم سحب التقرير", "Report withdrawn")
            : record.blocked
              ? t(
                  "سحب التقرير يحتاج مراجعة في الإعدادات",
                  "Withdrawal needs review in Settings",
                )
              : t(
                  "بانتظار تأكيد سحب التقرير",
                  "Awaiting withdrawal confirmation",
                )}
        </span>
      ) : (
        <button
          className="text-control danger"
          disabled={busy}
          onClick={async () => {
            if (
              !confirm(
                t(
                  "سحب هذا التقرير من الإشراف العام؟ لن يُحتسب بعد تأكيد الاستلام وتحديث بيانات المدرسة، وسيبقى في سجل المراجعة. لا يمكن إعادة إرسال التقرير نفسه.",
                  "Withdraw this report from general supervision? After confirmation and a school-data update it will no longer count. Its audit history remains, and this report cannot be resubmitted.",
                ),
              )
            )
              return;
            setBusy(true);
            setError("");
            try {
              await queueWithdrawal(record.formId);
              await delivery.refresh();
              void delivery.tick();
            } catch (e) {
              setError(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {t("سحب التقرير المرسل", "Withdraw submitted report")}
        </button>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}

function SubmittedReports({ delivery, t }) {
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(20);
  const rows = delivery.records
    .filter((r) =>
      `${r.label} ${r.date} ${r.receipt?.reference || ""}`.includes(
        query.trim(),
      ),
    )
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) || a.formId.localeCompare(b.formId),
    );
  return (
    <details className="submitted-reports">
      <summary>
        {t("التقارير المرسلة وسحب تقرير", "Submitted reports and withdrawals")}
      </summary>
      <p className="hint">
        {t(
          "يمكن سحب تقرير حتى بعد حذف نسخته من هذا الجهاز. السحب يحتاج اتصالًا وتأكيد استلام؛ النسخ الاحتياطية وحدها لا تسحب التقارير.",
          "You can withdraw a report even after deleting its device copy. Withdrawal needs a connection and receipt; backups alone do not withdraw reports.",
        )}
      </p>
      <label className="field">
        <span>{t("بحث في التقارير المرسلة", "Search submitted reports")}</span>
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setLimit(20);
          }}
        />
      </label>
      {rows.slice(0, limit).map((record) => (
        <div
          className="submitted-report"
          key={record.formId}
          data-form-id={record.formId}
        >
          <strong>
            {t(...(titles[record.kind] || [record.kind, record.kind]))} ·{" "}
            {dateLabel(record.date)}
          </strong>
          <p>
            {record.label} {record.receipt?.reference || ""}
          </p>
          <WithdrawalAction record={record} delivery={delivery} t={t} />
          {record.error && <p role="alert">{record.error}</p>}
        </div>
      ))}
      {rows.length > limit && (
        <button className="button" onClick={() => setLimit(limit + 20)}>
          {t("عرض المزيد", "Show more")}
        </button>
      )}
      {!rows.length && (
        <p>{t("لا توجد تقارير مطابقة", "No matching reports")}</p>
      )}
    </details>
  );
}

export function useDelivery(saved, enabled) {
  const [state, setState] = useState({
    connection: null,
    records: [],
    backups: [],
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
            {delivery.connection.supervisor.role === "general"
              ? t("مشرف عام · قراءة فقط", "General supervisor · read only")
              : delivery.connection.supervisor.grade}
          </p>
          {delivery.connection.supervisor.role !== "general" && (
            <>
              <p role="status">
                {delivery.blocked
                  ? t("سجلات تحتاج مراجعة", "Records need review")
                  : delivery.pending
                    ? t("بانتظار الإرسال", "Awaiting delivery")
                    : t(
                        "لا توجد سجلات بانتظار الإرسال",
                        "No pending records",
                      )}{" "}
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
              {(delivery.backups || []).slice(0, 5).map((backup) => (
                <p className="backup-delivery" role="status" key={backup.id}>
                  {t("نسخة احتياطية", "Backup")} ·{" "}
                  {new Date(backup.createdAt).toLocaleString()} ·{" "}
                  {backup.pending
                    ? backup.error || t("بانتظار الإرسال", "Awaiting delivery")
                    : t("تم الاستلام", "Received")}
                </p>
              ))}
              {!!delivery.records.length && (
                <SubmittedReports delivery={delivery} t={t} />
              )}
            </>
          )}
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
                {preview.info.supervisor.role === "general"
                  ? t("مشرف عام · قراءة فقط", "General supervisor · read only")
                  : preview.info.supervisor.grade}
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
