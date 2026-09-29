import React, { useEffect, useRef, useState } from "react";
import { useReads } from "./read-context.jsx";
import { dateLabel } from "./model.js";
import { FileActions } from "./file-actions.jsx";
import {
  loadProfileHistory,
  profileReport,
  historyFileName,
} from "./history-export.js";
import "./student-history.css";

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
  const [state, setState] = useState({ data: null, busy: true, error: null });
  const [refresh, setRefresh] = useState(0);
  const generation = useRef(0);
  const pending = useRef(false);
  const key = JSON.stringify(params);
  useEffect(() => {
    const version = ++generation.current;
    pending.current = true;
    setState({ data: null, busy: true, error: null });
    const timer = setTimeout(
      async () => {
        try {
          const data = await readStudentData(action, JSON.parse(key));
          if (generation.current === version)
            setState({ data, busy: false, error: null });
        } catch (error) {
          if (generation.current === version)
            setState({ data: null, busy: false, error });
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
        setState((s) => ({ ...s, busy: false, error }));
    } finally {
      if (generation.current === version) pending.current = false;
    }
  }
  return { ...state, more, reload: () => setRefresh((n) => n + 1) };
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
          <button
            className="button"
            disabled={page.busy}
            onClick={
              page.data && page.error.code !== "pagination_expired"
                ? page.more
                : page.reload
            }
          >
            {page.error.code === "pagination_expired"
              ? t("تحديث", "Refresh")
              : t("إعادة المحاولة", "Retry")}
          </button>
        </div>
      )}
    </>
  );
}

export function ReportContent({ report }) {
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
            <dd>{value}</dd>
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
                <dd>{value}</dd>
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
                      <td key={k}>{String(cell ?? "")}</td>
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

function HistoryExports({ studentId, record, lang, t }) {
  const { student: readStudentData } = useReads();
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState(null);
  const [error, setError] = useState(null);
  const generation = useRef(0);
  const pending = useRef(false);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  async function prepare(extension) {
    if (pending.current) return;
    pending.current = true;
    const version = ++generation.current;
    const active = () => version === generation.current;
    setBusy(true);
    setFile(null);
    setError(null);
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
        blob = await (
          extension === "pdf"
            ? lib.pdfBlob
            : extension === "docx"
              ? lib.wordBlob
              : lib.excelBlob
        )(detail.form);
        name = historyFileName(
          `${detail.report.title}-${detail.reference || detail.date}`,
          extension,
        );
      } else {
        const history = await loadProfileHistory(
          studentId,
          readStudentData,
          active,
        );
        const report = profileReport(history);
        blob = await (
          extension === "pdf"
            ? lib.pdfReportBlob
            : extension === "docx"
              ? lib.wordReportBlob
              : lib.excelReportBlob
        )(report);
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
    <section className="history-export" aria-label={title}>
      <strong>{title}</strong>
      {!record && (
        <p className="hint">
          {t(
            "ملخص الحالات وجميع تواريخ التأخر، بما فيها السجلات غير المعروضة بعد.",
            "Case summaries and every late date, including records not yet displayed.",
          )}
        </p>
      )}
      <div className="history-actions">
        {[
          ["pdf", "PDF"],
          ["docx", "Word"],
          ["xlsx", "Excel"],
        ].map(([extension, label]) => (
          <button
            className="button"
            key={extension}
            disabled={busy}
            onClick={() => prepare(extension)}
          >
            {label}
          </button>
        ))}
      </div>
      {busy && (
        <p role="status">
          {t("جارٍ إعداد الملف الكامل…", "Preparing the complete file…")}
        </p>
      )}
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

function HistoryEntry({ record, studentId, t, formatDate, lang }) {
  const { student: readStudentData } = useReads();
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  const pending = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function load() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      const data = await readStudentData("student-report", {
        studentId,
        recordId: record.id,
      });
      if (mounted.current) setDetail(data);
    } catch (e) {
      if (mounted.current) setError(e);
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <details
      className="history-entry"
      onToggle={(e) => {
        if (e.currentTarget.open && !detail && !error) load();
      }}
    >
      <summary>
        <span>
          <strong>
            {record.kind === "late"
              ? t("تأخر", "Lateness")
              : record.kind === "cases"
                ? t("سجل حالات", "Case register")
                : record.type || t("حالة", "Case")}
          </strong>{" "}
          · {formatDate(record.date)}
        </span>
        <small>
          {record.supervisorName}
          {record.reference && (
            <>
              {" "}
              · <bdi>{record.reference}</bdi>
            </>
          )}
        </small>
      </summary>
      {busy && (
        <p role="status">{t("جارٍ تحميل التفاصيل…", "Loading details…")}</p>
      )}
      {error && (
        <div role="alert">
          <p>{readError(error, t)}</p>
          <button className="button" onClick={load} disabled={busy}>
            {t("إعادة المحاولة", "Retry")}
          </button>
        </div>
      )}
      {detail && <ReportContent report={detail.report} />}
      {detail && ["case", "cases"].includes(record.kind) && (
        <HistoryExports
          studentId={studentId}
          record={record}
          lang={lang}
          t={t}
        />
      )}
    </details>
  );
}

export function StudentProfile({ studentId, lang, t, onBack, backLabel }) {
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
        <button className="button" onClick={page.reload} disabled={page.busy}>
          {t("تحديث السجل", "Refresh history")}
        </button>
      </div>
      <PageStatus page={page} t={t} />
      {data && (
        <>
          <div className="panel">
            <h1>{data.student.name}</h1>
            <p>{data.student.className}</p>
            <div className="history-totals">
              <div>
                <strong>{data.totals.caseReports}</strong>
                <span>{t("تقارير الحالات", "Case reports")}</span>
              </div>
              <div>
                <strong>{data.totals.lateDays}</strong>
                <span>{t("أيام التأخر", "Late days")}</span>
              </div>
            </div>
            <p className="hint">
              {t(
                "يعرض التقارير التي وصلت إلى الإشراف العام من مشرفي الصف. المسودات وما لم يُرسل بعد لا يظهر هنا.",
                "Shows reports received by general supervision from supervisors of this grade. Drafts and undelivered records are not included.",
              )}
            </p>
            {data.totals.lateDays > 0 && (
              <details className="history-dates">
                <summary>
                  {t("تواريخ التأخر", "Dates of lateness")} (
                  {data.totals.lateDays})
                </summary>
                <p className="hint">
                  {t(
                    "يُحسب التاريخ مرة واحدة حتى لو أرسل أكثر من مشرف تقريرًا عنه.",
                    "Each date counts once, even if several supervisors report it.",
                  )}
                </p>
                <ul>
                  {data.totals.lateDates.map((date) => (
                    <li key={date}>{formatDate(date)}</li>
                  ))}
                </ul>
              </details>
            )}
            <p className="hint">
              {t("آخر تحديث", "Last refreshed")}:{" "}
              {new Date(data.fetchedAt).toLocaleString(
                lang === "en" ? "en-GB" : "ar-KW",
                { timeZone: "Asia/Kuwait" },
              )}
            </p>
          </div>
          <HistoryExports studentId={data.student.id} lang={lang} t={t} />
        </>
      )}
      <div
        className="history-filters"
        aria-label={t("نوع السجل", "Record type")}
      >
        {[
          ["", "الكل", "All"],
          ["case", "الحالات", "Cases"],
          ["late", "التأخر", "Lateness"],
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
              key={record.id + ":" + record.revision}
              record={record}
              studentId={data.student.id}
              t={t}
              formatDate={formatDate}
              lang={lang}
            />
          ))}
          {data.nextOffset !== null && (
            <button className="button" disabled={page.busy} onClick={page.more}>
              {t("عرض المزيد", "Show more")} ({data.records.length} /{" "}
              {data.total})
            </button>
          )}
        </div>
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
        <button className="button" onClick={page.reload} disabled={page.busy}>
          {t("تحديث", "Refresh")}
        </button>
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
        <p>
          {t(
            "فعّل اتصال المشرف لعرض سجل طلبة صفك لدى الإشراف العام.",
            "Activate your supervisor connection to view the shared history of students in your grade.",
          )}
        </p>
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
