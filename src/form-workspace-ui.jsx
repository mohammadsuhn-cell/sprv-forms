import React from "react";
import { titles, dateLabel } from "./model.js";
import { caseStudentNames } from "./case-students.js";
import { dailyFormForDate, formState, isDailyForm } from "./form-workspace.js";

export function statusText(state, t) {
  return t(
    ...{
      draft: ["مسودة محفوظة على هذا الجهاز", "Draft saved on this device"],
      edited: [
        "تعديلات محفوظة كمسودة — لم تُرسل بعد",
        "Changes saved as a draft — not yet submitted",
      ],
      local: ["محفوظ على هذا الجهاز", "Saved on this device"],
      pending: ["محفوظ — بانتظار الإرسال", "Saved — awaiting delivery"],
      received: [
        "تم الاستلام لدى الإشراف العام",
        "Received by general supervision",
      ],
      blocked: [
        "محفوظ — الإرسال يحتاج مراجعة",
        "Saved — delivery needs review",
      ],
      withdrawn: ["تقرير مسحوب", "Withdrawn report"],
    }[state],
  );
}

export function saveText(state, connected, t) {
  if (state === "edited")
    return connected
      ? t("حفظ وإرسال التعديل", "Save & send changes")
      : t("حفظ التعديل", "Save changes");
  return connected
    ? t("حفظ وإرسال", "Save & send")
    : t("حفظ النموذج", "Save form");
}

export function FormLaunchers({
  store,
  profile,
  date,
  excluded,
  t,
  onOpen,
  onStudents,
}) {
  return (
    <div className="form-cards">
      <button className="form-card" onClick={onStudents}>
        <div>
          <h2>{t("ملفات الطلبة", "Student files")}</h2>
        </div>
      </button>
      {[
        ["case", "تسجيل حالة جديدة", "Record a new case"],
        ["daily", "الموجز اليومي", "Daily brief"],
        ["absence", "إحصائية الغياب اليومي", "Daily absence sheet"],
        ["late", "قائمة تأخر جديدة", "New late-student list"],
        ["staffing", "سجل معلمين جديد", "New staffing log"],
      ].map(([kind, ar, en]) => {
        const existing = dailyFormForDate(store, kind, profile, date, excluded);
        const state = existing && formState(store, existing);
        return (
          <button key={kind} className="form-card" onClick={() => onOpen(kind)}>
            <div>
              <h2>{t(ar, en)}</h2>
              <span>
                {isDailyForm(kind)
                  ? existing
                    ? existing.date !== date
                      ? t(
                          `استكمال تعديل بتاريخ ${dateLabel(existing.date)}`,
                          `Continue correction dated ${existing.date}`,
                        )
                      : ["draft", "edited"].includes(state)
                        ? t("استكمال تقرير اليوم", "Continue today's report")
                        : t(
                            "عرض وتعديل تقرير اليوم",
                            "View / edit today's report",
                          )
                    : t("بدء تقرير اليوم", "Start today's report")
                  : t("نموذج جديد بتاريخ اليوم", "Start a new form for today")}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

export function DraftList({
  drafts,
  saved,
  t,
  en,
  onOpen,
  onDiscard,
  onMore,
  limit = Infinity,
}) {
  if (!drafts.length) return null;
  return (
    <section className="panel draft-list">
      <div className="section-heading">
        <h2>{t("مسودات لم تُرسل", "Unsubmitted drafts")}</h2>
        <span className="count">{drafts.length}</span>
      </div>
      <p className="hint">
        {t(
          "يمكنك استكمالها لاحقًا. بدء نموذج جديد لا يحذفها.",
          "You can continue these later. Starting a new form keeps them here.",
        )}
      </p>
      {drafts.slice(0, limit).map((form) => (
        <div className="draft-row" key={form.id}>
          <button className="draft-open" onClick={() => onOpen(form)}>
            <strong>{titles[form.kind][en ? 1 : 0]}</strong>
            <span>
              {dateLabel(form.date)} ·{" "}
              {form.grade || form.className || form.supervisor}
            </span>
            {(form.kind === "case" ? caseStudentNames(form) : "") && (
              <span>{caseStudentNames(form)}</span>
            )}
            <span className="draft-resume">
              {saved.some((s) => s.id === form.id)
                ? t("استكمال تعديل التقرير", "Continue editing report")
                : t("استكمال المسودة", "Continue draft")}
            </span>
          </button>
          <button
            className="text-control danger"
            onClick={() => onDiscard(form)}
            aria-label={t(
              `حذف مسودة ${titles[form.kind][0]} ${form.date}`,
              `Discard ${titles[form.kind][1]} draft ${form.date}`,
            )}
          >
            {t("حذف المسودة", "Discard draft")}
          </button>
        </div>
      ))}
      {drafts.length > limit && (
        <button className="button" onClick={onMore}>
          {t("عرض كل المسودات", "View all drafts")}
        </button>
      )}
    </section>
  );
}
