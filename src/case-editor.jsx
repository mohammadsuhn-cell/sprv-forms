import React from "react";
import { fields, caseSections, uid } from "./model.js";
import {
  caseParticipants,
  withCaseParticipants,
  maxCaseStudents,
} from "./case-students.js";
import { StudentPicker } from "./roster-ui.jsx";
import {
  incidentDetails,
  caseDescription,
  hasManualDescription,
  prepareCaseDraft,
  updateCaseChoice,
  actionStatusLabel,
  noAction,
} from "./case-options.js";

export function CaseEditor({
  form,
  roster,
  grade,
  lang,
  onChange,
  onOpenHistory,
  Field,
}) {
  const t = (ar, en) => (lang === "en" ? en : ar);
  const allFields = caseSections.flatMap((s) => s.fields);
  const field = (key) => allFields.find((f) => f.key === key) || fields[key];
  const choice = (key, custom) => (
    <Field
      key={key}
      lang={lang}
      field={custom || field(key)}
      value={form[key] || ""}
      onChange={(value) => onChange(updateCaseChoice(form, key, value))}
    />
  );
  const students = caseParticipants(form);
  const setStudents = (rows) =>
    onChange(prepareCaseDraft(withCaseParticipants(form, rows)));
  const updateStudent = (index, value) =>
    setStudents(students.map((s, i) => (i === index ? value : s)));
  const description = caseDescription(form);
  const manual = hasManualDescription(form);
  return (
    <>
      <section className="panel">
        <div className="fields">
          <Field
            lang={lang}
            field={fields.date}
            value={form.date}
            onChange={(date) => onChange({ ...form, date })}
          />
          <Field
            lang={lang}
            field={{
              ...field("reportingTeacher"),
              ar: "المعلم المبلّغ (اختياري)",
              en: "Reporting teacher (optional)",
            }}
            value={form.reportingTeacher || ""}
            onChange={(reportingTeacher) =>
              onChange({ ...form, reportingTeacher })
            }
          />
        </div>
        <h2>{t("الطلبة المعنيون", "Students involved")}</h2>
        <p className="hint">
          {t(
            "أضف جميع الطلبة المشاركين في الواقعة نفسها. تُحفظ كحالة واحدة.",
            "Add everyone involved in the same incident. This is saved as one case.",
          )}
        </p>
        {students.map((student, index) => (
          <fieldset className="case-student" key={student.id}>
            <legend>
              {t("الطالب", "Student")} {index + 1}
            </legend>
            <div className="fields">
              {roster ? (
                <StudentPicker
                  form={student}
                  roster={roster}
                  grade={grade}
                  lang={lang}
                  onChange={(value) => updateStudent(index, value)}
                />
              ) : (
                [fields.student, fields.className].map((f) => (
                  <Field
                    key={f.key}
                    lang={lang}
                    field={f}
                    value={student[f.key]}
                    onChange={(value) =>
                      updateStudent(index, {
                        ...student,
                        [f.key]: value,
                        ...(f.key === "student" ? { studentId: "" } : {}),
                      })
                    }
                  />
                ))
              )}
            </div>
            {onOpenHistory && student.studentId && (
              <button
                type="button"
                className="button"
                onClick={() => onOpenHistory(student.studentId)}
              >
                {t("سجل الطالب", "Student history")}
              </button>
            )}
            {students.length > 1 && (
              <button
                type="button"
                className="button"
                onClick={() =>
                  setStudents(students.filter((_, i) => i !== index))
                }
              >
                {t("إزالة الطالب", "Remove student")}
              </button>
            )}
          </fieldset>
        ))}
        <button
          type="button"
          className="button"
          disabled={students.length >= maxCaseStudents}
          onClick={() =>
            setStudents([
              ...students,
              {
                id: uid(),
                student: "",
                studentId: "",
                className: students.at(-1)?.className || "",
                actionMode: "shared",
              },
            ])
          }
        >
          {t("إضافة طالب آخر", "Add another student")}
        </button>
      </section>
      <section className="panel">
        <h2>{t("الواقعة", "Incident")}</h2>
        <div className="fields">
          {choice("type")}
          {!!incidentDetails[form.type]?.length &&
            choice("incidentDetail", {
              ...field("incidentDetail"),
              options: incidentDetails[form.type],
            })}
        </div>
        <div className="case-facts">
          {["location", "period", "source", "recurrence"].map((key) =>
            choice(key),
          )}
        </div>
        {manual && (
          <details className="legacy-description">
            <summary>
              {t("الوصف المحفوظ سابقًا", "Previously written description")}
            </summary>
            <Field
              lang={lang}
              field={{
                ...fields.description,
                ar: "الوصف المحفوظ",
                en: "Saved description",
              }}
              value={form.description}
              onChange={(description) =>
                onChange(
                  prepareCaseDraft({
                    ...form,
                    description,
                    descriptionGenerated: "",
                  }),
                )
              }
            />
          </details>
        )}
        <Field
          lang={lang}
          field={{
            key: "incidentNotes",
            ar: "ملاحظات إضافية (اختياري)",
            en: "Additional notes (optional)",
            kind: "textarea",
          }}
          value={form.incidentNotes || ""}
          onChange={(value) =>
            onChange(updateCaseChoice(form, "incidentNotes", value))
          }
        />
        {description && (
          <section
            className="description-preview"
            aria-label={t("وصف الواقعة", "Incident description")}
          >
            <h3>{t("وصف الواقعة", "Incident description")}</h3>
            <p dir="rtl">{description}</p>
          </section>
        )}
      </section>
      <section className="panel">
        <h2>{t("الإجراء والمتابعة", "Action & follow-up")}</h2>
        {students.length > 1 && (
          <p className="hint">
            {t(
              "الإجراء مشترك لجميع الطلبة، ويمكن تخصيصه لكل طالب أدناه. موعد المتابعة مشترك للحالة.",
              "This action applies to all students. You can choose a different action for each student below. The follow-up date applies to the whole case.",
            )}
          </p>
        )}
        <div className="fields">
          <Field
            lang={lang}
            field={fields.action}
            value={form.action}
            onChange={(action) =>
              onChange({
                ...form,
                action,
                actionState:
                  !action || noAction(action)
                    ? ""
                    : form.actionState || "تم التنفيذ",
              })
            }
          />
          {!!form.action && !noAction(form.action) && (
            <Field
              lang={lang}
              field={field("actionState")}
              value={actionStatusLabel(form.actionState)}
              onChange={(actionState) => onChange({ ...form, actionState })}
            />
          )}
          <Field
            lang={lang}
            field={{
              ...fields.due,
              ar: "موعد المتابعة (اختياري)",
              en: "Follow-up date (optional)",
            }}
            value={form.due}
            onChange={(due) => onChange({ ...form, due })}
          />
        </div>
        {(students.length > 1 ||
          students.some((s) => s.actionMode === "individual")) &&
          students.map((student, index) => (
            <fieldset className="case-student" key={student.id}>
              <legend>
                {student.student || `${t("الطالب", "Student")} ${index + 1}`}
              </legend>
              <label className="case-individual-action">
                <input
                  type="checkbox"
                  checked={student.actionMode === "individual"}
                  onChange={(event) =>
                    updateStudent(index, {
                      ...student,
                      actionMode: event.target.checked
                        ? "individual"
                        : "shared",
                    })
                  }
                />
                {t(
                  "إجراء مختلف لهذا الطالب",
                  "Different action for this student",
                )}
              </label>
              {student.actionMode === "individual" && (
                <div className="fields">
                  <Field
                    lang={lang}
                    field={{
                      ...fields.action,
                      ar: "الإجراء الخاص",
                      en: "Individual action",
                    }}
                    value={student.action || ""}
                    onChange={(action) =>
                      updateStudent(index, {
                        ...student,
                        action,
                        actionState:
                          !action || noAction(action)
                            ? ""
                            : student.actionState || "تم التنفيذ",
                      })
                    }
                  />
                  {!!student.action && !noAction(student.action) && (
                    <Field
                      lang={lang}
                      field={field("actionState")}
                      value={actionStatusLabel(student.actionState || "")}
                      onChange={(actionState) =>
                        updateStudent(index, { ...student, actionState })
                      }
                    />
                  )}
                </div>
              )}
            </fieldset>
          ))}
      </section>
    </>
  );
}
