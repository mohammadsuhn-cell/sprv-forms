import React, { useState } from "react";
import { signedRead } from "./delivery.js";
import { titles } from "./model.js";
import { ReportContent } from "./student-history.jsx";
import { ReceivedExports } from "./general-workspace.jsx";
import { ReviewPanel } from "./review-ui.jsx";

export function OwnedReports({ t, lang }) {
  const [data, setData] = useState(null),
    [detail, setDetail] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function load(more = false) {
    setBusy(true);
    setError("");
    try {
      const page = await signedRead(
        "my-reports",
        more ? { cursor: data.nextCursor } : {},
      );
      setData({
        ...page,
        records: more ? [...data.records, ...page.records] : page.records,
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel owned-reports">
      <h2>
        {t(
          "نسخي المستلمة لدى الإشراف العام",
          "My reports received by general supervision",
        )}
      </h2>
      <button className="button" disabled={busy} onClick={() => load()}>
        {t("عرض التقارير المستلمة", "Show received reports")}
      </button>
      {error && <p role="alert">{error}</p>}
      {data && !data.records.length && (
        <p>
          {t(
            "لا توجد تقارير مستلمة لهذا الحساب.",
            "No received reports for this account.",
          )}
        </p>
      )}
      {data?.records.map((r) => (
        <button
          className="button"
          key={r.id}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              setDetail(await signedRead("my-report", { recordId: r.id }));
            } catch (e) {
              setError(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {titles[r.kind]?.[lang === "en" ? 1 : 0]} · {r.reference || r.date} ·{" "}
          {r.grade} {r.withdrawnAt && t("· مسحوب", "· Withdrawn")}
        </button>
      ))}
      {data?.nextCursor && (
        <button className="button" disabled={busy} onClick={() => load(true)}>
          {t("عرض المزيد", "Show more")}
        </button>
      )}
      {detail && (
        <>
          <p className="hint">
            {t(
              "هذه النسخة المستلمة. تعديل الأصل من الجهاز الذي أنشأه.",
              "This is the received copy. Edit the original on the device that created it.",
            )}
          </p>
          <ReceivedExports detail={detail} lang={lang} t={t}>
            <ReportContent report={detail.report} />
          </ReceivedExports>
          <ReviewPanel recordId={detail.id} revision={detail.revision} t={t} />
        </>
      )}
    </section>
  );
}
