import React from "react";
import { fields, caseSections } from "./model.js";
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

export function CaseEditor({ form, roster, grade, lang, onChange, Field }) {
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
  const description = caseDescription(form);
  const manual = hasManualDescription(form);
  return (
    <>
      <section className="panel">
        <div className="fields">
          {roster && (
            <StudentPicker
              form={form}
              roster={roster}
              grade={grade}
              lang={lang}
              onChange={onChange}
            />
          )}
          {[
            fields.date,
            ...(!roster ? [fields.student, fields.className] : []),
          ].map((f) => (
            <Field
              key={f.key}
              lang={lang}
              field={f}
              value={form[f.key]}
              onChange={(value) => onChange({ ...form, [f.key]: value })}
            />
          ))}
        </div>
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
      </section>
    </>
  );
}
