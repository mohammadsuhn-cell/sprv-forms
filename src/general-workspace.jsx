import React, { useEffect, useRef, useState } from "react";
import { useReads } from "./read-context.jsx";
import { SchoolSnapshotWorkspace } from "./school-snapshot-workspace.jsx";
import {
  ReportContent,
  StudentDirectory,
  StudentProfile,
  readError,
} from "./student-history.jsx";
import { titles, dateLabel, schoolIdentity, today } from "./model.js";
import { ExportPanels } from "./export-panels.jsx";
import { historyFileName } from "./history-export.js";
import "./general-workspace.css";
import { useWorkspaceNavigation } from "./workspace-navigation.js";

const periods = [
  ["today", "اليوم", "Today"],
  ["yesterday", "أمس", "Yesterday"],
  ["week", "هذا الأسبوع", "This week"],
  ["month", "هذا الشهر", "This month"],
  ["all", "الكل", "All"],
];
const gradeLabels = [
  ["6", "السادس"],
  ["7", "السابع"],
  ["8", "الثامن"],
  ["9", "التاسع"],
];
const views = {
  cases: ["تقارير الحالات", "Case reports"],
  late: ["كشوف المتأخرين", "Lateness reports"],
  absence: ["الغياب حسب اليوم والصف", "Absence by date and grade"],
  followups: ["متابعات مستحقة", "Follow-ups due"],
  unmatched: ["أسماء تحتاج مطابقة", "Names needing a match"],
};
const stamp = (value, lang) =>
  new Date(value).toLocaleString(lang === "en" ? "en-GB" : "ar-KW", {
    timeZone: "Asia/Kuwait",
  });
const labelDate = (date, lang) => (lang === "en" ? date : dateLabel(date));
const errorText = (error, t) =>
  error.code === "overview_unavailable" || (error.status === 404 && !error.code)
    ? t(
        "يرجى تحديث جهاز الاستقبال لتفعيل مساحة الإشراف العام.",
        "Update the receiver to enable the general-supervisor workspace.",
      )
    : readError(error, t);

// Preserve successful data on retry, discard it on a changed query, and ignore
// responses from old filters or a disconnected/unmounted workspace.
function useGeneralPage(action, params, enabled = true) {
  const { general: readGeneralData } = useReads();
  const key = JSON.stringify(params),
    [refresh, setRefresh] = useState(0);
  const [state, setState] = useState({
    key: "",
    data: null,
    busy: false,
    error: null,
  });
  const generation = useRef(0),
    pending = useRef(false);
  useEffect(() => {
    const version = ++generation.current;
    if (!enabled) {
      pending.current = false;
      return;
    }
    pending.current = true;
    setState((old) => ({
      key,
      data: old.key === key ? old.data : null,
      busy: true,
      error: null,
    }));
    readGeneralData(action, JSON.parse(key))
      .then((data) => {
        if (version === generation.current)
          setState({ key, data, busy: false, error: null });
      })
      .catch((error) => {
        if (version === generation.current)
          setState((old) => ({
            ...old,
            data:
              error.status === 401 ||
              error.status === 403 ||
              error.code === "unpaired"
                ? null
                : old.data,
            busy: false,
            error,
          }));
      })
      .finally(() => {
        if (version === generation.current) pending.current = false;
      });
    return () => {
      generation.current++;
    };
  }, [action, key, refresh, enabled, readGeneralData]);
  async function more() {
    if (pending.current || !state.data?.nextCursor) return;
    const version = generation.current;
    pending.current = true;
    setState((old) => ({ ...old, busy: true, error: null }));
    try {
      const data = await readGeneralData(action, {
        ...JSON.parse(key),
        cursor: state.data.nextCursor,
      });
      if (version === generation.current)
        setState((old) => ({
          key,
          error: null,
          busy: false,
          data: { ...data, items: [...old.data.items, ...data.items] },
        }));
    } catch (error) {
      if (version === generation.current)
        setState((old) => ({
          ...old,
          data:
            error.status === 401 ||
            error.status === 403 ||
            error.code === "unpaired"
              ? null
              : old.data,
          busy: false,
          error,
        }));
    } finally {
      if (version === generation.current) pending.current = false;
    }
  }
  return {
    ...(state.key === key ? state : { data: null, busy: enabled, error: null }),
    more,
    reload: () => setRefresh((n) => n + 1),
  };
}

function Status({ page, t, onRefresh }) {
  return (
    <>
      {page.busy && (
        <p role="status">{t("جارٍ تحميل التقارير…", "Loading reports…")}</p>
      )}
      {page.error && (
        <div className="alert" role="alert">
          <p>{errorText(page.error, t)}</p>
          {page.data && <span>{t("بيانات سابقة", "Earlier data")}</span>}
          <button
            className="button"
            disabled={page.busy}
            onClick={
              page.error.code === "pagination_expired"
                ? onRefresh
                : page.data?.nextCursor
                  ? page.more
                  : page.reload
            }
          >
            {page.error.code === "pagination_expired"
              ? t("تحديث النظرة العامة", "Refresh overview")
              : t("إعادة المحاولة", "Retry")}
          </button>
        </div>
      )}
    </>
  );
}

function ReportRow({ record, lang, t, onReport, onStudent }) {
  return (
    <article className="general-report-row">
      <button className="general-report-open" onClick={() => onReport(record)}>
        <strong>
          {titles[record.kind]?.[lang === "en" ? 1 : 0] || record.kind}
        </strong>
        <span>
          {record.dates.map((date) => labelDate(date, lang)).join(" · ")} ·{" "}
          {record.supervisorName}
        </span>
        <span>
          {t("الصف", "Grade")} {record.grade}
          {record.type ? " · " + record.type : ""}
        </span>
        {record.lateReport && (
          <span>
            {record.lateReport.classes.join(" · ")}
            {record.lateReport.classes.length ? " · " : ""}
            {t("عدد المتأخرين", "Late students")}:{" "}
            {record.lateReport.studentCount}
          </span>
        )}
        {record.reference && <bdi>{record.reference}</bdi>}
        {record.kind === "cases" && (
          <span>
            {record.rowCount}{" "}
            {t("صفوف ضمن الفترة", "rows within this selection")}
          </span>
        )}
        {record.due && (
          <span>
            {t("المتابعة حتى", "Due by")} {labelDate(record.due, lang)}
          </span>
        )}
      </button>
      {!!record.students.length && (
        <details className="general-student-links">
          <summary>
            {record.students.length}{" "}
            {t("طالب · عرض الأسماء", "students · Show names")}
          </summary>
          {record.students.map((student) => (
            <button
              className="text-control"
              key={student.id}
              onClick={() => onStudent(student.id)}
            >
              {student.name} · {student.className}
            </button>
          ))}
        </details>
      )}
      {!!record.unresolved.length && (
        <span className="hint">
          {record.unresolved.length}{" "}
          {t("أسماء تحتاج مطابقة", "names needing a match")}
        </span>
      )}
    </article>
  );
}

function Drilldown({
  view,
  snapshot,
  filters,
  lang,
  t,
  onReport,
  onStudent,
  onRefresh,
}) {
  const page = useGeneralPage(
    ["reports", "late"].includes(view)
      ? "received-reports"
      : "overview-details",
    {
      snapshotId: snapshot.snapshotId,
      ...(view === "late"
        ? { kind: "late" }
        : view === "reports"
          ? filters
          : { view }),
    },
  );
  return (
    <section className="general-drilldown">
      <h2>
        {view === "reports"
          ? t("التقارير الواردة", "Received reports")
          : t(...views[view])}
      </h2>
      <Status page={page} t={t} onRefresh={onRefresh} />
      {page.data && (
        <>
          <p className="hint">
            {view === "late"
              ? t("عدد الكشوف", "Reports")
              : t("عدد النتائج", "Results")}
            : {page.data.total}
          </p>
          {!page.data.total && (
            <div className="panel">
              <p>
                {t(
                  "لا توجد تقارير واردة ضمن هذا الاختيار.",
                  "No received reports match this selection.",
                )}
              </p>
            </div>
          )}
          <div className="panel general-results">
            {page.data.items.map((entry, index) =>
              view === "absence" ? (
                <article className="general-detail-row" key={entry.id}>
                  <h3>
                    {t("الصف", "Grade")} {entry.grade} ·{" "}
                    {labelDate(entry.date, lang)}
                  </h3>
                  {!entry.received ? (
                    <p className="general-missing">
                      {t("لم يصل كشف مكتمل", "No complete sheet received")}
                    </p>
                  ) : (
                    <>
                      <p>
                        {t("الغائبون", "Absent")}:{" "}
                        <strong>{entry.absent}</strong> ·{" "}
                        {t("الحاضرون", "Present")}: {entry.present} ·{" "}
                        {t("المقيدون", "Enrolled")}: {entry.enrolled}
                      </p>
                      {entry.authorConflict && (
                        <p className="general-missing">
                          {t("كشوف متعددة", "Multiple sheets")}
                        </p>
                      )}
                      <details>
                        <summary>{t("تفصيل الشعب", "Class breakdown")}</summary>
                        {entry.classes.map((c) => (
                          <section key={c.className}>
                            <h4>{c.className}</h4>
                            <p>
                              {t("الغائبون", "Absent")}: {c.absent} ·{" "}
                              {t("الحاضرون", "Present")}: {c.present} /{" "}
                              {c.enrolled}
                            </p>
                            {c.names.length > 0 && <p>{c.names.join("، ")}</p>}
                          </section>
                        ))}
                      </details>
                      <button
                        className="button"
                        onClick={() => onReport(entry.source)}
                      >
                        {t("فتح الكشف", "Open sheet")} ·{" "}
                        {entry.source.supervisorName}
                      </button>
                    </>
                  )}
                </article>
              ) : view === "unmatched" ? (
                <article className="general-detail-row" key={entry.id}>
                  <strong>{entry.name}</strong>
                  <p>
                    {entry.className} ·{" "}
                    {entry.status === "ambiguous"
                      ? t("أكثر من تطابق", "Ambiguous match")
                      : t(
                          "لم يُطابق قائمة الطلبة",
                          "Not matched to the roster",
                        )}
                  </p>
                  <button
                    className="button"
                    onClick={() => onReport(entry.report)}
                  >
                    {t("فتح التقرير", "Open report")} ·{" "}
                    {entry.report.supervisorName}
                  </button>
                </article>
              ) : (
                <React.Fragment key={entry.id}>
                  {view === "followups" &&
                    (index === 0 ||
                      entry.due < snapshot.scope.today !==
                        page.data.items[index - 1].due <
                          snapshot.scope.today) && (
                      <h3>
                        {entry.due < snapshot.scope.today
                          ? t("متأخرة", "Overdue")
                          : t("مستحقة خلال الفترة", "Due in this period")}
                      </h3>
                    )}
                  <ReportRow
                    key={entry.id}
                    record={entry}
                    lang={lang}
                    t={t}
                    onReport={onReport}
                    onStudent={onStudent}
                  />
                </React.Fragment>
              ),
            )}
          </div>
          {page.data.nextCursor && (
            <button className="button" disabled={page.busy} onClick={page.more}>
              {t("عرض المزيد", "Show more")} ({page.data.items.length} /{" "}
              {page.data.total})
            </button>
          )}
        </>
      )}
    </section>
  );
}

function ReceivedExports({ detail, lang, t, children }) {
  const [busy, setBusy] = useState(false),
    [file, setFile] = useState(null),
    [error, setError] = useState("");
  const generation = useRef(0),
    pending = useRef(false);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  async function prepare(extension) {
    if (pending.current) return;
    const version = ++generation.current;
    pending.current = true;
    setBusy(true);
    setFile(null);
    setError("");
    try {
      const lib = await import("./exports.js");
      const blob = await (
        extension === "pdf"
          ? lib.pdfBlob
          : extension === "docx"
            ? lib.wordBlob
            : lib.excelBlob
      )(detail.form);
      if (generation.current === version)
        setFile({
          blob,
          name: historyFileName(
            `${detail.report.title}-${detail.reference || detail.date}`,
            extension,
          ),
        });
    } catch {
      if (generation.current === version)
        setError(
          t(
            "تعذّر إعداد الملف. أعد المحاولة.",
            "Could not prepare the file. Retry.",
          ),
        );
    } finally {
      if (generation.current === version) {
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
            "تعذّرت المشاركة. يمكنك تنزيل الملف.",
            "Sharing failed. You can download the file.",
          ),
        );
    }
  }
  return (
    <ExportPanels
      title={t(
        detail.kind === "cases" ? "تصدير السجل الأصلي الكامل" : "تصدير التقرير",
        detail.kind === "cases"
          ? "Export the full original register"
          : "Export report",
      )}
      formats={detail.kind === "absence" ? ["pdf"] : ["pdf", "docx", "xlsx"]}
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

function ReceivedReport({
  record,
  snapshotId,
  scope,
  view,
  lang,
  t,
  onBack,
  onStudent,
  onRefresh,
}) {
  const page = useGeneralPage("received-report", {
    recordId: record.id,
    snapshotId,
    ...scope,
    view,
  });
  return (
    <section className="general-report-detail">
      <button className="back" onClick={onBack}>
        {t("العودة إلى القائمة", "Back to list")}
      </button>
      <Status page={page} t={t} onRefresh={onRefresh} />
      {page.data && (
        <>
          <h1>{page.data.report.title}</h1>
          {page.data.revision !== record.revision && (
            <p className="alert" role="status">
              {t("تم تحديث التقرير", "Report updated")}
            </p>
          )}
          <p className="hint">
            {t("وقت الاستلام", "Received at")}:{" "}
            {stamp(page.data.receivedAt, lang)}
          </p>
          <ReceivedExports
            key={page.data.revision}
            detail={page.data}
            lang={lang}
            t={t}
          >
            <ReportContent
              report={page.data.report}
              students={page.data.students
                .filter((s) => s.localStudent)
                .map((s) => s.localStudent)}
              onStudent={onStudent}
            />
            <details className="general-student-links">
              <summary>
                {t("الطلبة في التقرير", "Students in this report")}
              </summary>
              {[
                ...new Map(
                  page.data.students
                    .filter((s) => s.localStudent)
                    .map(({ localStudent }) => [localStudent.id, localStudent]),
                ).values(),
              ].map((student) => (
                <button
                  className="text-control"
                  key={student.id}
                  onClick={() => onStudent(student.id)}
                >
                  {student.name} · {student.className}
                </button>
              ))}
            </details>
          </ReceivedExports>
        </>
      )}
    </section>
  );
}

export function GeneralWorkspace(props) {
  return (
    <SchoolSnapshotWorkspace {...props}>
      <GeneralWorkspaceView {...props} />
    </SchoolSnapshotWorkspace>
  );
}
function GeneralWorkspaceView({ connection, lang, t, active }) {
  const { local } = useReads();
  const [
    {
      tab,
      view,
      record,
      studentId,
      scope,
      query,
      className,
      filters,
      customStart,
      customEnd,
    },
    navigate,
    back,
  ] = useWorkspaceNavigation(
    {
      tab: "overview",
      view: "",
      record: null,
      studentId: "",
      scope: { period: "today", grade: "" },
      query: "",
      className: "",
      filters: { kind: "", supervisorId: "" },
      customStart: today(),
      customEnd: today(),
    },
    active,
  );
  const setView = (view) => navigate({ view });
  const replaceValue = (key) => (value) =>
    navigate(
      (old) => ({
        [key]: typeof value === "function" ? value(old[key]) : value,
      }),
      { replace: true },
    );
  const setScope = replaceValue("scope"),
    setQuery = replaceValue("query"),
    setClassName = replaceValue("className"),
    setFilters = replaceValue("filters"),
    setCustomStart = replaceValue("customStart"),
    setCustomEnd = replaceValue("customEnd");
  const [filterError, setFilterError] = useState("");
  const [studentsRefresh, setStudentsRefresh] = useState(0);
  const [visited, setVisited] = useState({ students: false, reports: false });
  const overview = useGeneralPage("overview", { version: 2, ...scope });
  const snapshot = overview.data;
  function changeScope(next) {
    setScope(next);
    navigate({ view: "", record: null, studentId: "" }, { replace: true });
    setClassName("");
    setFilterError("");
  }
  function selectTab(next) {
    if (next === tab && !view && !record && !studentId) return;
    navigate({ tab: next, view: "", record: null, studentId: "" });
    setVisited((old) => ({ ...old, [next]: true }));
  }
  function openReport(next) {
    navigate({ record: next });
  }
  function openStudent(id) {
    navigate({ studentId: id });
  }
  function refresh() {
    navigate({ record: null, studentId: "" }, { replace: true });
    if (tab === "students") setStudentsRefresh((n) => n + 1);
    else overview.reload();
  }
  const hidden = !!record || !!studentId;
  return (
    <div className="general-workspace">
      {(tab !== "overview" || view || record || studentId) && (
        <div className="general-back-bar">
          <button className="button" onClick={back}>
            {t("رجوع", "Back")}
          </button>
        </div>
      )}
      <div hidden={hidden}>
        <div className="page-heading">
          <div>
            <h1>{t("الإشراف العام", "General supervision")}</h1>
            <p className="hint">
              {connection.supervisor.name} · {schoolIdentity.school}
            </p>
          </div>
          {!local && (
            <button
              className="button"
              onClick={refresh}
              disabled={tab !== "students" && overview.busy}
            >
              {t("تحديث", "Refresh")}
            </button>
          )}
        </div>
        <nav
          className="general-tabs"
          aria-label={t("مساحة الإشراف العام", "General-supervisor workspace")}
        >
          {[
            ["overview", "نظرة عامة", "Overview"],
            ["students", "الطلبة", "Students"],
            ["reports", "التقارير الواردة", "Received reports"],
          ].map(([value, ar, en]) => (
            <button
              className="button"
              key={value}
              aria-pressed={tab === value}
              onClick={() => selectTab(value)}
            >
              {t(ar, en)}
            </button>
          ))}
        </nav>
        <section className="general-filter-panel panel">
          {tab !== "students" && (
            <div className="general-periods" aria-label={t("الفترة", "Period")}>
              {periods.map(([value, ar, en]) => (
                <button
                  className="button"
                  key={value}
                  aria-pressed={scope.period === value}
                  onClick={() => changeScope({ ...scope, period: value })}
                >
                  {t(ar, en)}
                </button>
              ))}
            </div>
          )}
          <label className="field">
            <span>{t("الصف", "Grade")}</span>
            <select
              aria-label={t("الصف", "Grade")}
              value={scope.grade}
              onChange={(e) => changeScope({ ...scope, grade: e.target.value })}
            >
              <option value="">{t("كل الصفوف", "All grades")}</option>
              {gradeLabels.map(([value, ar]) => (
                <option key={value} value={value}>
                  {t(ar, "Grade " + value)}
                </option>
              ))}
            </select>
          </label>
          {tab !== "students" && (
            <details className="general-advanced">
              <summary>{t("متقدم", "Advanced")}</summary>
              <div className="general-custom-dates">
                <label className="field">
                  <span>{t("من", "From")}</span>
                  <input
                    aria-label={t("من", "From")}
                    type="date"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                  />
                </label>
                <label className="field">
                  <span>{t("إلى", "To")}</span>
                  <input
                    aria-label={t("إلى", "To")}
                    type="date"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                  />
                </label>
                <button
                  className="button"
                  onClick={() => {
                    if (!customStart || !customEnd || customStart > customEnd) {
                      setFilterError(
                        t(
                          "تحقق من بداية الفترة ونهايتها.",
                          "Check the start and end dates.",
                        ),
                      );
                      return;
                    }
                    changeScope({
                      ...scope,
                      period: "custom",
                      start: customStart,
                      end: customEnd,
                    });
                  }}
                >
                  {t("تطبيق الفترة", "Apply dates")}
                </button>
              </div>
              {tab === "reports" && (
                <div className="general-report-filters">
                  <label className="field">
                    <span>{t("نوع التقرير", "Report type")}</span>
                    <select
                      aria-label={t("نوع التقرير", "Report type")}
                      value={filters.kind}
                      onChange={(e) =>
                        setFilters((old) => ({ ...old, kind: e.target.value }))
                      }
                    >
                      <option value="">
                        {t("كل التقارير", "All reports")}
                      </option>
                      {Object.entries(titles).map(([kind, label]) => (
                        <option key={kind} value={kind}>
                          {label[lang === "en" ? 1 : 0]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>{t("المشرف", "Supervisor")}</span>
                    <select
                      aria-label={t("المشرف", "Supervisor")}
                      value={filters.supervisorId}
                      onChange={(e) =>
                        setFilters((old) => ({
                          ...old,
                          supervisorId: e.target.value,
                        }))
                      }
                    >
                      <option value="">
                        {t("كل المشرفين", "All supervisors")}
                      </option>
                      {filters.supervisorId &&
                        !snapshot?.supervisors.some(
                          (entry) => entry.id === filters.supervisorId,
                        ) && (
                          <option value={filters.supervisorId}>
                            {t(
                              "المشرف المحدد (لا تقارير ضمن الفترة)",
                              "Selected supervisor (no reports in scope)",
                            )}
                          </option>
                        )}
                      {snapshot?.supervisors.map((entry) => (
                        <option key={entry.id} value={entry.id}>
                          {entry.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
            </details>
          )}
          {filterError && <p role="alert">{filterError}</p>}
          {tab !== "students" && snapshot && (
            <p className="hint">
              {snapshot.scope.start
                ? `${labelDate(snapshot.scope.start, lang)} — ${labelDate(snapshot.scope.end, lang)}`
                : t("كل التواريخ", "All dates")}{" "}
            </p>
          )}
          {tab === "reports" && (filters.kind || filters.supervisorId) && (
            <p className="general-filter-indicator">
              {t("مرشحات التقارير مفعلة", "Report filters active")}
              {filters.kind &&
                " · " + titles[filters.kind][lang === "en" ? 1 : 0]}{" "}
              {filters.supervisorId &&
                " · " +
                  (snapshot?.supervisors.find(
                    (entry) => entry.id === filters.supervisorId,
                  )?.name || t("المشرف المحدد", "Selected supervisor"))}
              <button
                className="text-control"
                onClick={() => setFilters({ kind: "", supervisorId: "" })}
              >
                {t("مسح", "Clear")}
              </button>
            </p>
          )}
        </section>
        {tab !== "students" && (
          <Status page={overview} t={t} onRefresh={refresh} />
        )}
        {tab === "overview" && snapshot && (
          <>
            <div hidden={!!view}>
              <div className="general-stats">
                {[
                  [
                    "cases",
                    snapshot.totals.caseReports,
                    "تقارير الحالات",
                    "Case reports",
                    `${snapshot.totals.caseStudents} ${t("طلبة مختلفون", "distinct students")}`,
                  ],
                  [
                    "late",
                    snapshot.totals.lateReports ?? null,
                    "كشوف المتأخرين",
                    "Lateness reports",
                    "",
                  ],
                  [
                    "absence",
                    snapshot.totals.absenceDays,
                    snapshot.scope.start === snapshot.scope.end &&
                    snapshot.scope.start
                      ? "الغائبون"
                      : "أيام غياب الطلبة",
                    snapshot.scope.start === snapshot.scope.end &&
                    snapshot.scope.start
                      ? "Absent students"
                      : "Student absence days",
                    `${snapshot.coverage.received} / ${snapshot.coverage.expected} ${t("كشوف مكتملة", "complete sheets")}`,
                  ],
                  [
                    "followups",
                    snapshot.totals.followups,
                    "متابعات مستحقة",
                    "Follow-ups due",
                    `${t("حتى", "Through")} ${labelDate(snapshot.scope.dueCutoff, lang)}`,
                  ],
                  [
                    "reports",
                    snapshot.totals.reports,
                    "التقارير الواردة",
                    "Received reports",
                    "",
                  ],
                ].map(([value, count, ar, en, hint]) => (
                  <button
                    className="general-stat"
                    key={value}
                    onClick={() => {
                      if (value === "reports") {
                        setFilters({ kind: "", supervisorId: "" });
                        selectTab("reports");
                      } else setView(value);
                    }}
                  >
                    <span>{t(ar, en)}</span>
                    <strong>{count === null ? "—" : count}</strong>
                    {hint && <small>{hint}</small>}
                    <span className="general-card-action">
                      {t("عرض التفاصيل ←", "View details →")}
                    </span>
                  </button>
                ))}
              </div>
              {(snapshot.coverage.received < snapshot.coverage.expected ||
                !snapshot.coverage.expected) && (
                <p className="general-missing">
                  {snapshot.coverage.expected
                    ? t("الغياب جزئي", "Partial absence data")
                    : t(
                        "لم تصل كشوف غياب ضمن هذه الفترة.",
                        "No absence sheets received in this period.",
                      )}
                </p>
              )}
              {!!snapshot.totals.unresolved && (
                <button
                  className="general-unmatched"
                  onClick={() => setView("unmatched")}
                >
                  {t("أسماء تحتاج مطابقة", "Names needing a match")}:{" "}
                  {snapshot.totals.unresolved} · {t("عرض", "View")}
                </button>
              )}
              <h2>{t("الصفوف", "Grades")}</h2>
              <div className="general-grades">
                {snapshot.grades.map((grade) => (
                  <button
                    className="general-grade"
                    key={grade.grade}
                    onClick={() =>
                      changeScope({ ...scope, grade: grade.grade })
                    }
                  >
                    <strong>{t(grade.name, "Grade " + grade.grade)}</strong>
                    <span>
                      {grade.caseReports} {t("تقارير حالات", "case reports")} ·{" "}
                      {grade.lateStudents} {t("طلبة متأخرون", "late students")}
                    </span>
                    <span>
                      {t("الغياب", "Absence")}: {grade.absenceDays ?? "—"} ·{" "}
                      {grade.absenceReceived}/{grade.absenceExpected}{" "}
                      {t("كشوف", "sheets")}
                    </span>
                    {!grade.rosterAvailable && (
                      <span>
                        {t(
                          "قائمة الطلبة غير متاحة",
                          "Student roster unavailable",
                        )}
                      </span>
                    )}
                  </button>
                ))}
              </div>
              {!!snapshot.duePreview?.length && (
                <section>
                  <h2>{t("المتابعات المستحقة", "Follow-ups due")}</h2>
                  <div className="panel">
                    {snapshot.duePreview.slice(0, 3).map((entry) => (
                      <ReportRow
                        key={entry.id}
                        record={entry}
                        lang={lang}
                        t={t}
                        onReport={(record) => {
                          openReport({ ...record, detailView: "followups" });
                        }}
                        onStudent={openStudent}
                      />
                    ))}
                  </div>
                </section>
              )}
              {!!snapshot.recent?.length && (
                <section>
                  <h2>{t("أحدث التقارير", "Recent reports")}</h2>
                  <div className="panel">
                    {snapshot.recent.slice(0, 3).map((entry) => (
                      <ReportRow
                        key={entry.id}
                        record={entry}
                        lang={lang}
                        t={t}
                        onReport={openReport}
                        onStudent={openStudent}
                      />
                    ))}
                  </div>
                </section>
              )}
            </div>
            {view && (
              <>
                <Drilldown
                  key={snapshot.snapshotId + view}
                  view={view}
                  snapshot={snapshot}
                  lang={lang}
                  t={t}
                  onReport={openReport}
                  onStudent={openStudent}
                  onRefresh={refresh}
                />
              </>
            )}
          </>
        )}
        {visited.reports && snapshot && (
          <div hidden={tab !== "reports"}>
            <Drilldown
              key={snapshot.snapshotId}
              view="reports"
              snapshot={snapshot}
              filters={filters}
              lang={lang}
              t={t}
              onReport={openReport}
              onStudent={openStudent}
              onRefresh={refresh}
            />
          </div>
        )}
        {visited.students && (
          <div hidden={tab !== "students"}>
            <StudentDirectory
              key={`${scope.grade}:${studentsRefresh}`}
              grade={scope.grade}
              query={query}
              setQuery={setQuery}
              className={className}
              setClassName={setClassName}
              onSelect={openStudent}
              t={t}
            />
          </div>
        )}
      </div>
      {record && (
        <div hidden={!!studentId}>
          <ReceivedReport
            key={record.id}
            record={record}
            snapshotId={snapshot?.snapshotId}
            scope={scope}
            view={record.detailView || view}
            lang={lang}
            t={t}
            onRefresh={refresh}
            onBack={() => back("report")}
            onStudent={openStudent}
          />
        </div>
      )}
      {studentId && (
        <StudentProfile
          key={studentId}
          studentId={studentId}
          lang={lang}
          t={t}
          onBack={() => back("student")}
          backLabel={t("العودة إلى القائمة", "Back to list")}
        />
      )}
    </div>
  );
}
