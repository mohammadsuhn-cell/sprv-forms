import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  FileText,
  ClipboardList,
  Users,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Settings,
  FolderOpen,
  Download,
  Upload,
  Check,
  ArrowRight,
  ArrowLeft,
  Search,
  X,
  Copy,
  Share2,
} from "lucide-react";
import "@fontsource/noto-sans-arabic/400.css";
import "@fontsource/noto-sans-arabic/600.css";
import "./style.css";
import {
  titles,
  schoolIdentity,
  withSchoolIdentity,
  fields,
  caseRegister,
  groups,
  caseSections,
  newRow,
  newForm,
  emptyStore,
  storageKey,
  validateStore,
  validateForm,
  today,
  uid,
  dateLabel,
} from "./model.js";
import { download, fileName } from "./exports.js";
function read() {
  try {
    const raw = localStorage.getItem(storageKey);
    return {
      data: raw ? validateStore(JSON.parse(raw)) : emptyStore(),
      error: "",
    };
  } catch {
    return {
      data: emptyStore(),
      error: "تعذّر فتح البيانات المحفوظة. لن تُستبدل تلقائيًا.",
    };
  }
}
const initial = read();
function Field({ field, value, onChange, lang }) {
  const id = React.useId();
  const t = (ar, en) => (lang === "en" ? en : ar);
  const common = {
    id,
    "aria-label": t(field.ar, field.en),
    value: value ?? "",
    onChange: (e) => onChange(e.target.value),
    autoComplete: "off",
  };
  return (
    <label
      className={field.kind === "textarea" ? "field wide" : "field"}
      htmlFor={id}
    >
      <span>{t(field.ar, field.en)}</span>
      {field.kind === "select" ? (
        <select {...common}>
          <option value="">{t("اختر", "Select")}</option>
          {field.options.map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      ) : field.kind === "textarea" ? (
        <textarea {...common} rows={3} maxLength={6000} />
      ) : (
        <input
          {...common}
          type={field.kind || "text"}
          min={field.kind === "number" ? 0 : undefined}
          step={field.kind === "number" ? 1 : undefined}
          inputMode={field.kind === "number" ? "numeric" : undefined}
          maxLength={250}
          list={field.key === "className" ? "classes" : undefined}
        />
      )}
    </label>
  );
}

function OptionalPanel({ title, initialOpen = false, children }) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <details
      className="panel optional"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>{title}</summary>
      {children}
    </details>
  );
}

function App() {
  const [writeAllowed, setWriteAllowed] = useState(!initial.error);
  const [data, setData] = useState(initial.data),
    [page, setPage] = useState("home"),
    [kind, setKind] = useState(""),
    [message, setMessage] = useState(""),
    [storageError, setStorageError] = useState(initial.error),
    [errors, setErrors] = useState([]),
    [busy, setBusy] = useState(""),
    [query, setQuery] = useState(""),
    [dueOnly, setDueOnly] = useState(false),
    [readyFile, setReadyFile] = useState(null);
  const restoreRef = useRef(),
    messageTimer = useRef();
  const en = data.lang === "en",
    t = (ar, english) => (en ? english : ar),
    form = data.drafts[kind];
  useEffect(() => {
    document.documentElement.lang = en ? "en" : "ar";
    document.documentElement.dir = en ? "ltr" : "rtl";
  }, [en]);
  useEffect(() => {
    if (!writeAllowed) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(data));
      setStorageError("");
    } catch {
      setStorageError(
        t(
          "تعذّر حفظ البيانات على الجهاز. نزّل نسخة احتياطية قبل الإغلاق.",
          "Could not save on this device. Download a backup before closing.",
        ),
      );
    }
  }, [data, writeAllowed]);
  useEffect(() => () => clearTimeout(messageTimer.current), []);
  useEffect(() => {
    window.scrollTo(0, 0);
    setErrors([]);
    setReadyFile(null);
  }, [page, kind]);
  function notify(text) {
    setMessage(text);
    clearTimeout(messageTimer.current);
    messageTimer.current = setTimeout(() => setMessage(""), 4500);
  }
  function setDraft(value) {
    value = withSchoolIdentity(value);
    setData((d) => ({ ...d, drafts: { ...d.drafts, [value.kind]: value } }));
    setReadyFile(null);
  }
  function change(key, value) {
    setDraft({ ...form, [key]: value });
    if (["school", "supervisor", "year"].includes(key))
      setData((d) => ({ ...d, profile: { ...d.profile, [key]: value } }));
  }
  function openKind(k) {
    setKind(k);
    if (!data.drafts[k])
      setData((d) => ({
        ...d,
        drafts: { ...d.drafts, [k]: newForm(k, d.profile) },
      }));
    setPage("form");
  }
  function startNew() {
    if (
      !data.saved.some(
        (s) => s.id === form.id && JSON.stringify(s) === JSON.stringify(form),
      ) &&
      !confirm(
        t(
          "بدء نموذج جديد؟ ستُحذف المسودة الحالية، وتبقى النسخ المحفوظة.",
          "Start a new form? The current draft will be cleared. Saved copies remain.",
        ),
      )
    )
      return;
    setDraft(newForm(kind, data.profile));
    setErrors([]);
  }
  function check() {
    const e = validateForm(form);
    setErrors(e.map((v) => v[en ? 1 : 0]));
    if (e.length) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return false;
    }
    return true;
  }
  function save() {
    if (!check()) return;
    const saved = { ...form, savedAt: new Date().toISOString() };
    setData((d) => ({
      ...d,
      saved: [saved, ...d.saved.filter((s) => s.id !== form.id)],
      drafts: { ...d.drafts, [form.kind]: saved },
    }));
    notify(t("تم الحفظ", "Saved"));
    setPage("saved");
  }
  async function exportFile(type, target = form) {
    if (target === form && !check()) return;
    setBusy(type);
    setReadyFile(null);
    try {
      const lib = await import("./exports.js");
      const blob =
        type === "pdf"
          ? await lib.pdfBlob(target)
          : type === "xlsx"
            ? await lib.excelBlob(target)
            : await lib.wordBlob(target);
      const name = fileName(target, type === "word" ? "docx" : type);
      download(blob, name);
      setReadyFile({ blob, name });
      notify(t("تم تجهيز الملف", "File ready"));
    } catch (e) {
      console.error("Export failed", e);
      setErrors([
        t(
          "تعذّر التصدير. أعد المحاولة أو اختر صيغة أخرى.",
          "Export failed. Retry or select another format.",
        ),
      ]);
    } finally {
      setBusy("");
    }
  }
  async function share() {
    if (!readyFile) return;
    const file = new File([readyFile.blob], readyFile.name, {
      type: readyFile.blob.type,
    });
    try {
      if (navigator.canShare?.({ files: [file] }))
        await navigator.share({ files: [file], title: readyFile.name });
      else download(readyFile.blob, readyFile.name);
    } catch (e) {
      if (e.name !== "AbortError")
        notify(
          t(
            "تعذّرت المشاركة. استخدم التنزيل.",
            "Sharing failed. Use download.",
          ),
        );
    }
  }
  function backup() {
    download(
      new Blob(
        [
          !writeAllowed
            ? localStorage.getItem(storageKey) || JSON.stringify(data)
            : JSON.stringify(data, null, 2),
        ],
        { type: "application/json" },
      ),
      `supervision-backup-${today()}.json`,
    );
  }
  async function restore(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      if (file.size > 15000000) throw Error();
      const v = validateStore(JSON.parse(await file.text()));
      if (
        !confirm(
          t(
            `إضافة ${v.saved.length} نسخة محفوظة من الملف؟ ستبقى البيانات الحالية.`,
            `Add ${v.saved.length} saved forms? Existing data will be kept.`,
          ),
        )
      )
        return;
      setData((d) => ({
        ...d,
        profile: {
          school: d.profile.school || v.profile.school,
          year: d.profile.year || v.profile.year,
          supervisor: d.profile.supervisor || v.profile.supervisor,
        },
        saved: [
          ...d.saved,
          ...v.saved.filter((s) => !d.saved.some((a) => a.id === s.id)),
        ],
        drafts: { ...v.drafts, ...d.drafts },
      }));
      notify(t("تمت الاستعادة", "Backup restored"));
    } catch {
      notify(t("الملف ليس نسخة احتياطية صالحة", "Invalid backup file"));
    }
  }
  function sectionTitle(ar, english) {
    return <h2>{t(ar, english)}</h2>;
  }
  const field = (key, ar, english, type = "text") => (
    <Field
      lang={data.lang}
      key={key}
      field={{ key, ar, en: english, kind: type }}
      value={form[key]}
      onChange={(v) => change(key, v)}
    />
  );
  return (
    <>
      <header className="topbar">
        <div className="brand">
          <span className="brand-icon">
            <FileText size={22} />
          </span>
          <div>
            <strong>{t("نماذج الإشراف", "Supervision forms")}</strong>
            <span>{t("الإشراف المدرسي", "School supervision")}</span>
          </div>
        </div>
        <div className="header-actions">
          <button
            className="language"
            onClick={() => setData((d) => ({ ...d, lang: en ? "ar" : "en" }))}
          >
            {en ? "العربية" : "EN"}
          </button>
          <button
            className="icon"
            aria-label={t("الإعدادات", "Settings")}
            onClick={() => setPage("settings")}
          >
            <Settings size={21} />
          </button>
        </div>
      </header>
      <main className={page === "form" ? "content editing" : "content"}>
        {storageError && (
          <div className="alert" role="alert">
            {storageError}
            <button onClick={backup}>{t("نسخة احتياطية", "Backup")}</button>
          </div>
        )}
        {page !== "home" && (
          <button className="back" onClick={() => setPage("home")}>
            {en ? <ArrowLeft size={18} /> : <ArrowRight size={18} />}{" "}
            {t("النماذج", "Forms")}
          </button>
        )}
        {page === "home" && (
          <>
            <div className="page-heading">
              <h1>{t("النماذج", "Forms")}</h1>
              <button className="button" onClick={() => setPage("saved")}>
                <FolderOpen size={18} />
                {t("السجلات والمتابعة", "Records & follow-up")}
                <span className="count">{data.saved.length}</span>
              </button>
            </div>
            {!data.profile.supervisor && (
              <button className="setup" onClick={() => setPage("settings")}>
                <Settings size={20} />
                <span>{t("إعداد اسم المشرف", "Set supervisor name")}</span>
                {en ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
              </button>
            )}
            {data.profile.school && (
              <div className="school-line">
                <strong>{data.profile.school}</strong>
                <span>{schoolIdentity.year}</span>
              </div>
            )}
            <div className="form-cards">
              <button className="form-card" onClick={() => openKind("case")}>
                <Plus size={23} />
                <div>
                  <h2>{t("تسجيل حالة", "Record a case")}</h2>
                </div>
                {en ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
              </button>
            </div>
            {data.saved.length > 0 && (
              <section className="recent">
                <div className="section-heading">
                  {sectionTitle("آخر المحفوظات", "Recent forms")}
                  <button
                    className="text-button"
                    onClick={() => setPage("saved")}
                  >
                    {t("عرض الكل", "View all")}
                  </button>
                </div>
                {data.saved.slice(0, 3).map((s) => (
                  <SavedRow key={s.id} item={s} />
                ))}
              </section>
            )}
          </>
        )}
        {page === "form" && form && (
          <>
            <div className="page-heading">
              <div>
                <h1>
                  {kind === "case"
                    ? t("تسجيل حالة", "Record a case")
                    : titles[kind][en ? 1 : 0]}
                </h1>
                <span className="small-status">
                  {storageError
                    ? t("غير محفوظ", "Not saved")
                    : t("مسودة على الجهاز", "Draft on this device")}
                </span>
              </div>
              <button className="button" onClick={startNew}>
                <Plus size={17} />
                {t("جديد", "New")}
              </button>
            </div>
            {errors.length > 0 && (
              <div className="alert" role="alert">
                {errors.map((s, i) => (
                  <div key={i}>{s}</div>
                ))}
              </div>
            )}
            <OptionalPanel
              key={form.id}
              initialOpen={!form.supervisor}
              title={form.school || t("بيانات المدرسة", "School details")}
            >
              <div className="fields">
                <div className="school-identity wide">
                  {schoolIdentity.school}
                  <span>{schoolIdentity.year}</span>
                </div>
                {field("supervisor", "اسم المشرف", "Supervisor")}
                {kind !== "case" && field("date", "التاريخ", "Date", "date")}
                {kind === "cases" && (
                  <>
                    {field("from", "من تاريخ", "From", "date")}
                    {field("to", "إلى تاريخ", "To", "date")}
                  </>
                )}
              </div>
            </OptionalPanel>
            {kind === "case" ? (
              <>
                <section className="panel">
                  <div className="fields">
                    {[
                      fields.date,
                      fields.student,
                      fields.className,
                      fields.type,
                      fields.action,
                      {
                        ...fields.due,
                        ar: "موعد المتابعة (اختياري)",
                        en: "Follow-up date (optional)",
                      },
                    ].map((f) => (
                      <Field
                        key={f.key}
                        lang={data.lang}
                        field={f}
                        value={form[f.key]}
                        onChange={(v) => {
                          const next = { ...form, [f.key]: v };
                          if (
                            f.key === "action" &&
                            !form.actionState &&
                            v &&
                            v !== "لم يُتخذ إجراء بعد"
                          )
                            next.actionState = "تم التنفيذ";
                          if (
                            f.key === "action" &&
                            (!v || v === "لم يُتخذ إجراء بعد")
                          )
                            next.actionState = "";
                          setDraft(next);
                        }}
                      />
                    ))}
                  </div>
                </section>
                <details className="panel optional">
                  <summary>{t("تفاصيل إضافية", "Additional details")}</summary>
                  {caseSections.map((section) => (
                    <section key={section.ar}>
                      {sectionTitle(section.ar, section.en)}
                      <div className="fields">
                        {section.fields
                          .filter(
                            (f) =>
                              ![
                                "student",
                                "className",
                                "type",
                                "action",
                                "due",
                              ].includes(f.key),
                          )
                          .map((f) => (
                            <Field
                              key={f.key}
                              lang={data.lang}
                              field={f}
                              value={form[f.key]}
                              onChange={(v) => change(f.key, v)}
                            />
                          ))}
                      </div>
                    </section>
                  ))}
                </details>
              </>
            ) : (
              groups[kind].map((group) => (
                <section className="panel group" key={group.key}>
                  <div className="section-heading">
                    {sectionTitle(group.ar, group.en)}
                    <span className="count">{form[group.key].length}</span>
                  </div>
                  {form[group.key].map((row, index) => (
                    <div className="entry" key={row.id}>
                      <div className="entry-head">
                        <span>
                          {t("سجل", "Entry")} {index + 1}
                        </span>
                        <button
                          className="icon danger"
                          aria-label={t("حذف السجل", "Delete entry")}
                          onClick={() => {
                            if (
                              Object.entries(row).some(
                                ([k, v]) => k !== "id" && v,
                              ) &&
                              !confirm(
                                t("حذف هذا السجل؟", "Delete this entry?"),
                              )
                            )
                              return;
                            change(
                              group.key,
                              form[group.key].filter((r) => r.id !== row.id),
                            );
                          }}
                        >
                          <Trash2 size={17} />
                        </button>
                      </div>
                      <div className="fields">
                        {group.fields.map((f) => (
                          <Field
                            lang={data.lang}
                            key={f.key}
                            field={f}
                            value={row[f.key]}
                            onChange={(v) =>
                              change(
                                group.key,
                                form[group.key].map((r) =>
                                  r.id === row.id ? { ...r, [f.key]: v } : r,
                                ),
                              )
                            }
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                  <button
                    className="button add-row"
                    disabled={form[group.key].length >= 100}
                    onClick={() =>
                      change(group.key, [...form[group.key], newRow(group)])
                    }
                  >
                    <Plus size={18} />
                    {t("إضافة سجل", "Add entry")}
                  </button>
                </section>
              ))
            )}
            {kind !== "case" && (
              <section className="panel">
                {field(
                  "notes",
                  "ملاحظات المشرف",
                  "Supervisor notes",
                  "textarea",
                )}
              </section>
            )}
            {readyFile && (
              <div className="file-ready">
                <Check size={18} />
                <span>{readyFile.name}</span>
                <button className="button" onClick={share}>
                  <Share2 size={17} />
                  {t("مشاركة", "Share")}
                </button>
              </div>
            )}
            <div className="action-bar">
              <button
                className="button primary"
                disabled={!!busy}
                onClick={save}
              >
                <Check size={18} />
                {t("حفظ الحالة", "Save record")}
              </button>
              <details className="export-menu">
                <summary className="button">{t("تصدير", "Export")}</summary>
                <div>
                  {["pdf", "word", "xlsx"].map((type) => (
                    <button
                      key={type}
                      className="button"
                      disabled={!!busy}
                      onClick={() => exportFile(type)}
                    >
                      {type === "word" ? "Word" : type.toUpperCase()}
                    </button>
                  ))}
                </div>
              </details>
            </div>
          </>
        )}
        {page === "saved" && (
          <>
            <div className="page-heading">
              <h1>{t("السجلات والمتابعة", "Records & follow-up")}</h1>
              <span className="count">{data.saved.length}</span>
            </div>
            <label className="search">
              <Search size={19} />
              <input
                aria-label={t("بحث في المحفوظات", "Search saved forms")}
                placeholder={t("اسم الطالب أو التاريخ", "Student name or date")}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <div className="record-tools">
              <label>
                <input
                  type="checkbox"
                  checked={dueOnly}
                  onChange={(e) => setDueOnly(e.target.checked)}
                />{" "}
                {t("متابعات مستحقة", "Follow-ups due")}
              </label>
              <button
                className="button"
                disabled={!!busy || !data.saved.some((s) => s.kind === "case")}
                onClick={() =>
                  exportFile(
                    "xlsx",
                    caseRegister(
                      data.saved
                        .filter(
                          (s) =>
                            !dueOnly ||
                            (s.due &&
                              s.due <= today() &&
                              !["مغلقة", "تمت المتابعة"].includes(s.status)),
                        )
                        .filter((s) =>
                          JSON.stringify(s)
                            .toLowerCase()
                            .includes(query.toLowerCase()),
                        ),
                      data.profile,
                    ),
                  )
                }
              >
                {t("تصدير Excel", "Export Excel")}
              </button>
            </div>
            {readyFile && (
              <div className="file-ready">
                <span>{readyFile.name}</span>
                <button className="button" onClick={share}>
                  {t("مشاركة", "Share")}
                </button>
              </div>
            )}
            <section className="panel saved-list">
              {data.saved
                .filter(
                  (s) =>
                    JSON.stringify(s)
                      .toLowerCase()
                      .includes(query.toLowerCase()) &&
                    (!dueOnly ||
                      (s.due &&
                        s.due <= today() &&
                        !["مغلقة", "تمت المتابعة"].includes(s.status))),
                )
                .map((s) => (
                  <SavedRow key={s.id} item={s} remove />
                ))}
              {!data.saved.filter(
                (s) =>
                  JSON.stringify(s)
                    .toLowerCase()
                    .includes(query.toLowerCase()) &&
                  (!dueOnly ||
                    (s.due &&
                      s.due <= today() &&
                      !["مغلقة", "تمت المتابعة"].includes(s.status))),
              ).length && (
                <p className="empty">
                  {t("لا توجد نماذج محفوظة", "No saved forms")}
                </p>
              )}
            </section>
          </>
        )}
        {page === "settings" && (
          <>
            <h1>{t("الإعدادات", "Settings")}</h1>
            <section className="panel">
              {sectionTitle("بيانات النماذج", "Form details")}
              <div className="school-identity">
                {schoolIdentity.school}
                <span>{schoolIdentity.year}</span>
              </div>
              <div className="fields">
                {[["supervisor", "اسم المشرف", "Supervisor"]].map(
                  ([key, ar, english]) => (
                    <Field
                      lang={data.lang}
                      key={key}
                      field={{ key, ar, en: english }}
                      value={data.profile[key]}
                      onChange={(v) =>
                        setData((d) => ({
                          ...d,
                          profile: { ...d.profile, [key]: v },
                        }))
                      }
                    />
                  ),
                )}
              </div>
              <span className="small-status">
                {t(
                  "تُحفظ تلقائيًا على هذا الجهاز",
                  "Saved automatically on this device",
                )}
              </span>
            </section>
            <section className="panel">
              {sectionTitle("نسخ البيانات", "Data backup")}
              {!writeAllowed && (
                <button
                  className="button"
                  onClick={() => {
                    if (
                      confirm(
                        t(
                          "تنزيل البيانات الحالية وبدء سجل فارغ؟",
                          "Download current data and start an empty register?",
                        ),
                      )
                    ) {
                      backup();
                      setData(emptyStore());
                      setWriteAllowed(true);
                      setStorageError("");
                    }
                  }}
                >
                  {t(
                    "تنزيل البيانات وإعادة التهيئة",
                    "Download data and reset",
                  )}
                </button>
              )}
              <div className="backup-buttons">
                <button className="button" onClick={backup}>
                  <Download size={18} />
                  {t("تنزيل نسخة احتياطية", "Download backup")}
                </button>
                <button
                  className="button"
                  onClick={() => restoreRef.current.click()}
                >
                  <Upload size={18} />
                  {t("استعادة نسخة", "Restore backup")}
                </button>
              </div>
              <p className="settings-note">
                {t(
                  "المسودات والمحفوظات خاصة بهذا المتصفح. حذف بيانات المتصفح يحذفها.",
                  "Drafts and saved forms belong to this browser. Clearing browser data removes them.",
                )}
              </p>
              <input
                hidden
                ref={restoreRef}
                type="file"
                accept=".json,application/json"
                onChange={restore}
              />
            </section>
            <details className="panel optional">
              <summary>{t("ملفات ونماذج أخرى", "Other files & forms")}</summary>
              <a
                className="templates"
                href="./نماذج-الإشراف-المبسطة.xlsx"
                download
              >
                {t("نموذج Excel", "Excel template")}
              </a>
              <a
                className="templates"
                href="./School-Supervision-Word-Forms.zip"
                download
              >
                {t("قوالب Word", "Word templates")}
              </a>
              <button className="button" onClick={() => openKind("staffing")}>
                {t("المعلمون والبدلاء", "Staff & cover")}
              </button>
              {Object.entries(data.drafts)
                .filter(([k]) => ["daily", "cases"].includes(k))
                .map(([k]) => (
                  <button
                    className="button"
                    key={k}
                    onClick={() => openKind(k)}
                  >
                    {titles[k][en ? 1 : 0]}
                  </button>
                ))}
            </details>
            <section className="panel">
              {sectionTitle("اختصار على الهاتف", "Phone shortcut")}
              <p className="settings-note">
                {t(
                  "من قائمة المتصفح أو المشاركة، اختر «إضافة إلى الشاشة الرئيسية».",
                  "From the browser menu or Share menu, choose “Add to Home Screen”.",
                )}
              </p>
            </section>
          </>
        )}
      </main>
      <datalist id="classes">
        {["٦", "٧", "٨", "٩"].flatMap((g) =>
          ["١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩", "١٠"].map((c) => (
            <option key={`${g}/${c}`} value={`${g}/${c}`} />
          )),
        )}
      </datalist>
      {message && (
        <div className="toast" role="status">
          <Check size={17} />
          {message}
        </div>
      )}
      {busy && (
        <div className="busy-status" role="status">
          {t("جارٍ تجهيز الملف…", "Preparing document…")}
        </div>
      )}
    </>
  );
  function SavedRow({ item, remove = false }) {
    return (
      <div className="saved-row">
        <button
          className="saved-open"
          onClick={() => {
            const existing = data.drafts[item.kind];
            if (
              existing &&
              JSON.stringify(existing) !== JSON.stringify(item) &&
              !confirm(
                t(
                  "فتح النسخة المحفوظة بدل المسودة الحالية؟",
                  "Open the saved form instead of the current draft?",
                ),
              )
            )
              return;
            setDraft(structuredClone(item));
            setKind(item.kind);
            setPage("form");
          }}
        >
          <FileText size={21} />
          <div>
            <strong>{item.student || titles[item.kind][en ? 1 : 0]}</strong>
            <span>
              {dateLabel(item.date)} ·{" "}
              {item.className || titles[item.kind][en ? 1 : 0]}
              {item.due && (
                <span>
                  {t("المتابعة: ", "Follow-up: ")}
                  {dateLabel(item.due)}
                  {item.status ? " · " + item.status : ""}
                </span>
              )}
            </span>
          </div>
        </button>
        {remove && (
          <button
            className="icon danger"
            aria-label={t("حذف النسخة", "Delete saved copy")}
            onClick={() => {
              if (confirm(t("حذف النسخة المحفوظة؟", "Delete this saved copy?")))
                setData((d) => ({
                  ...d,
                  saved: d.saved.filter((s) => s.id !== item.id),
                }));
            }}
          >
            <Trash2 size={18} />
          </button>
        )}
      </div>
    );
  }
}
createRoot(document.getElementById("root")).render(<App />);
if ("serviceWorker" in navigator)
  window.addEventListener("load", () =>
    navigator.serviceWorker.register("./sw.js").catch(() => {}),
  );
