import React, { useState, useRef } from "react";
import {
  grades,
  classesForGrade,
  fields,
  groups,
  newRow,
  uid,
  arDigits,
} from "./model.js";
import {
  rosterClasses,
  classStudents,
  matchesStudent,
  toggleLateStudent,
} from "./roster.js";

export function StudentPicker({ form, roster, grade, lang, onChange }) {
  const t = (ar, en) => (lang === "en" ? en : ar);
  const [open, setOpen] = useState(false);
  const classes = rosterClasses(roster, grade);
  const options = [...new Set([...classes, form.className].filter(Boolean))];
  const students = roster.students.filter(
    (s) =>
      (!grade || s.grade === grade) &&
      (!form.className || s.className === form.className) &&
      matchesStudent(s, form.student),
  );
  return (
    <div className="student-picker wide">
      <label className="field">
        <span>{t("الشعبة", "Class")}</span>
        <select
          aria-label={t("الشعبة", "Class")}
          value={form.className}
          onChange={(e) => {
            onChange({
              ...form,
              className: e.target.value,
              student: form.studentId ? "" : form.student,
              studentId: "",
            });
            setOpen(true);
          }}
        >
          <option value="">{t("جميع الشعب", "All classes")}</option>
          {options.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>{t("اسم الطالب", "Student name")}</span>
        <input
          aria-label={t("اسم الطالب", "Student name")}
          autoComplete="off"
          maxLength={250}
          value={form.student}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            onChange({ ...form, student: e.target.value, studentId: "" });
            setOpen(true);
          }}
        />
      </label>
      {open && !form.studentId && (
        <div className="student-results">
          {students.slice(0, 8).map((s) => (
            <button
              type="button"
              key={s.id}
              onClick={() => {
                onChange({
                  ...form,
                  student: s.name,
                  studentId: s.id,
                  className: s.className,
                });
                setOpen(false);
              }}
            >
              <span>{s.name}</span>
              <small>{s.className}</small>
            </button>
          ))}
          {!!form.student.trim() && (
            <button
              type="button"
              className="manual-choice"
              onClick={() => setOpen(false)}
            >
              {t("اعتماد الاسم المدخل يدويًا", "Use the manually entered name")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function LateChecklist({ form, roster, lang, onChange, Field }) {
  const t = (ar, en) => (lang === "en" ? en : ar);
  const [query, setQuery] = useState("");
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualName, setManualName] = useState("");
  const listRef = useRef();
  const classes = rosterClasses(roster, form.grade).length
    ? rosterClasses(roster, form.grade)
    : classesForGrade(form.grade);
  const classIndex = classes.indexOf(form.className);
  const duplicateManual = form.students.some(
    (s) => s.student === manualName.trim() && s.className === form.className,
  );
  const students = classStudents(roster, form.grade, form.className);
  const selected = new Map(
    form.students.filter((s) => s.studentId).map((s) => [s.studentId, s]),
  );
  const visible = students.filter(
    (s) => matchesStudent(s, query) && (!selectedOnly || selected.has(s.id)),
  );
  const selectedClasses = [...new Set(form.students.map((s) => s.className))];
  const changeClass = (className) => {
    onChange({ ...form, className });
    setQuery("");
    setSelectedOnly(false);
  };
  const remove = (row) => {
    if (
      [row.arrival, row.reason, row.action].some(Boolean) &&
      !confirm(
        t(
          "إلغاء تحديد الطالب وحذف تفاصيل تأخره؟",
          "Unselect this student and remove their lateness details?",
        ),
      )
    )
      return;
    onChange({
      ...form,
      students: form.students.filter((s) => s.id !== row.id),
    });
  };
  return (
    <section className="panel roster-panel" ref={listRef}>
      <details className="roster-grade">
        <summary>
          {form.grade || t("اختر الصف", "Choose a grade")}{" "}
          <small>{t("تغيير الصف", "Change grade")}</small>
        </summary>
        <Field
          lang={lang}
          field={{
            key: "grade",
            ar: "الصف",
            en: "Grade",
            kind: "select",
            options: grades,
          }}
          value={form.grade}
          onChange={(grade) => {
            if (
              form.students.length &&
              !confirm(
                t(
                  "تغيير الصف وبدء قائمة متأخرين فارغة؟ تبقى النسخ المحفوظة.",
                  "Change grade and clear this late list? Saved copies remain.",
                ),
              )
            )
              return;
            onChange({
              ...form,
              grade,
              className: rosterClasses(roster, grade)[0] || "",
              students: [],
            });
            setQuery("");
            setSelectedOnly(false);
          }}
        />
      </details>
      <div className="roster-controls">
        <Field
          lang={lang}
          field={fields.date}
          value={form.date}
          onChange={(date) => onChange({ ...form, date })}
        />
        <Field
          lang={lang}
          field={{
            key: "className",
            ar: "الشعبة",
            en: "Class",
            kind: "select",
            options: [
              ...new Set([
                ...(rosterClasses(roster, form.grade).length
                  ? rosterClasses(roster, form.grade)
                  : classesForGrade(form.grade)),
                ...form.students.map((s) => s.className),
              ]),
            ],
          }}
          value={form.className}
          onChange={changeClass}
        />
      </div>
      <div className="roster-summary">
        <strong>
          {t("المتأخرون", "Late students")}{" "}
          <span className="count">{arDigits(form.students.length)}</span>
        </strong>
        <span>
          {t("في الشعبة الحالية", "In this class")}:{" "}
          {arDigits(
            form.students.filter((s) => s.className === form.className).length,
          )}
        </span>
      </div>
      {selectedClasses.length > 0 && (
        <div className="class-totals">
          {selectedClasses.map((c) => (
            <button
              key={c}
              className="button"
              aria-label={t(`عرض الشعبة ${c}`, `View class ${c}`)}
              onClick={() => changeClass(c)}
            >
              {c}{" "}
              <span className="count">
                {arDigits(
                  form.students.filter((s) => s.className === c).length,
                )}
              </span>
            </button>
          ))}
        </div>
      )}
      <label className="search">
        <input
          aria-label={t("بحث في أسماء الشعبة", "Search class students")}
          placeholder={t("بحث بالاسم", "Search by name")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <label className="roster-filter">
        <input
          type="checkbox"
          checked={selectedOnly}
          onChange={(e) => setSelectedOnly(e.target.checked)}
        />
        {t("المحددون فقط", "Selected only")}
      </label>
      <div className="roster-checklist">
        {visible.map((student) => {
          const row = selected.get(student.id);
          return (
            <label
              className={`roster-student ${row ? "is-selected" : ""}`}
              key={student.id}
            >
              <input
                type="checkbox"
                aria-label={student.name}
                checked={!!row}
                disabled={!row && form.students.length >= 500}
                onChange={() =>
                  row
                    ? remove(row)
                    : onChange(toggleLateStudent(form, student, uid))
                }
              />
              <span>{row?.student || student.name}</span>
            </label>
          );
        })}
        {form.students
          .filter(
            (row) =>
              row.className === form.className &&
              !students.some((s) => s.id === row.studentId) &&
              matchesStudent({ name: row.student }, query),
          )
          .map((row) => (
            <label className="roster-student is-selected" key={row.id}>
              <input
                type="checkbox"
                checked
                aria-label={row.student}
                onChange={() => remove(row)}
              />
              <span>{row.student}</span>
            </label>
          ))}
        {!visible.length && (
          <p className="empty">
            {t(
              students.length
                ? "لا توجد أسماء مطابقة"
                : "لا توجد قائمة طلبة لهذه الشعبة",
              students.length
                ? "No matching names"
                : "No roster for this class",
            )}
          </p>
        )}
      </div>
      <div className="class-navigation">
        <button
          className="button"
          disabled={classIndex <= 0}
          onClick={() => {
            changeClass(classes[classIndex - 1]);
            listRef.current?.scrollIntoView({ block: "start" });
          }}
        >
          {t("الشعبة السابقة", "Previous class")}
        </button>
        <button
          className="button"
          disabled={classIndex < 0 || classIndex >= classes.length - 1}
          onClick={() => {
            changeClass(classes[classIndex + 1]);
            listRef.current?.scrollIntoView({ block: "start" });
          }}
        >
          {t("الشعبة التالية", "Next class")}
        </button>
      </div>
      <button
        className="button add-row"
        onClick={() => setManualOpen(!manualOpen)}
        aria-expanded={manualOpen}
      >
        {t("إضافة اسم غير موجود", "Add a missing name")}
      </button>
      {manualOpen && (
        <div className="manual-student">
          <Field
            lang={lang}
            field={fields.student}
            value={manualName}
            onChange={setManualName}
          />
          <Field
            lang={lang}
            field={{
              ...fields.className,
              kind: "select",
              options: classesForGrade(form.grade),
            }}
            value={form.className}
            onChange={changeClass}
          />
          <button
            className="button"
            disabled={
              !manualName.trim() ||
              duplicateManual ||
              !form.className ||
              form.students.length >= 500
            }
            onClick={() => {
              if (
                form.students.some(
                  (s) =>
                    s.student === manualName.trim() &&
                    s.className === form.className,
                )
              )
                return;
              onChange({
                ...form,
                students: [
                  ...form.students,
                  {
                    ...newRow(groups.late[0]),
                    student: manualName.trim(),
                    className: form.className,
                    studentId: "",
                  },
                ],
              });
              setManualName("");
              setManualOpen(false);
            }}
          >
            {t("إضافة إلى المتأخرين", "Add to late list")}
          </button>
          {duplicateManual && (
            <p role="alert" className="settings-note">
              {t(
                "الاسم مضاف إلى قائمة المتأخرين",
                "This name is already in the late list",
              )}
            </p>
          )}
        </div>
      )}
      {!!form.students.length && (
        <details className="selected-details">
          <summary>
            {t(
              "مراجعة المحددين وتفاصيل التأخر",
              "Review selected students & details",
            )}{" "}
            ({arDigits(form.students.length)})
          </summary>
          {form.students.map((row) => (
            <div className="entry" key={row.id}>
              <div className="entry-head">
                <strong>
                  {row.student} <small>{row.className}</small>
                </strong>
                <button
                  className="text-control danger"
                  aria-label={t(
                    `إزالة ${row.student}`,
                    `Remove ${row.student}`,
                  )}
                  onClick={() => remove(row)}
                >
                  {t("إزالة", "Remove")}
                </button>
              </div>
              <details className="row-options">
                <summary>{t("تفاصيل التأخر", "Lateness details")}</summary>
                <div className="fields">
                  {groups.late[0].fields
                    .filter((f) => f.key !== "student")
                    .map((f) => (
                      <Field
                        key={f.key}
                        lang={lang}
                        field={f}
                        value={row[f.key]}
                        onChange={(value) =>
                          onChange({
                            ...form,
                            students: form.students.map((s) =>
                              s.id === row.id ? { ...s, [f.key]: value } : s,
                            ),
                          })
                        }
                      />
                    ))}
                </div>
              </details>
            </div>
          ))}
        </details>
      )}
    </section>
  );
}
