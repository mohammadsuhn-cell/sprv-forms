import {
  incidentTypes,
  incidentGroups,
  recurrenceOptions,
  actionStatusLabel,
  actionText,
} from "./case-options.js";
import {
  initializeAbsence,
  validateAbsence,
  absenceReport,
} from "./absence.js";
import { validateRoster, rosterGrades, rosterClasses } from "./roster.js";
export const letterhead = Object.freeze({
  ministry: "وزارة التربية",
  district: "منطقة الفروانية التعليمية",
});
export const schoolIdentity = Object.freeze({
  school: "مدرسة عمار بن ياسر المتوسطة للبنين",
  year: "٢٠٢٦/٢٠٢٧",
});
export const withSchoolIdentity = (value) => ({ ...value, ...schoolIdentity });
export const titles = {
  cases: ["سجل الحالات والمتابعة", "Case register"],
  case: ["تفاصيل الحالة", "Case details"],
  staffing: ["سجل المعلمين والبدلاء", "Teachers & substitutes"],
  daily: ["الموجز اليومي", "Daily brief"],
  late: ["الطلبة المتأخرون", "Late students"],
  absence: ["إحصائية الغياب اليومي", "Daily absence sheet"],
};
export const grades = [
  "الصف السادس",
  "الصف السابع",
  "الصف الثامن",
  "الصف التاسع",
];
export function classesForGrade(grade) {
  const index = grades.indexOf(grade);
  if (index < 0) return [];
  return Array.from({ length: index === 1 ? 6 : 10 }, (_, i) =>
    arDigits(`${index + 6}/${i + 1}`),
  );
}
export const types = incidentTypes;
export const actions = [
  "لم يُتخذ إجراء",
  "تنبيه شفهي",
  "إنذار أول",
  "إنذار ثانٍ",
  "تعهد خطي",
  "فصل يوم",
  "فصل يومين",
  "فصل ثلاثة أيام",
  "اتصال بولي الأمر",
  "استدعاء ولي الأمر",
  "مقابلة ولي الأمر",
  "إحالة للأخصائي",
  "إحالة للإدارة",
  "متابعة",
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
  "بوابة المدرسة",
  "دورات المياه",
  "الدرج",
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
  type: {
    ...f("type", "نوع الواقعة", "Incident type", "select", types),
    optionGroups: incidentGroups,
  },
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
  absence: [
    {
      key: "students",
      ar: "الغائبون",
      en: "Absent students",
      fields: [fields.student, fields.className],
    },
    {
      key: "classes",
      ar: "الشعب",
      en: "Classes",
      fields: [
        fields.className,
        f("total", "المقيدون", "Enrolled", "number"),
        f("confirmed", "تم التأكيد", "Confirmed"),
      ],
    },
    {
      key: "roll",
      ar: "قائمة الطلبة",
      en: "Class roll",
      fields: [fields.student, fields.className],
    },
  ],
  late: [
    {
      key: "students",
      ar: "أسماء الطلبة",
      en: "Students",
      fields: [
        fields.student,
        f("arrival", "وقت الوصول (اختياري)", "Arrival time (optional)", "time"),
        f("reason", "سبب التأخر (اختياري)", "Reason (optional)", "select", [
          "تأخر وسيلة النقل",
          "ازدحام مروري",
          "الاستيقاظ متأخرًا",
          "ظرف أسري",
          "موعد طبي",
          "لم يُذكر السبب",
          "سبب آخر",
        ]),
        f(
          "action",
          "الإجراء (اختياري)",
          "Action (optional)",
          "select",
          actions,
        ),
      ],
    },
  ],
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
      ar: "الحضور والتأخر الصباحي",
      en: "Attendance & morning lateness",
      fields: [
        fields.className,
        f("present", "الحاضرون", "Present", "number"),
        f("absent", "الغائبون", "Absent", "number"),
        f("lateCount", "المتأخرون صباحًا", "Morning late arrivals", "number"),
        f(
          "lateNames",
          "أسماء المتأخرين (اختياري)",
          "Late students (optional)",
          "textarea",
        ),
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
      f("incidentDetail", "تفصيل الواقعة", "Incident detail", "select", []),
      f(
        "recurrence",
        "تكرار الواقعة",
        "Recurrence",
        "select",
        recurrenceOptions,
      ),
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
        "لم يُنفّذ بعد",
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
export function newForm(kind, profile = {}, roster = null) {
  const form = {
    id: uid(),
    kind,
    date: today(),
    school: schoolIdentity.school,
    year: schoolIdentity.year,
    supervisor: profile.supervisor || "",
    notes: "",
    createdAt: new Date().toISOString(),
  };
  if (kind === "daily") form.decisions = "";
  if (kind === "late") {
    form.grade = grades.includes(profile.grade) ? profile.grade : "";
    form.className = "";
    if (rosterGrades(roster).includes(form.grade)) {
      form.rosterMode = "yes";
      form.className = rosterClasses(roster, form.grade)[0] || "";
    }
  }
  if (kind === "cases") {
    form.from = today();
    form.to = today();
  }
  if (kind === "case")
    for (const s of caseSections) for (const f of s.fields) form[f.key] = "";
  if (kind === "absence")
    return initializeAbsence(form, roster, profile.grade, uid);
  for (const g of groups[kind]) form[g.key] = [newRow(g)];
  if (form.rosterMode === "yes") form.students = [];
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
  form = withSchoolIdentity(form);
  if (form.kind === "absence")
    return {
      ...letterhead,
      title: titles.absence[0],
      school: form.school,
      year: form.year,
      supervisor: form.supervisor,
      landscape: true,
      layout: "absence",
      absence: absenceReport(form),
      sections: [],
      tables: [],
      meta: [],
    };
  const sections = [],
    tables = [];
  const meta = [["التاريخ", dateLabel(form.date)]];
  if (form.kind === "late")
    meta.push(
      ["الصف", form.grade],
      [
        form.rosterMode === "yes" ? "الشعب" : "الشعبة",
        form.rosterMode === "yes"
          ? [
              ...new Set(form.students.map((s) => s.className).filter(Boolean)),
            ].join("، ")
          : form.className,
      ],
      [
        "عدد المتأخرين",
        arDigits(
          form.students.filter((row) => String(row.student ?? "").trim())
            .length,
        ),
      ],
    );
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
          f.kind === "date"
            ? dateLabel(form[f.key])
            : f.key === "actionState"
              ? actionStatusLabel(form[f.key])
              : f.key === "action"
                ? actionText(form[f.key])
                : form[f.key],
        ]);
      if (lines.length) sections.push({ title: section.ar, lines });
    }
  } else
    for (const group of groups[form.kind]) {
      const filled = (form[group.key] || []).filter(isRowFilled);
      const outputFields =
        form.kind === "late" && form.rosterMode === "yes"
          ? [
              fields.student,
              fields.className,
              ...group.fields.filter((f) => f.key !== "student"),
            ]
          : group.fields;
      const displayFields = outputFields.filter(
        (f) =>
          f.key !== "lateNames" &&
          (form.kind !== "late" ||
            ["student", "className"].includes(f.key) ||
            filled.some((row) => String(row[f.key] ?? "").trim() !== "")) &&
          (!["cases", "notifiedTime"].includes(f.key) ||
            filled.some((row) => String(row[f.key] ?? "").trim() !== "")),
      );
      const rows = filled.map((row) =>
        displayFields.map((f) =>
          f.kind === "date"
            ? dateLabel(row[f.key])
            : f.kind === "number"
              ? arDigits(row[f.key])
              : f.key === "action"
                ? actionText(row[f.key])
                : row[f.key] || "",
        ),
      );
      if (rows.length)
        tables.push({
          title: group.ar,
          columns: displayFields.map((f) => f.ar),
          rows,
        });
      if (group.key === "attendance") {
        const names = filled
          .filter((row) => row.lateNames?.trim())
          .map((row) => [row.className || "", row.lateNames]);
        if (names.length)
          sections.push({ title: "أسماء المتأخرين صباحًا", lines: names });
      }
    }
  if (form.notes?.trim())
    sections.push({
      title: form.kind === "daily" ? "ملاحظات اليوم" : "ملاحظات المشرف",
      lines: [["", form.notes]],
    });
  if (form.kind === "daily" && form.decisions?.trim())
    sections.push({
      title: "الإجراءات والمتابعة",
      lines: [["", form.decisions]],
    });
  return {
    ...letterhead,
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
  if (v.kind === "absence") {
    if (!grades.includes(v.grade))
      errors.push(["اختر الصف.", "Choose a grade."]);
    return [...errors, ...validateAbsence(v, classesForGrade(v.grade))];
  }
  if (v.kind === "case" && !v.student?.trim())
    errors.push(["أدخل اسم الطالب.", "Enter the student name."]);
  if (v.kind === "late") {
    if (!grades.includes(v.grade))
      errors.push(["اختر الصف.", "Choose a grade."]);
    if (
      v.rosterMode !== "yes" &&
      !classesForGrade(v.grade).includes(v.className)
    )
      errors.push([
        "اختر الشعبة التابعة للصف.",
        "Choose a class in this grade.",
      ]);
    const rows = v.students.filter(isRowFilled);
    if (
      v.rosterMode === "yes" &&
      rows.some((row) => !classesForGrade(v.grade).includes(row.className))
    )
      errors.push([
        "حدد شعبة كل طالب متأخر.",
        "Choose a class for each late student.",
      ]);
    const ids = rows.map((row) => row.studentId).filter(Boolean);
    if (new Set(ids).size !== ids.length)
      errors.push([
        "الطالب مكرر في قائمة المتأخرين.",
        "A student is duplicated in the late list.",
      ]);
    if (!rows.length || rows.some((row) => !String(row.student ?? "").trim()))
      errors.push([
        "أدخل اسم كل طالب متأخر.",
        "Enter each late student's name.",
      ]);
  }
  if (v.kind === "cases" && v.from && v.to && v.from > v.to)
    errors.push([
      "تاريخ البداية يجب أن يسبق تاريخ النهاية.",
      "Start date must precede end date.",
    ]);
  if (
    v.kind !== "case" &&
    !groups[v.kind].some((g) => (v[g.key] || []).some(isRowFilled)) &&
    !v.notes?.trim() &&
    !v.decisions?.trim()
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
  profile: { ...schoolIdentity, supervisor: "", grade: "" },
  roster: null,
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
  if (
    value.profile.grade !== undefined &&
    value.profile.grade !== "" &&
    !grades.includes(value.profile.grade)
  )
    throw Error("Invalid profile grade");
  const roster = value.roster == null ? null : validateRoster(value.roster);
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
      if (
        !Array.isArray(v[g.key]) ||
        v[g.key].length >
          (v.kind === "absence" && ["roll", "students"].includes(g.key)
            ? 3000
            : 500)
      )
        throw Error("Invalid rows");
      if (new Set(v[g.key].map((r) => r.id)).size !== v[g.key].length)
        throw Error("Duplicate rows");
      for (const r of v[g.key]) {
        if (!r || typeof r.id !== "string") throw Error("Invalid row");
        for (const key of ["studentId", "className"])
          if (r[key] !== undefined && typeof r[key] !== "string")
            throw Error("Invalid student reference");
        for (const f of g.fields) {
          if (
            v.kind === "daily" &&
            g.key === "attendance" &&
            ["lateCount", "lateNames"].includes(f.key) &&
            r[f.key] === undefined
          )
            r[f.key] = "";
          if (typeof r[f.key] !== "string" && typeof r[f.key] !== "number")
            throw Error("Invalid field");
        }
      }
    }
    for (const [key, val] of Object.entries(v))
      if (!groups[v.kind].some((g) => g.key === key) && typeof val !== "string")
        throw Error("Invalid value");
  }
  if (new Set(value.saved.map((v) => v.id)).size !== value.saved.length)
    throw Error("Duplicate records");
  return {
    ...value,
    profile: {
      ...withSchoolIdentity(value.profile),
      grade: value.profile.grade || "",
    },
    roster,
    drafts: Object.fromEntries(
      Object.entries(value.drafts).map(([k, v]) => [k, withSchoolIdentity(v)]),
    ),
    lang: value.lang === "en" ? "en" : "ar",
  };
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
    action: actionText(s.action, s.actionState),
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

// Apply the device owner's name to unfinished drafts, preserving historical authors.
export function withSupervisor(store, supervisor) {
  const previous = store.profile.supervisor;
  return {
    ...store,
    profile: { ...store.profile, supervisor },
    drafts: Object.fromEntries(
      Object.entries(store.drafts).map(([kind, draft]) => [
        kind,
        !draft.savedAt &&
        !store.saved.some((saved) => saved.id === draft.id) &&
        (!draft.supervisor.trim() || draft.supervisor === previous)
          ? { ...draft, supervisor }
          : draft,
      ]),
    ),
  };
}

export function withRoster(store, roster) {
  const available = rosterGrades(roster);
  const grade = available.includes(store.profile.grade)
    ? store.profile.grade
    : available[0];
  const profile = { ...store.profile, grade };
  const drafts = { ...store.drafts };
  const late = drafts.late;
  if (
    late &&
    !late.savedAt &&
    !store.saved.some((s) => s.id === late.id) &&
    !late.students.some(isRowFilled)
  ) {
    drafts.late = {
      ...late,
      grade,
      className: rosterClasses(roster, grade)[0] || "",
      rosterMode: "yes",
      students: [],
    };
  }
  const absence = drafts.absence;
  if (
    absence &&
    !absence.savedAt &&
    !store.saved.some((s) => s.id === absence.id) &&
    !absence.roll.length &&
    !absence.students.length
  )
    drafts.absence = initializeAbsence(absence, roster, grade, uid);
  return { ...store, profile, roster, drafts };
}
