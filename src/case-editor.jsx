import React from "react";
import { fields, caseSections } from "./model.js";
import { StudentPicker } from "./roster-ui.jsx";
import {
  incidentDetails,
  composeCaseDescription,
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
  const generated = composeCaseDescription(form);
  const manual =
    !!form.description?.trim() &&
    form.description !== form.descriptionGenerated;
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
        <Field
          lang={lang}
          field={fields.description}
          value={form.description}
          onChange={(description) => onChange({ ...form, description })}
        />
        {generated && form.description !== generated && (
          <button
            className="button description-refresh"
            onClick={() => {
              if (
                manual &&
                !confirm(
                  t(
                    "استبدال الوصف المكتوب بصياغة من الاختيارات الحالية؟",
                    "Replace the written description with wording from the current selections?",
                  ),
                )
              )
                return;
              onChange({
                ...form,
                description: generated,
                descriptionGenerated: generated,
              });
            }}
          >
            {t(
              "صياغة الوصف من الاختيارات",
              "Build description from selections",
            )}
          </button>
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
