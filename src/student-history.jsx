import { shortCaseReference } from "./case-reference.js";
import React, { useEffect, useRef, useState } from "react";
import { useReads, useExporter } from "./read-context.jsx";
import { createExportContext } from "./export-stamp.js";
import { dateLabel } from "./model.js";
import { ExportPanels } from "./export-panels.jsx";
import { FileActions } from "./file-actions.jsx";
import {
  loadProfileHistory,
  profileReport,
  historyFileName,
} from "./history-export.js";
import "./student-history.css";
import { ReviewPanel, useReviews } from "./review-ui.jsx";
import { loadStudentReviews } from "./review-delivery.js";
import { readHistoryWindow } from "./history-window.js";

export function readError(error, t) {
  if (error.code === "pagination_expired")
    return t(
      "انتهت صلاحية القائمة. حدّثها لعرض أحدث السجلات.",
      "This list has expired. Refresh to load the latest records.",
    );
  if (error.code === "history_unavailable")
    return t(
      "يرجى مراجعة الإشراف العام لتفعيل سجل الطالب.",
      "Please contact general supervision to enable student history.",
    );
  if (error.code === "student_not_found")
    return t(
      "لم يُطابق الطالب قائمة الإشراف العام. ابحث عنه في قائمة الطلبة أو راجع المشرف العام.",
      "This student could not be matched. Search the student list or contact general supervision.",
    );
  if (error.code === "expired")
    return t(
      "تأكد من ضبط وقت الجهاز ثم أعد المحاولة.",
      "Check your device clock and retry.",
    );
  if (error.code === "read_timeout" || error.code === "read_network")
    return t(
      "تعذّر الاتصال بجهاز الاستقبال. على المشرف العام التأكد من تشغيل جهاز الاستقبال والاتصال، ثم أعد المحاولة.",
      "Cannot reach the receiver. Ask general supervision to check the receiver and its connection, then retry.",
    );
  if (error.status === 429)
    return t(
      "طلبات كثيرة خلال دقيقة. انتظر قليلًا ثم أعد المحاولة.",
      "Too many requests this minute. Wait briefly, then retry.",
    );
  if (error.status >= 500)
    return t(
      "حدث خطأ في جهاز الاستقبال. اطلب من المشرف العام فحصه ثم أعد المحاولة.",
      "The receiver encountered an error. Ask general supervision to check it, then retry.",
    );
  if (error.status === 401 || error.code === "unpaired")
    return t(
      "اتصال هذا الجهاز غير مفعل. راجع الإعدادات أو اطلب رابط تفعيل جديدًا.",
      "This device is not activated. Check Settings or request a new activation link.",
    );
  if (error.status === 403)
    return t(
      "السجل خارج نطاق صلاحية هذا المشرف.",
      "This record is outside your assigned access.",
    );
  if (error.status === 404)
    return t(
      "السجل غير متاح حاليًا. حدّث الصفحة أو راجع الإشراف العام.",
      "This record is not currently available. Refresh or contact general supervision.",
    );
  return t(
    "تعذّر الوصول إلى الإشراف العام. تأكد من الاتصال ثم أعد المحاولة؛ لا يعني ذلك أن سجل الطالب فارغ.",
    "Cannot reach general supervision. Check the connection and retry; this does not mean the student has no history.",
  );
}

// Ignore responses from earlier searches, students, filters, or unmounted pages.
function useHistoryPage(action, params, listKey) {
  const { student: readStudentData } = useReads();
  const [state, setState] = useState({
    key: "",
    data: null,
    busy: true,
    error: null,
  });
  const latest = useRef(state);
  latest.current = state;
  const [refresh, setRefresh] = useState(0);
  const generation = useRef(0);
  const pending = useRef(false);
  const key = JSON.stringify(params);
  useEffect(() => {
    const version = ++generation.current;
    pending.current = true;
    const previous = latest.current.key === key ? latest.current.data : null;
    setState({ key, data: previous, busy: true, error: null });
    const timer = setTimeout(
      async () => {
        try {
          const data = await readHistoryWindow(
            readStudentData,
            action,
            JSON.parse(key),
            listKey,
            previous?.[listKey]?.length || 0,
            () => generation.current === version,
          );
          if (generation.current === version)
            setState({ key, data, busy: false, error: null });
        } catch (error) {
          if (generation.current === version)
            setState({
              key,
              data:
                [401, 403, 404].includes(error.status) ||
                error.code === "unpaired"
                  ? null
                  : previous,
              busy: false,
              error,
              errorAction: "reload",
            });
        } finally {
          if (generation.current === version) pending.current = false;
        }
      },
      action === "students" ? 250 : 0,
    );
    return () => {
      clearTimeout(timer);
      generation.current++;
    };
  }, [action, key, refresh, readStudentData]);
  async function more() {
    if (pending.current || state.data?.nextOffset == null) return;
    const version = generation.current;
    pending.current = true;
    setState((s) => ({ ...s, busy: true, error: null }));
    try {
      const data = await readStudentData(action, {
        ...JSON.parse(key),
        offset: state.data.nextOffset,
        ...(state.data.nextCursor ? { cursor: state.data.nextCursor } : {}),
      });
      if (generation.current === version)
        setState((s) => ({
          key,
          busy: false,
          error: null,
          data: {
            ...data,
            [listKey]: [
              ...new Map(
                [...s.data[listKey], ...data[listKey]].map((row) => [
                  row.id,
                  row,
                ]),
              ).values(),
            ],
          },
        }));
    } catch (error) {
      if (generation.current === version)
        setState((s) => ({ ...s, busy: false, error, errorAction: "more" }));
    } finally {
      if (generation.current === version) pending.current = false;
    }
  }
  const reload = () => setRefresh((n) => n + 1);
  return {
    ...state,
    more,
    reload,
    retry:
      state.errorAction === "more" && state.error?.code !== "pagination_expired"
        ? more
        : reload,
  };
}

function PageStatus({ page, t }) {
  return (
    <>
      {page.busy && (
        <p role="status">{t("جارٍ تحميل السجل…", "Loading records…")}</p>
      )}
      {page.error && (
        <div className="alert" role="alert">
          <p>{readError(page.error, t)}</p>
          <button className="button" disabled={page.busy} onClick={page.retry}>
            {page.error.code === "pagination_expired"
              ? t("تحديث", "Refresh")
              : t("إعادة المحاولة", "Retry")}
          </button>
        </div>
      )}
    </>
  );
}

export function ReportContent({ report, students = [], onStudent }) {
  const renderValue = (value) => {
    const matches = onStudent
      ? [
          ...new Map(
            students
              .filter((s) => s.name === String(value))
              .map((s) => [s.id, s]),
          ).values(),
        ]
      : [];
    const student = matches.length === 1 && matches[0];
    return student ? (
      <button
        className="text-control report-student-link"
        onClick={() => onStudent(student.id)}
      >
        {student.name}
      </button>
    ) : (
      String(value ?? "")
    );
  };
  return (
    <div className="history-report" dir="rtl" lang="ar">
      {report.absence && (
        <section>
          <h2>
            {report.absence.grade} · {dateLabel(report.absence.date)} ·{" "}
            {report.absence.day}
          </h2>
          <p>
            الغائبون: {report.absence.absent} · الحاضرون:{" "}
            {report.absence.present} · المقيدون: {report.absence.total}
          </p>
          <div
            className="history-table"
            tabIndex={0}
            role="region"
            aria-label="إحصائية الغياب"
          >
            <table>
              <thead>
                <tr>
                  {[
                    "الشعبة",
                    "المقيدون",
                    "الحاضرون",
                    "الغائبون",
                    "أسماء الغائبين",
                  ].map((label) => (
                    <th scope="col" key={label}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.absence.classes.map((entry) => (
                  <tr key={entry.className}>
                    <td>{entry.className}</td>
                    <td>{entry.total ?? "—"}</td>
                    <td>{entry.present ?? "—"}</td>
                    <td>{entry.absent}</td>
                    <td>{entry.students.join("، ") || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <dl>
        <dt>المشرف</dt>
        <dd>{report.supervisor}</dd>
        {(report.meta || []).map(([label, value], i) => (
          <React.Fragment key={i}>
            <dt>{label}</dt>
            <dd>{renderValue(value)}</dd>
          </React.Fragment>
        ))}
      </dl>
      {(report.sections || []).map((section, i) => (
        <section key={i}>
          <h3>{section.title}</h3>
          <dl>
            {(section.lines || []).map(([label, value], j) => (
              <React.Fragment key={j}>
                <dt>{label}</dt>
                <dd>{renderValue(value)}</dd>
              </React.Fragment>
            ))}
          </dl>
        </section>
      ))}
      {(report.tables || []).map((table, i) => (
        <section key={i}>
          <h3>{table.title}</h3>
          <div
            className="history-table"
            tabIndex={0}
            role="region"
            aria-label={table.title}
          >
            <table>
              <thead>
                <tr>
                  {table.columns.map((column, j) => (
                    <th key={j} scope="col">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, j) => (
                  <tr key={j}>
                    {row.map((cell, k) => (
                      <td key={k}>{renderValue(cell)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}

function HistoryExports({ studentId, record, lang, t, children }) {
  const exporter = useExporter();
  const reviews = useReviews();
  const { student: readStudentData, dataAsOf } = useReads();
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState(null);
  const [error, setError] = useState(null);
  const generation = useRef(0);
  const pending = useRef(false);
  useEffect(() => {
    const outdated = pending.current || file;
    generation.current++;
    pending.current = false;
    setFile(null);
    setError(
      outdated
        ? t(
            "تحدثت البيانات؛ أعد تجهيز الملف للحصول على أحدث نسخة.",
            "Data updated; prepare the file again for the latest copy.",
          )
        : null,
    );
    setBusy(false);
    return () => {
      generation.current++;
    };
  }, [readStudentData, studentId, record?.revision]);
  async function prepare(extension) {
    if (pending.current) return;
    pending.current = true;
    const version = ++generation.current;
    const active = () => version === generation.current;
    setBusy(true);
    setFile(null);
    setError(null);
    const context = { ...createExportContext(exporter), dataAsOf };
    try {
      const lib = await import("./exports.js");
      let blob, name;
      if (record) {
        const detail = await readStudentData("student-report", {
          studentId,
          recordId: record.id,
        });
        if (!active()) return;
        if (!detail.form || !["case", "cases"].includes(detail.form.kind))
          throw Object.assign(new Error("Receiver update needed"), {
            code: "history_unavailable",
          });
        if (
          detail.id !== record.id ||
          detail.kind !== record.kind ||
          detail.revision !== record.revision ||
          detail.form.kind !== record.kind
        )
          throw Object.assign(new Error("Student history changed"), {
            code: "pagination_expired",
          });
        blob = await (
          extension === "pdf"
            ? lib.pdfBlob
            : extension === "docx"
              ? lib.wordBlob
              : lib.excelBlob
        )(detail.form, { ...context, sourceRevision: detail.revision });
        name = historyFileName(
          [
            detail.report.title,
            detail.date,
            shortCaseReference(detail.reference),
          ]
            .filter(Boolean)
            .join("-"),
          extension,
        );
      } else {
        const history = await loadProfileHistory(
          studentId,
          readStudentData,
          active,
        );
        if (reviews?.supported)
          history.reviews = await loadStudentReviews(
            reviews.connection,
            studentId,
            active,
          );
        if (!active()) return;
        const report = profileReport(history);
        blob =
          extension === "xlsx"
            ? await lib.excelReportBlob(report, null, context)
            : await (
                extension === "pdf" ? lib.pdfReportBlob : lib.wordReportBlob
              )(report, context);
        name = historyFileName(`سجل الطالب-${history.student.name}`, extension);
      }
      if (active()) setFile({ blob, name });
    } catch (e) {
      if (active() && e.name !== "AbortError")
        setError(
          e.code || e.status
            ? readError(e, t)
            : t(
                "تعذّر إعداد الملف. تأكد من الاتصال وأعد المحاولة.",
                "Could not prepare the file. Check your connection and retry.",
              ),
        );
    } finally {
      if (active()) {
        pending.current = false;
        setBusy(false);
      }
    }
  }
  async function share() {
    const nativeFile = new File([file.blob], file.name, {
      type: file.blob.type,
    });
    try {
      if (navigator.canShare?.({ files: [nativeFile] }))
        await navigator.share({ files: [nativeFile], title: file.name });
      else (await import("./exports.js")).download(file.blob, file.name);
    } catch (e) {
      if (e.name !== "AbortError")
        setError(
          t(
            "تعذّرت المشاركة. استخدم التنزيل.",
            "Sharing failed. Use download.",
          ),
        );
    }
  }
  const title = record
    ? t("تصدير الحالة", "Export case")
    : t("تصدير سجل الطالب الكامل", "Export full student profile");
  return (
    <ExportPanels
      title={title}
      busy={busy}
      error={error}
      file={file}
      lang={lang}
      t={t}
      onPrepare={prepare}
      onShare={share}
      onClose={() => setFile(null)}
      onError={setError}
    >
      {children}
    </ExportPanels>
  );
}

function HistoryEntry({ record, studentId, t, formatDate, lang }) {
  const { student: readStudentData } = useReads();
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const open = useRef(false);
  const pending = useRef(false);
  useEffect(() => {
    generation.current++;
    pending.current = false;
    setDetail(null);
    setError(null);
    setBusy(false);
    if (open.current) void load();
    return () => {
      generation.current++;
    };
  }, [readStudentData, studentId, record.id, record.revision]);
  async function load() {
    if (pending.current) return;
    pending.current = true;
    const version = ++generation.current;
    setBusy(true);
    setError(null);
    try {
      const data = await readStudentData("student-report", {
        studentId,
        recordId: record.id,
      });
      if (generation.current === version) setDetail(data);
    } catch (e) {
      if (generation.current === version) setError(e);
    } finally {
      if (generation.current === version) {
        pending.current = false;
        setBusy(false);
      }
    }
  }
  return (
    <details
      className="history-entry"
      onToggle={(e) => {
        open.current = e.currentTarget.open;
        if (e.currentTarget.open && !detail && !error) load();
      }}
    >
      <summary>
        <span>
          <strong>
            {record.kind === "absence"
              ? t("غياب", "Absence")
              : record.kind === "late"
                ? t("تأخر", "Lateness")
                : record.kind === "cases"
                  ? t("سجل حالات", "Case register")
                  : record.type || t("حالة", "Case")}
          </strong>{" "}
          · {formatDate(detail?.date || record.date)}
        </span>
        <small>
          {record.supervisorName}
          {record.reference && (
            <>
              {" "}
              · <bdi>{shortCaseReference(record.reference)}</bdi>
            </>
          )}
        </small>
      </summary>
      {busy && (
        <p role="status">{t("جارٍ تحميل التفاصيل…", "Loading details…")}</p>
      )}
      {detail && detail.revision !== record.revision && (
        <p role="status">
          {t(
            "تم تحديث التقرير؛ ستتحدث القائمة عند المزامنة.",
            "Report updated; the list will refresh with synchronization.",
          )}
        </p>
      )}
      {error && (
        <div role="alert">
          <p>{readError(error, t)}</p>
          <button className="button" onClick={load} disabled={busy}>
            {t("إعادة المحاولة", "Retry")}
          </button>
        </div>
      )}
      {detail && !["case", "cases"].includes(record.kind) && (
        <ReportContent report={detail.report} />
      )}
      {detail && ["case", "cases"].includes(record.kind) && (
        <HistoryExports studentId={studentId} record={detail} lang={lang} t={t}>
          <ReportContent report={detail.report} />
        </HistoryExports>
      )}
      {detail && (
        <ReviewPanel
          recordId={record.id}
          revision={detail.revision}
          t={t}
          canCreate
        />
      )}
    </details>
  );
}

function HistoryBundleExport({ studentId, lang, t }) {
  const exporter = useExporter();
  const { student: readStudentData } = useReads();
  const reviews = useReviews();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [file, setFile] = useState(null);
  const [error, setError] = useState(null);
  const generation = useRef(0);
  const pending = useRef(false);
  useEffect(() => {
    const outdated = pending.current || file;
    generation.current++;
    pending.current = false;
    setFile(null);
    setError(
      outdated
        ? t(
            "تحدثت البيانات؛ أعد تجهيز الملف للحصول على أحدث نسخة.",
            "Data updated; prepare the file again for the latest copy.",
          )
        : null,
    );
    setProgress("");
    setBusy(false);
    return () => {
      generation.current++;
    };
  }, [readStudentData, studentId]);

  async function prepare() {
    if (pending.current) return;
    pending.current = true;
    const version = ++generation.current;
    const active = () => version === generation.current;
    setBusy(true);
    setProgress(t("جارٍ إعداد ملخص الطالب…", "Preparing the student summary…"));
    setFile(null);
    setError(null);
    const context = createExportContext(exporter);
    try {
      const { buildStudentArchive } = await import("./student-archive.js");
      const history = await loadProfileHistory(
        studentId,
        readStudentData,
        active,
      );
      if (reviews?.supported)
        history.reviews = await loadStudentReviews(
          reviews.connection,
          studentId,
          active,
        );
      if (!active()) return;

      const blob = await buildStudentArchive(
        history,
        readStudentData,
        context,
        {
          active,
          onProgress: (completed, total) =>
            setProgress(
              total
                ? t(
                    `جارٍ إعداد الحالات (${completed} / ${total})…`,
                    `Preparing cases (${completed} / ${total})…`,
                  )
                : t(
                    "لا توجد حالات مرتبطة؛ الملخص جاهز للإضافة…",
                    "No related cases; adding the summary…",
                  ),
            ),
        },
      );
      if (active()) {
        setFile({
          blob,
          name: historyFileName(`ملف الطالب-${history.student.name}`, "zip"),
        });
        setProgress("");
      }
    } catch (e) {
      if (active() && e.name !== "AbortError")
        setError(
          e.code || e.status
            ? readError(e, t)
            : t(
                "تعذّر إعداد الملف. تأكد من الاتصال وأعد المحاولة.",
                "Could not prepare the file. Check your connection and retry.",
              ),
        );
    } finally {
      if (active()) {
        pending.current = false;
        setBusy(false);
      }
    }
  }

  async function share() {
    const nativeFile = new File([file.blob], file.name, {
      type: file.blob.type,
    });
    try {
      if (navigator.canShare?.({ files: [nativeFile] }))
        await navigator.share({ files: [nativeFile], title: file.name });
      else (await import("./exports.js")).download(file.blob, file.name);
    } catch (e) {
      if (e.name !== "AbortError")
        setError(
          t(
            "تعذّرت المشاركة. استخدم التنزيل.",
            "Sharing failed. Use download.",
          ),
        );
    }
  }

  return (
    <section
      className="history-bundle"
      aria-label={t("تنزيل ملف الطالب", "Download student file")}
    >
      <div>
        <strong>
          {t("ملخص الطالب والحالات", "Student summary and cases")}
        </strong>
        <p>
          {t(
            "ينزّل الملخص وملف PDF مستقلًا لكل حالة مرتبطة بالطالب في ملف ZIP واحد.",
            "Downloads the summary and a separate PDF for each related case in one ZIP file.",
          )}
        </p>
      </div>
      <button className="button primary" disabled={busy} onClick={prepare}>
        {busy
          ? t("جارٍ التجهيز…", "Preparing…")
          : t("تنزيل الملخص والحالات", "Download summary and cases")}
      </button>
      {progress && <p role="status">{progress}</p>}
      {error && <p role="alert">{error}</p>}
      {file && (
        <FileActions
          file={file}
          lang={lang}
          onShare={share}
          onClose={() => setFile(null)}
          onError={setError}
        />
      )}
    </section>
  );
}

export function StudentProfile({ studentId, lang, t, onBack, backLabel }) {
  const { local } = useReads();
  const [kind, setKind] = useState("");
  const page = useHistoryPage(
    "student-history",
    { studentId, kind },
    "records",
  );
  const data = page.data;
  const formatDate = (date) => (lang === "en" ? date : dateLabel(date));
  return (
    <section className="student-profile">
      <div className="history-actions">
        <button className="button" onClick={onBack}>
          {backLabel || t("قائمة الطلبة", "Student list")}
        </button>
        {!local && (
          <button className="button" onClick={page.reload} disabled={page.busy}>
            {t("تحديث السجل", "Refresh history")}
          </button>
        )}
      </div>
      <PageStatus page={page} t={t} />
      {data && (
        <>
          <h1>{data.student.name}</h1>
          <p>{data.student.className}</p>
          <HistoryExports studentId={data.student.id} lang={lang} t={t}>
            <div className="panel">
              <div className="history-totals">
                <div>
                  <strong>{data.totals.caseReports}</strong>
                  <span>{t("تقارير الحالات", "Case reports")}</span>
                </div>
                <div>
                  <strong>{data.totals.lateDays}</strong>
                  <span>{t("أيام التأخر", "Late days")}</span>
                </div>
                <div>
                  <strong>
                    {data.absenceCoverage === false
                      ? "—"
                      : (data.totals.absenceDays ?? "—")}
                  </strong>
                  <span>
                    {t("أيام الغياب المبلغ عنها", "Reported absence days")}
                  </span>
                </div>
              </div>
              {data.totals.lateDays > 0 && (
                <details className="history-dates">
                  <summary>
                    {t("تواريخ التأخر", "Dates of lateness")} (
                    {data.totals.lateDays})
                  </summary>
                  <ul>
                    {data.totals.lateDates.map((date) => (
                      <li key={date}>{formatDate(date)}</li>
                    ))}
                  </ul>
                </details>
              )}
              {data.absenceCoverage === false && (
                <p className="hint">
                  {t(
                    "حدّث بيانات الصف لإضافة الغياب إلى ملف الطالب.",
                    "Update grade history to include absence in the student file.",
                  )}
                </p>
              )}
              <p className="hint">
                {local
                  ? t("بيانات النسخة المحفوظة حتى", "Saved data as of")
                  : t("آخر قراءة", "Last read")}
                :{" "}
                {new Date(data.fetchedAt).toLocaleString(
                  lang === "en" ? "en-GB" : "ar-KW",
                  { timeZone: "Asia/Kuwait" },
                )}
              </p>
            </div>
            <HistoryBundleExport
              studentId={data.student.id}
              lang={lang}
              t={t}
            />
            <div
              className="history-filters"
              aria-label={t("نوع السجل", "Record type")}
            >
              {[
                ["", "الكل", "All"],
                ["case", "الحالات", "Cases"],
                ["late", "التأخر", "Lateness"],
                ["absence", "الغياب", "Absence"],
              ].map(([value, ar, en]) => (
                <button
                  className="button"
                  key={value}
                  aria-pressed={kind === value}
                  onClick={() => setKind(value)}
                >
                  {t(ar, en)}
                </button>
              ))}
            </div>
            {data && (
              <div className="panel">
                {!data.total && (
                  <p>
                    {t(
                      "لا توجد تقارير واردة ضمن هذا الاختيار.",
                      "No received reports match this selection.",
                    )}
                  </p>
                )}
                {data.records.map((record) => (
                  <HistoryEntry
                    key={record.id}
                    record={record}
                    studentId={data.student.id}
                    t={t}
                    formatDate={formatDate}
                    lang={lang}
                  />
                ))}
                {data.nextOffset !== null && (
                  <button
                    className="button"
                    disabled={page.busy}
                    onClick={page.more}
                  >
                    {t("عرض المزيد", "Show more")} ({data.records.length} /{" "}
                    {data.total})
                  </button>
                )}
              </div>
            )}
          </HistoryExports>
          <ReviewPanel studentId={data.student.id} t={t} />
        </>
      )}
    </section>
  );
}

export function StudentDirectory({
  query,
  setQuery,
  className,
  setClassName,
  onSelect,
  t,
  grade = "",
}) {
  const { local } = useReads();
  const page = useHistoryPage(
    "students",
    { query, className, ...(grade ? { grade } : {}) },
    "students",
  );
  const classes = useRef([]);
  if (page.data) classes.current = page.data.classes;
  return (
    <>
      <div className="page-heading">
        <h1>{t("سجل الطالب", "Student history")}</h1>
        {!local && (
          <button className="button" onClick={page.reload} disabled={page.busy}>
            {t("تحديث", "Refresh")}
          </button>
        )}
      </div>
      <div className="history-search">
        <label className="field">
          <span>{t("بحث باسم الطالب", "Search student name")}</span>
          <input
            autoComplete="off"
            maxLength={100}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label className="field">
          <span>{t("الشعبة", "Class")}</span>
          <select
            value={className}
            onChange={(e) => setClassName(e.target.value)}
          >
            <option value="">{t("كل الشعب", "All classes")}</option>
            {classes.current.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      </div>
      <PageStatus page={page} t={t} />
      {page.data && (
        <section className="panel history-students">
          {!page.data.total && (
            <p>
              {t(
                "لا توجد أسماء مطابقة في القائمة المتاحة.",
                "No matching students in the available directory.",
              )}
            </p>
          )}
          {page.data.students.map((student) => (
            <button
              className="history-student"
              key={student.id}
              onClick={() => onSelect(student.id)}
            >
              <strong>{student.name}</strong>
              <span>
                {student.className}
                {student.archived ? " · " + t("مؤرشف", "Archived") : ""}
              </span>
            </button>
          ))}
          {page.data.nextOffset !== null && (
            <button className="button" disabled={page.busy} onClick={page.more}>
              {t("عرض المزيد", "Show more")} ({page.data.students.length} /{" "}
              {page.data.total})
            </button>
          )}
        </section>
      )}
    </>
  );
}

export function StudentHistory({
  connection,
  ready,
  initialStudentId = "",
  lang,
  t,
  onSettings,
}) {
  const [studentId, setStudentId] = useState(initialStudentId);
  const [query, setQuery] = useState("");
  const [className, setClassName] = useState("");
  if (!ready)
    return (
      <p role="status">{t("جارٍ تحميل الاتصال…", "Loading connection…")}</p>
    );
  if (!connection)
    return (
      <section className="panel">
        <h1>{t("سجل الطالب", "Student history")}</h1>
        <button className="button" onClick={onSettings}>
          {t("فتح الإعدادات", "Open Settings")}
        </button>
      </section>
    );
  return studentId ? (
    <StudentProfile
      key={studentId}
      studentId={studentId}
      lang={lang}
      t={t}
      onBack={() => setStudentId("")}
    />
  ) : (
    <StudentDirectory
      query={query}
      setQuery={setQuery}
      className={className}
      setClassName={setClassName}
      onSelect={setStudentId}
      t={t}
    />
  );
}
