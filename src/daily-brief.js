import { absenceSummary, validateAbsence } from "./absence.js";
import { rosterClasses, rosterGrades } from "./roster.js";

const gradeNames = ["الصف السادس", "الصف السابع", "الصف الثامن", "الصف التاسع"];
const text = (value) =>
  String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ");
const digits = (value) =>
  text(value).replace(/[٠-٩]/g, (c) => "٠١٢٣٤٥٦٧٨٩".indexOf(c));
const arabic = (value) => String(value).replace(/\d/g, (c) => "٠١٢٣٤٥٦٧٨٩"[c]);
const number = (value) => (value === null ? "لم يُسجّل" : arabic(value));
const classKey = (value) => {
  const match = digits(value).match(/^([6-9])\s*[/\\-]\s*(\d{1,2})$/);
  return match ? `${match[1]}/${Number(match[2])}` : "";
};
const inGrade = (className, grade) => {
  const key = classKey(className),
    g = gradeNames.indexOf(grade) + 6;
  if (!key || g < 6) return false;
  const [year, section] = key.split("/").map(Number);
  return year === g && section >= 1 && section <= (g === 7 ? 6 : 10);
};
const filled = (row) =>
  Object.entries(row).some(([k, v]) => k !== "id" && text(v));
const latestFirst = (a, b) =>
  String(b.savedAt || b.createdAt || "").localeCompare(
    String(a.savedAt || a.createdAt || ""),
  ) || a.id.localeCompare(b.id);
export const isLinkedDaily = (form) =>
  form?.kind === "daily" && form.dailyMode === "linked";

export function initializeDailyBrief(form, profile, roster) {
  return {
    ...form,
    dailyMode: "linked",
    grade: gradeNames.includes(profile.grade)
      ? profile.grade
      : rosterGrades(roster)[0] || "",
    repairs: "",
    lateZero: "",
    staffZero: "",
    summary: null,
  };
}

// Only saved records contribute. Counts are copied into the brief; source forms
// and their names/narratives are never embedded in its snapshot.
export function buildDailySummary(form, saved, roster) {
  const scoped = [...saved]
    .filter(
      (s) =>
        s.date === form.date && text(s.supervisor) === text(form.supervisor),
    )
    .sort(latestFirst);
  const seen = new Set();
  const records = scoped.filter((s) => !seen.has(s.id) && seen.add(s.id));
  const absence = records.find(
    (s) => s.kind === "absence" && s.grade === form.grade,
  );
  const allowedClasses = Array.from(
    { length: form.grade === gradeNames[1] ? 6 : 10 },
    (_, i) => arabic(`${gradeNames.indexOf(form.grade) + 6}/${i + 1}`),
  );
  const ready = absence && !validateAbsence(absence, allowedClasses).length;
  const attendance = ready
    ? absenceSummary(absence).classes.map((c) => ({
        className: c.className,
        enrolled: c.total,
        present: c.present,
        absent: c.absent,
      }))
    : rosterClasses(roster, form.grade)
        .filter((c) => inGrade(c, form.grade))
        .map((className) => ({
          className,
          enrolled: null,
          present: null,
          absent: null,
        }));
  attendance.sort((a, b) =>
    classKey(a.className).localeCompare(classKey(b.className), "en", {
      numeric: true,
    }),
  );

  const lateForms = records.filter(
    (s) => s.kind === "late" && s.grade === form.grade,
  );
  const students = lateForms
    .flatMap((s) =>
      (s.students || []).map((row) => ({
        ...row,
        className: row.className || s.className,
      })),
    )
    .filter((s) => text(s.student) && inGrade(s.className, form.grade));
  // Match a manual spelling to a single known roster ID without collapsing two
  // different roster students who happen to share a name.
  const alias = (s) => `${classKey(s.className)}|${text(s.student)}`;
  const idsByName = new Map();
  for (const s of students)
    if (s.studentId) {
      if (!idsByName.has(alias(s))) idsByName.set(alias(s), new Set());
      idsByName.get(alias(s)).add(s.studentId);
    }
  const lateIds = new Set(
    students.map((s) => {
      const ids = idsByName.get(alias(s));
      const id = s.studentId || (ids?.size === 1 ? [...ids][0] : "");
      return id ? `id:${id}` : `name:${alias(s)}`;
    }),
  );

  // A register is an export of cases, so it must not count the cases again.
  const cases = records.filter(
    (s) =>
      s.kind === "case" && text(s.student) && inGrade(s.className, form.grade),
  ).length;
  const staffForms = records.filter(
    (s) =>
      s.kind === "staffing" &&
      (s.grade
        ? s.grade === form.grade
        : (s.covers || []).some((c) => inGrade(c.className, form.grade))),
  );
  let staffing = null;
  if (staffForms.length) {
    const teachers = new Map(),
      periods = new Map();
    for (const s of staffForms) {
      const classGrades = new Set(
        (s.covers || [])
          .map((c) => classKey(c.className).split("/")[0])
          .filter(Boolean),
      );
      // Older logs have no grade. Their teacher-only rows are usable only if
      // every class in that log belongs to the selected grade.
      if (s.grade === form.grade || classGrades.size === 1)
        for (const row of [...(s.absences || [])].reverse())
          if (text(row.teacher) && !teachers.has(text(row.teacher)))
            teachers.set(text(row.teacher), row.reason);
      for (const row of [...(s.covers || [])].reverse()) {
        if (!filled(row) || !inGrade(row.className, form.grade)) continue;
        const key = text(row.period)
          ? `${classKey(row.className)}|${text(row.period)}`
          : `${s.id}|${row.id}`;
        if (!periods.has(key)) periods.set(key, row);
      }
    }
    staffing = {
      absent: 0,
      late: 0,
      leave: 0,
      covered: 0,
      pending: 0,
      uncovered: 0,
    };
    for (const reason of teachers.values()) {
      if (reason === "غياب") staffing.absent++;
      if (reason === "تأخر") staffing.late++;
      if (reason === "استئذان") staffing.leave++;
    }
    for (const row of periods.values()) {
      if (row.coverage === "حضر البديل") staffing.covered++;
      else if (row.coverage === "لم يحضر البديل") staffing.uncovered++;
      else staffing.pending++;
    }
  }
  return {
    version: 1,
    date: form.date,
    grade: form.grade || "",
    supervisor: form.supervisor,
    attendance,
    late: lateForms.length ? lateIds.size : null,
    cases,
    staffing,
  };
}

export function refreshDailyBrief(form, saved, roster) {
  if (!isLinkedDaily(form)) return form;
  const summary = buildDailySummary(form, saved, roster);
  const sameScope =
    form.summary?.date === form.date &&
    form.summary?.grade === form.grade &&
    form.summary?.supervisor === form.supervisor;
  return {
    ...form,
    summary,
    lateZero: sameScope && summary.late === null ? form.lateZero : "",
    staffZero: sameScope && summary.staffing === null ? form.staffZero : "",
  };
}

export function dailyValues(form) {
  const summary = form.summary;
  return {
    attendance: summary?.attendance || [],
    late: summary?.late ?? (form.lateZero === "yes" ? 0 : null),
    cases: summary?.cases ?? null,
    staffing:
      summary?.staffing ||
      (form.staffZero === "yes"
        ? { absent: 0, late: 0, leave: 0, covered: 0, pending: 0, uncovered: 0 }
        : null),
  };
}

export function attendanceTotals(rows) {
  return Object.fromEntries(
    ["enrolled", "present", "absent"].map((key) => [
      key,
      rows.length && rows.every((row) => row[key] !== null)
        ? rows.reduce((sum, row) => sum + row[key], 0)
        : null,
    ]),
  );
}

export function dailyReport(form) {
  const values = dailyValues(form),
    total = attendanceTotals(values.attendance);
  const tables = [],
    sections = [];
  const rows = values.attendance.length
    ? [
        ...values.attendance.map((row) => [
          row.className,
          number(row.enrolled),
          number(row.present),
          number(row.absent),
        ]),
        [
          "الإجمالي",
          number(total.enrolled),
          number(total.present),
          number(total.absent),
        ],
      ]
    : [["الإجمالي", "لم يُسجّل", "لم يُسجّل", "لم يُسجّل"]];
  tables.push({
    title: "إحصائية الطلبة",
    totalRow: true,
    columns: ["الشعبة", "المقيدون", "الحاضرون", "الغائبون"],
    rows,
  });
  tables.push({
    title: "المعلمون والاحتياط",
    columns: ["المعلمون الغائبون", "حصص مغطاة", "قيد التغطية", "غير مغطاة"],
    rows: [
      ["absent", "covered", "pending", "uncovered"].map((key) =>
        number(values.staffing?.[key] ?? null),
      ),
    ],
  });
  if (values.staffing?.late || values.staffing?.leave)
    sections.push({
      title: "متابعة المعلمين",
      lines: [
        ["التأخر", number(values.staffing.late)],
        ["الاستئذان", number(values.staffing.leave)],
      ],
    });
  sections.push({
    title: "الأعطال والإصلاحات",
    lines: [
      [
        "",
        form.repairs?.trim() ||
          "........................................................",
      ],
    ],
  });
  return {
    meta: [
      ["الصف", form.grade],
      ["المتأخرون", number(values.late)],
      ["الحالات المسجلة", number(values.cases)],
    ],
    tables,
    sections,
  };
}

export function validateDailySummary(summary) {
  if (summary === null) return;
  const count = (n) => Number.isInteger(n) && n >= 0 && n <= 100000;
  const nullableCount = (n) => n === null || count(n);
  if (
    !summary ||
    summary.version !== 1 ||
    ["date", "grade", "supervisor"].some(
      (key) => typeof summary[key] !== "string",
    ) ||
    !Array.isArray(summary.attendance) ||
    summary.attendance.length > 10 ||
    new Set(summary.attendance.map((row) => row.className)).size !==
      summary.attendance.length ||
    summary.attendance.some(
      (row) =>
        !inGrade(row.className, summary.grade) ||
        ["enrolled", "present", "absent"].some(
          (key) => !nullableCount(row[key]),
        ) ||
        (row.enrolled === null
          ? row.present !== null || row.absent !== null
          : row.present === null ||
            row.absent === null ||
            row.enrolled !== row.present + row.absent),
    ) ||
    !nullableCount(summary.late) ||
    !count(summary.cases) ||
    (summary.staffing !== null &&
      (!summary.staffing ||
        ["absent", "late", "leave", "covered", "pending", "uncovered"].some(
          (key) => !count(summary.staffing[key]),
        )))
  )
    throw Error("Invalid daily summary");
}
