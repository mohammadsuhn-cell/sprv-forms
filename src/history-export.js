import { letterhead, dateLabel, arDigits } from "./model.js";

const unavailable = () =>
  Object.assign(new Error("حدّث اتصال الإشراف العام لتصدير السجل الكامل"), {
    code: "history_unavailable",
  });

// Start a fresh, unfiltered snapshot. Never export just the currently visible page.
export async function loadProfileHistory(studentId, read, active = () => true) {
  const first = await read("student-history", { studentId });
  if (!active()) throw new DOMException("Cancelled", "AbortError");
  if (first.summaryVersion !== 1 || !Array.isArray(first.records))
    throw unavailable();
  const records = [...first.records],
    seen = new Set();
  let page = first;
  while (page.nextOffset !== null) {
    if (!page.nextCursor || seen.has(page.nextCursor)) throw unavailable();
    seen.add(page.nextCursor);
    page = await read("student-history", {
      studentId,
      cursor: page.nextCursor,
    });
    if (!active()) throw new DOMException("Cancelled", "AbortError");
    if (
      page.summaryVersion !== 1 ||
      page.student.id !== first.student.id ||
      page.fetchedAt !== first.fetchedAt ||
      page.total !== first.total
    )
      throw unavailable();
    records.push(...page.records);
  }
  if (
    records.length !== first.total ||
    new Set(records.map((r) => r.id)).size !== first.total ||
    records.some((r) => !Array.isArray(r.caseSummaries))
  )
    throw unavailable();
  return { ...first, records, nextOffset: null, nextCursor: null };
}

export function profileReport(history) {
  const cases = history.records.filter((r) =>
    ["case", "cases"].includes(r.kind),
  );
  const lateDates = [...new Set(history.totals.lateDates)].sort().reverse();
  const caseRows = cases.flatMap((record) =>
    record.caseSummaries.map((summary) => [
      [dateLabel(summary.date || record.date), record.reference]
        .filter(Boolean)
        .join("\n"),
      summary.type || "—",
      [
        summary.action || "—",
        summary.status,
        summary.due && `المتابعة: ${dateLabel(summary.due)}`,
      ]
        .filter(Boolean)
        .join("\n"),
      record.supervisorName,
    ]),
  );
  return {
    ...letterhead,
    school: history.school,
    year: history.year,
    kind: "student-profile",
    title: "ملخص سجل الطالب",
    supervisor: history.preparedBy,
    landscape: true,
    meta: [
      ["اسم الطالب", history.student.name],
      ["الشعبة", history.student.className],
      ["تقارير الحالات", arDigits(history.totals.caseReports)],
      ["أيام التأخر", arDigits(lateDates.length)],
    ],
    tables: [
      {
        title: "الحالات",
        columns: [
          "التاريخ / رقم الحالة",
          "نوع الحالة",
          "الإجراء والمتابعة",
          "المشرف",
        ],
        rows: caseRows,
      },
      {
        title: "تواريخ التأخر",
        columns: ["اليوم", "التاريخ"],
        rows: lateDates.map((date) => [
          new Intl.DateTimeFormat("ar-KW", {
            weekday: "long",
            timeZone: "Asia/Kuwait",
          }).format(new Date(`${date}T12:00:00Z`)),
          dateLabel(date),
        ]),
      },
    ],
    sections: [],
  };
}

export const historyFileName = (name, extension) =>
  `${name}.${extension}`.replace(/[\\/:*?"<>|]/g, "-");
