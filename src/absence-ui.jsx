import React, { useState, useRef } from "react";
import { uid, arDigits } from "./model.js";
import { rosterGrades } from "./roster.js";
import {
  initializeAbsence,
  absenceSummary,
  editAbsenceClass,
  toggleAbsent,
} from "./absence.js";

export function AbsenceChecklist({
  form,
  roster,
  lang,
  onChange,
  onSettings,
  Field,
}) {
  const t = (ar, en) => (lang === "en" ? en : ar);
  const [manual, setManual] = useState("");
  const top = useRef();
  const summary = absenceSummary(form);
  const current =
    summary.classes.find((c) => c.className === form.className) ||
    summary.classes[0];
  const available = [
    ...new Set([form.grade, ...rosterGrades(roster)].filter(Boolean)),
  ];
  const selectClass = (className) => {
    onChange({ ...form, className });
    setManual("");
  };
  const students = form.roll.filter((s) => s.className === current?.className);
  const manualRows = form.students.filter(
    (s) =>
      s.className === current?.className &&
      !form.roll.some((r) => r.studentId === s.studentId),
  );
  const duplicate = [...students, ...manualRows].some(
    (s) => s.student.trim() === manual.trim(),
  );
  return (
    <>
      <section className="panel" ref={top}>
        <div className="fields">
          <Field
            lang={lang}
            field={{ ar: "التاريخ", en: "Date", kind: "date" }}
            value={form.date}
            onChange={(date) =>
              onChange({
                ...form,
                date,
                classes: form.classes.map((c) => ({ ...c, confirmed: "" })),
              })
            }
          />
          <Field
            lang={lang}
            field={{
              ar: "الصف",
              en: "Grade",
              kind: "select",
              options: available,
            }}
            value={form.grade}
            onChange={(grade) => {
              if (!grade || grade === form.grade) return;
              if (
                (form.students.length || summary.confirmed) &&
                !confirm(
                  t(
                    "تغيير الصف ومسح اختيار الغائبين؟",
                    "Change grade and clear the absence selection?",
                  ),
                )
              )
                return;
              onChange(initializeAbsence(form, roster, grade, uid));
              setManual("");
            }}
          />
        </div>
        {!current ? (
          <button className="button" onClick={onSettings}>
            {t("تحميل قائمة الطلبة", "Load student roster")}
          </button>
        ) : (
          <>
            <div
              className="absence-class-tabs"
              aria-label={t("الشعب", "Classes")}
            >
              {summary.classes.map((c) => (
                <button
                  key={c.id}
                  className={`button ${c.className === current.className ? "active" : ""}`}
                  aria-pressed={c.className === current.className}
                  aria-label={t(
                    `الشعبة ${c.className}`,
                    `Class ${c.className}`,
                  )}
                  onClick={() => selectClass(c.className)}
                >
                  {c.className}
                  {c.confirmed === "yes" && (
                    <span className="class-confirmed">
                      {t("مؤكدة", "Confirmed")}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <p className="small-status" role="status">
              {t(
                `الشعب المؤكدة: ${arDigits(summary.confirmed)} من ${arDigits(summary.classes.length)}`,
                `Classes confirmed: ${summary.confirmed} of ${summary.classes.length}`,
              )}
            </p>
          </>
        )}
      </section>
      {current && (
        <section className="panel">
          <div className="section-heading">
            <h2>
              {t("الغائبون", "Absent students")} · {current.className}
            </h2>
            <span className="count">{arDigits(current.absent)}</span>
          </div>
          <div className="roster-checklist">
            {students.map((s) => {
              const checked = form.students.some(
                (r) => r.studentId === s.studentId,
              );
              return (
                <label
                  key={s.id}
                  className={`roster-student ${checked ? "is-selected" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    aria-label={s.student}
                    onChange={() => onChange(toggleAbsent(form, s, uid))}
                  />
                  <span>{s.student}</span>
                </label>
              );
            })}
            {manualRows.map((s) => (
              <label key={s.id} className="roster-student is-selected">
                <input
                  type="checkbox"
                  checked
                  aria-label={s.student}
                  onChange={() =>
                    onChange(
                      editAbsenceClass(
                        {
                          ...form,
                          students: form.students.filter((r) => r.id !== s.id),
                        },
                        current.className,
                        {},
                      ),
                    )
                  }
                />
                <span>{s.student}</span>
              </label>
            ))}
          </div>
          <details className="absence-adjustments" key={current.className}>
            <summary>
              {t(
                "تعديل المقيدين أو إضافة اسم",
                "Edit enrollment or add a name",
              )}
            </summary>
            <Field
              lang={lang}
              field={{ ar: "عدد المقيدين", en: "Enrollment", kind: "number" }}
              value={
                form.classes.find((c) => c.className === current.className)
                  .total
              }
              onChange={(total) =>
                onChange(editAbsenceClass(form, current.className, { total }))
              }
            />
            <Field
              lang={lang}
              field={{
                ar: "اسم غير موجود في القائمة",
                en: "Missing student name",
              }}
              value={manual}
              onChange={setManual}
            />
            <button
              className="button"
              disabled={
                !manual.trim() || duplicate || form.students.length >= 3000
              }
              onClick={() => {
                onChange(
                  editAbsenceClass(
                    {
                      ...form,
                      students: [
                        ...form.students,
                        {
                          id: uid(),
                          studentId: "",
                          student: manual.trim(),
                          className: current.className,
                        },
                      ],
                    },
                    current.className,
                    {},
                  ),
                );
                setManual("");
              }}
            >
              {t("إضافة للغائبين", "Add to absent students")}
            </button>
          </details>
          <div className="absence-counts">
            <span>
              {t("المقيدون", "Enrolled")}
              <strong>
                {current.total === null ? "…" : arDigits(current.total)}
              </strong>
            </span>
            <span>
              {t("الحضور", "Present")}
              <strong>
                {current.present === null ? "…" : arDigits(current.present)}
              </strong>
            </span>
            <span>
              {t("الغياب", "Absent")}
              <strong>{arDigits(current.absent)}</strong>
            </span>
          </div>
          {!current.valid && (
            <p className="alert" role="alert">
              {t(
                "تحقق من عدد المقيدين؛ يجب ألا يقل عن عدد الغائبين.",
                "Enrollment cannot be less than the absent count.",
              )}
            </p>
          )}
          <button
            className="button primary absence-confirm"
            disabled={!current.valid}
            onClick={() => {
              const classes = form.classes.map((c) =>
                c.className === current.className
                  ? { ...c, confirmed: "yes" }
                  : c,
              );
              const index = classes.findIndex(
                (c) => c.className === current.className,
              );
              const next = [
                ...classes.slice(index + 1),
                ...classes.slice(0, index),
              ].find((c) => c.confirmed !== "yes");
              onChange({
                ...form,
                classes,
                className: next?.className || current.className,
              });
              setManual("");
              top.current?.scrollIntoView({ block: "start" });
            }}
          >
            {t("تأكيد الشعبة والمتابعة", "Confirm class and continue")}
          </button>
          {summary.ready && (
            <div className="absence-complete" role="status">
              <strong>{t("اكتملت جميع الشعب", "All classes confirmed")}</strong>
              <span>
                {t(
                  `إجمالي الصف: ${arDigits(summary.total)} مقيدًا · ${arDigits(summary.present)} حاضرًا · ${arDigits(summary.absent)} غائبًا`,
                  `Grade total: ${summary.total} enrolled · ${summary.present} present · ${summary.absent} absent`,
                )}
              </span>
            </div>
          )}
        </section>
      )}
    </>
  );
}
