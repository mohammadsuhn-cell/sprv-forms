export const titles = {
  cases: ["سجل الحالات والمتابعة", "Case register"],
  case: ["تفاصيل الحالة", "Case details"],
  staffing: ["غياب المعلمين والبدلاء", "Staff absence & cover"],
  daily: ["التقرير اليومي للإشراف", "Daily report"],
};
export const types = [
  "التأخر عن الحصة",
  "عدم حضور الحصة",
  "الخروج من الفصل",
  "عدم العودة بعد الاستئذان",
  "الإزعاج أثناء الحصة",
  "مقاطعة الشرح",
  "عدم الالتزام بالتعليمات",
  "مشادة لفظية",
  "شجار",
  "ألفاظ غير لائقة",
  "دفع طالب",
  "الجري في الممرات",
  "إتلاف ممتلكات",
  "الكتابة على الأثاث",
  "رمي المخلفات",
  "واقعة أخرى",
];
export const actions = [
  "لم يُتخذ إجراء بعد",
  "تنبيه شفهي",
  "إنذار أول",
  "إنذار ثانٍ",
  "التواصل مع ولي الأمر",
  "إعداد استدعاء ولي الأمر",
  "مقابلة ولي الأمر",
  "إحالة إلى الأخصائي الاجتماعي",
  "رفع الموضوع إلى الإدارة",
  "متابعة انتظام الطالب",
  "توثيق تحسن",
  "إجراء آخر",
];
export const statuses = [
  "قيد المتابعة",
  "بانتظار مقابلة ولي الأمر",
  "بانتظار إفادة الأخصائي",
  "بانتظار قرار الإدارة",
  "تمت المتابعة",
  "مغلقة",
];
export const locations = [
  "الفصل",
  "الممر",
  "الساحة",
  "المقصف",
  "المختبر",
  "المكتبة",
  "الصالة الرياضية",
  "مكان آخر",
];
export const periods = [
  "الأولى",
  "الثانية",
  "الثالثة",
  "الرابعة",
  "الخامسة",
  "السادسة",
  "السابعة",
  "الثامنة",
];
export const cover = [
  "بانتظار تحديد البديل",
  "تم إبلاغ البديل",
  "حضر البديل",
  "لم يحضر البديل",
  "أُعيد إسناد الحصة",
];
export const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export const uid = () => crypto.randomUUID();
const f = (key, ar, en, kind = "text", options) => ({
  key,
  ar,
  en,
  kind,
  options,
});
export const fields = {
  date: f("date", "التاريخ", "Date", "date"),
  student: f("student", "اسم الطالب", "Student name"),
  className: f("className", "الشعبة", "Class"),
  type: f("type", "نوع الواقعة", "Incident type", "select", types),
  description: f("description", "وصف الواقعة", "Description", "textarea"),
  action: f("action", "الإجراء المتخذ", "Action", "select", actions),
  status: f("status", "حالة المتابعة", "Follow-up status", "select", statuses),
  due: f("due", "موعد المتابعة", "Follow-up date", "date"),
};
export const groups = {
  cases: [
    {
      key: "rows",
      ar: "الحالات",
      en: "Entries",
      fields: Object.values(fields),
    },
  ],
  case: [],
  staffing: [
    {
      key: "absences",
      ar: "غياب المعلمين وتأخرهم",
      en: "Absences & late arrivals",
      fields: [
        f("teacher", "اسم المعلم", "Teacher"),
        f("reason", "نوع الحالة", "Reason", "select", [
          "غياب",
          "تأخر",
          "استئذان",
        ]),
        f("notifiedDate", "تاريخ العلم", "Notification date", "date"),
        f("notifiedTime", "وقت العلم", "Notification time", "time"),
        f("arrival", "وقت الحضور الفعلي", "Actual arrival", "time"),
      ],
    },
    {
      key: "covers",
      ar: "متابعة البدلاء",
      en: "Cover periods",
      fields: [
        f("period", "الحصة", "Period", "select", periods),
        fields.className,
        f("teacher", "المعلم الأصلي", "Original teacher"),
        f("substitute", "البديل المبلّغ", "Substitute"),
        f("notifiedTime", "وقت التبليغ", "Notification time", "time"),
        f("coverage", "حالة التغطية", "Coverage", "select", cover),
      ],
    },
  ],
  daily: [
    {
      key: "attendance",
      ar: "الحضور والحالات",
      en: "Attendance & cases",
      fields: [
        fields.className,
        f("present", "الحاضرون", "Present", "number"),
        f("absent", "الغائبون", "Absent", "number"),
        f("cases", "الحالات المسجلة", "Cases", "number"),
      ],
    },
    {
      key: "covers",
      ar: "غياب المعلمين والبدلاء",
      en: "Staff absence & cover",
      fields: [
        f("teacher", "المعلم الغائب", "Absent teacher"),
        f("period", "الحصة", "Period", "select", periods),
        fields.className,
        f("substitute", "البديل", "Substitute"),
        f("coverage", "حالة التغطية", "Coverage", "select", cover),
      ],
    },
    {
      key: "facilities",
      ar: "الأعطال والاحتياجات",
      en: "Facilities & needs",
      fields: [
        f("location", "الموقع", "Location", "select", locations),
        f("need", "نوع الاحتياج", "Need", "select", [
          "تكييف",
          "إنارة وكهرباء",
          "أثاث",
          "نظافة",
          "أجهزة ووسائل",
          "مياه ومرافق",
          "احتياج آخر",
        ]),
        f("details", "التفاصيل والمتابعة", "Details & follow-up", "textarea"),
      ],
    },
  ],
};
export const caseSections = [
  {
    ar: "بيانات الحالة",
    en: "Case information",
    fields: [
      fields.student,
      fields.className,
      f("reference", "رقم الحالة", "Reference"),
      f("location", "مكان الواقعة", "Location", "select", locations),
      fields.type,
      f("period", "الحصة", "Period", "select", periods),
      f("source", "مصدر المعلومات", "Source", "select", [
        "مشاهدة مباشرة",
        "إفادة منقولة",
        "تقرير مكتوب",
        "مصدر آخر",
      ]),
      fields.description,
    ],
  },
  {
    ar: "الإجراء",
    en: "Action",
    fields: [
      fields.action,
      f("actionState", "حالة الإجراء", "Action status", "select", [
        "تم التنفيذ",
        "مخطط للتنفيذ",
      ]),
      f("actionDate", "تاريخ الإجراء", "Action date", "date"),
      f("actionDetails", "تفاصيل الإجراء", "Action details", "textarea"),
    ],
  },
  {
    ar: "المتابعة والنتيجة",
    en: "Follow-up & outcome",
    fields: [
      fields.status,
      fields.due,
      f("time", "وقت المتابعة", "Time", "time"),
      f("owner", "المسؤول عن المتابعة", "Owner"),
      f("outcome", "المتابعة والنتيجة", "Outcome", "textarea"),
      f("attachments", "بيان المرفقات", "Attachment list", "textarea"),
    ],
  },
];
export function newRow(group) {
  return Object.fromEntries([
    ["id", uid()],
    ...group.fields.map((f) => [f.key, ""]),
  ]);
}
export function newForm(kind, profile = {}) {
  const form = {
    id: uid(),
    kind,
    date: today(),
    school: profile.school || "",
    year: profile.year || "",
    supervisor: profile.supervisor || "",
    notes: "",
    createdAt: new Date().toISOString(),
  };
  if (kind === "cases") {
    form.from = today();
    form.to = today();
  }
  if (kind === "case")
    for (const s of caseSections) for (const f of s.fields) form[f.key] = "";
  for (const g of groups[kind]) form[g.key] = [newRow(g)];
  return form;
}
export const isRowFilled = (row) =>
  Object.entries(row).some(
    ([k, v]) => k !== "id" && String(v ?? "").trim() !== "",
  );
export const arDigits = (s) =>
  String(s ?? "").replace(/\d/g, (c) => "٠١٢٣٤٥٦٧٨٩"[c]);
export const dateLabel = (s) =>
  s ? arDigits(s.split("-").reverse().join("/")) : "";
export function report(form) {
  const sections = [],
    tables = [];
  const meta = [["التاريخ", dateLabel(form.date)]];
  if (form.kind === "cases") {
    meta.splice(
      0,
      1,
      ["من تاريخ", dateLabel(form.from)],
      ["إلى تاريخ", dateLabel(form.to)],
    );
  }
  if (form.kind === "case") {
    for (const section of caseSections) {
      const lines = section.fields
        .filter((f) => String(form[f.key] || "").trim())
        .map((f) => [
          f.ar,
          f.kind === "date" ? dateLabel(form[f.key]) : form[f.key],
        ]);
      if (lines.length) sections.push({ title: section.ar, lines });
    }
  } else
    for (const group of groups[form.kind]) {
      const rows = (form[group.key] || [])
        .filter(isRowFilled)
        .map((row) =>
          group.fields.map((f) =>
            f.kind === "date"
              ? dateLabel(row[f.key])
              : f.kind === "number"
                ? arDigits(row[f.key])
                : row[f.key] || "",
          ),
        );
      if (rows.length)
        tables.push({
          title: group.ar,
          columns: group.fields.map((f) => f.ar),
          rows,
        });
    }
  if (form.notes?.trim())
    sections.push({ title: "ملاحظات المشرف", lines: [["", form.notes]] });
  return {
    title: titles[form.kind][0],
    school: form.school,
    year: form.year,
    supervisor: form.supervisor,
    meta,
    tables,
    sections,
    landscape: ["cases", "staffing"].includes(form.kind),
  };
}
export function validateForm(v) {
  const errors = [];
  if (!v.school?.trim())
    errors.push(["أدخل اسم المدرسة.", "Enter the school name."]);
  if (!v.supervisor?.trim())
    errors.push(["أدخل اسم المشرف.", "Enter the supervisor name."]);
  if (!v.date) errors.push(["حدد التاريخ.", "Choose a date."]);
  if (v.kind === "case" && !v.student?.trim())
    errors.push(["أدخل اسم الطالب.", "Enter the student name."]);
  if (v.kind === "cases" && v.from && v.to && v.from > v.to)
    errors.push([
      "تاريخ البداية يجب أن يسبق تاريخ النهاية.",
      "Start date must precede end date.",
    ]);
  if (
    v.kind !== "case" &&
    !groups[v.kind].some((g) => (v[g.key] || []).some(isRowFilled)) &&
    !v.notes?.trim()
  )
    errors.push(["أضف بيانات النموذج.", "Enter form details."]);
  for (const g of groups[v.kind])
    for (const row of v[g.key] || [])
      for (const f of g.fields)
        if (
          f.kind === "number" &&
          row[f.key] !== "" &&
          (!Number.isInteger(Number(row[f.key])) || Number(row[f.key]) < 0)
        )
          errors.push([
            "الأعداد يجب أن تكون أعدادًا صحيحة غير سالبة.",
            "Counts must be non-negative whole numbers.",
          ]);
  return errors;
}
export const storageKey = "sprv-phone-forms-v1";
export const emptyStore = () => ({
  version: 1,
  profile: { school: "", year: "", supervisor: "" },
  drafts: {},
  saved: [],
  lang: "ar",
});
export function validateStore(value) {
  if (
    !value ||
    value.version !== 1 ||
    !value.profile ||
    !Array.isArray(value.saved) ||
    !value.drafts ||
    typeof value.drafts !== "object"
  )
    throw Error("Invalid backup");
  for (const k of ["school", "year", "supervisor"])
    if (typeof value.profile[k] !== "string") throw Error("Invalid profile");
  for (const [key, draft] of Object.entries(value.drafts))
    if (!titles[key] || draft.kind !== key) throw Error("Invalid draft");
  const forms = [...value.saved, ...Object.values(value.drafts)];
  if (forms.length > 2000) throw Error("Too many forms");
  for (const v of forms) {
    if (
      !v ||
      !titles[v.kind] ||
      typeof v.id !== "string" ||
      !v.id ||
      typeof v.date !== "string"
    )
      throw Error("Invalid form");
    for (const key of ["school", "supervisor", "year"])
      if (typeof v[key] !== "string") throw Error("Invalid form");
    for (const g of groups[v.kind]) {
      if (!Array.isArray(v[g.key]) || v[g.key].length > 500)
        throw Error("Invalid rows");
      if (new Set(v[g.key].map((r) => r.id)).size !== v[g.key].length)
        throw Error("Duplicate rows");
      for (const r of v[g.key]) {
        if (!r || typeof r.id !== "string") throw Error("Invalid row");
        for (const f of g.fields)
          if (typeof r[f.key] !== "string" && typeof r[f.key] !== "number")
            throw Error("Invalid field");
      }
    }
    for (const [key, val] of Object.entries(v))
      if (!groups[v.kind].some((g) => g.key === key) && typeof val !== "string")
        throw Error("Invalid value");
  }
  if (new Set(value.saved.map((v) => v.id)).size !== value.saved.length)
    throw Error("Duplicate records");
  return { ...value, lang: value.lang === "en" ? "en" : "ar" };
}

// Aggregate saved individual cases without changing their IDs or historical school details.
export function caseRegister(saved, profile = {}) {
  const entries = saved.filter((s) => s.kind === "case");
  const v = newForm("cases", profile);
  v.simple = "yes";
  v.rows = entries.map((s) => ({
    ...newRow(groups.cases[0]),
    date: s.date,
    student: s.student || "",
    className: s.className || "",
    type: s.type || "",
    description: s.description || "",
    action:
      (s.action || "") +
      (s.action && s.actionState === "مخطط للتنفيذ" ? " (مخطط للتنفيذ)" : ""),
    status: s.status || "",
    due: s.due || "",
  }));
  const dates = entries
    .map((s) => s.date)
    .filter(Boolean)
    .sort();
  v.from = dates[0] || today();
  v.to = dates.at(-1) || today();
  return v;
}
