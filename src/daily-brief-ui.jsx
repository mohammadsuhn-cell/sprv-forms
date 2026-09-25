import React from "react";
import { grades, arDigits } from "./model.js";
import {
  attendanceTotals,
  buildDailySummary,
  dailyValues,
  refreshDailyBrief,
} from "./daily-brief.js";

export function DailyBrief({ form, saved, roster, lang, onChange, Field }) {
  const t = (ar, en) => (lang === "en" ? en : ar);
  const count = (value) =>
    value === null
      ? t("لم يُسجّل", "Not recorded")
      : lang === "en"
        ? String(value)
        : arDigits(value);
  const values = dailyValues(form),
    totals = attendanceTotals(values.attendance);
  const changed =
    JSON.stringify(form.summary) !==
    JSON.stringify(buildDailySummary(form, saved, roster));
  const scope = (key, value) =>
    onChange(
      refreshDailyBrief(
        { ...form, [key]: value, lateZero: "", staffZero: "" },
        saved,
        roster,
      ),
    );
  return (
    <>
      <section className="panel">
        <div className="fields">
          <Field
            lang={lang}
            field={{ ar: "التاريخ", en: "Date", kind: "date" }}
            value={form.date}
            onChange={(value) => scope("date", value)}
          />
          <Field
            lang={lang}
            field={{ ar: "الصف", en: "Grade", kind: "select", options: grades }}
            value={form.grade}
            onChange={(value) => scope("grade", value)}
          />
        </div>
        <div className="brief-update">
          <span className="small-status" role="status">
            {changed
              ? t("توجد بيانات أحدث", "Updated records available")
              : t("من السجلات المحفوظة", "From saved records")}
          </span>
          <button
            className="button"
            disabled={!form.grade || !form.supervisor.trim()}
            onClick={() => onChange(refreshDailyBrief(form, saved, roster))}
          >
            {t("تحديث من السجلات", "Update from records")}
          </button>
        </div>
      </section>
      <section className="panel">
        <h2>{t("إحصائية الطلبة", "Student attendance")}</h2>
        <table className="brief-attendance">
          <thead>
            <tr>
              {[
                ["الشعبة", "Class"],
                ["المقيدون", "Enrolled"],
                ["الحاضرون", "Present"],
                ["الغائبون", "Absent"],
              ].map(([ar, en]) => (
                <th key={en} scope="col">
                  {t(ar, en)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {values.attendance.map((row) => (
              <tr key={row.className}>
                <th scope="row">{row.className}</th>
                {["enrolled", "present", "absent"].map((key) => (
                  <td key={key}>{count(row[key])}</td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">{t("الإجمالي", "Total")}</th>
              {["enrolled", "present", "absent"].map((key) => (
                <td key={key}>{count(totals[key])}</td>
              ))}
            </tr>
          </tfoot>
        </table>
      </section>
      <section className="panel brief-counts">
        <div>
          <span>{t("الطلبة المتأخرون", "Late students")}</span>
          <strong>{count(values.late)}</strong>
        </div>
        {values.late === null && (
          <button
            className="text-button"
            onClick={() => onChange({ ...form, lateZero: "yes" })}
          >
            {t("تأكيد عدم وجود متأخرين", "Confirm no late students")}
          </button>
        )}
        {form.lateZero === "yes" && form.summary?.late === null && (
          <button
            className="text-button"
            onClick={() => onChange({ ...form, lateZero: "" })}
          >
            {t("إلغاء تأكيد عدم التأخر", "Clear no-lateness confirmation")}
          </button>
        )}
        <div>
          <span>{t("الحالات المسجلة", "Recorded cases")}</span>
          <strong>{count(values.cases)}</strong>
        </div>
      </section>
      <section className="panel">
        <h2>{t("المعلمون والاحتياط", "Teachers & cover")}</h2>
        <dl className="brief-staff">
          {[
            ["absent", "المعلمون الغائبون", "Absent teachers"],
            ["covered", "حصص مغطاة", "Covered periods"],
            ["pending", "قيد التغطية", "Pending cover"],
            ["uncovered", "غير مغطاة", "Uncovered periods"],
            ...(values.staffing?.late
              ? [["late", "المعلمون المتأخرون", "Late teachers"]]
              : []),
            ...(values.staffing?.leave
              ? [["leave", "استئذان المعلمين", "Teacher leave"]]
              : []),
          ].map(([key, ar, en]) => (
            <div key={key}>
              <dt>{t(ar, en)}</dt>
              <dd>{count(values.staffing?.[key] ?? null)}</dd>
            </div>
          ))}
        </dl>
        {values.staffing === null && (
          <button
            className="text-button"
            onClick={() => onChange({ ...form, staffZero: "yes" })}
          >
            {t(
              "تأكيد عدم وجود غياب أو احتياط",
              "Confirm no staff absence or cover",
            )}
          </button>
        )}
        {form.staffZero === "yes" && !form.summary?.staffing && (
          <button
            className="text-button"
            onClick={() => onChange({ ...form, staffZero: "" })}
          >
            {t("إلغاء تأكيد المعلمين والاحتياط", "Clear staff confirmation")}
          </button>
        )}
      </section>
      <section className="panel">
        <Field
          lang={lang}
          field={{
            ar: "الأعطال والإصلاحات (اختياري)",
            en: "Faults & repairs (optional)",
            kind: "textarea",
          }}
          value={form.repairs}
          onChange={(repairs) => onChange({ ...form, repairs })}
        />
      </section>
    </>
  );
}
