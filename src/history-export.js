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
  const short = (value) => {
    const text = String(value || "")
      .replace(/\s+/g, " ")
      .trim();
    return text.length > 400 ? text.slice(0, 400) + "…" : text;
  };
  const caseRows = cases.flatMap((record) =>
    record.caseSummaries.map((summary) => [
      [dateLabel(summary.date || record.date), record.reference]
        .filter(Boolean)
        .join("\n"),
      [summary.type || "حالة", short(summary.description)]
        .filter(Boolean)
        .join("\n"),
      [
        summary.action || "لم يُسجّل إجراء",
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
      ...(caseRows.length
        ? [
            {
              title: "ملخص الحالات",
              columns: [
                "التاريخ / رقم الحالة",
                "وصف الواقعة",
                "الإجراء والمتابعة",
                "المشرف",
              ],
              rows: caseRows,
            },
          ]
        : []),
      ...(lateDates.length
        ? [
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
          ]
        : []),
    ],
    sections: [
      {
        title: "إحصائية السجل",
        lines: [
          ["تقارير الحالات", arDigits(history.totals.caseReports)],
          ["أيام التأخر", arDigits(lateDates.length)],
          ["تقارير التأخر", arDigits(history.totals.lateReports)],
          ...(!cases.length ? [["الحالات", "لا توجد حالات واردة."]] : []),
          ...(!lateDates.length
            ? [["التأخر", "لا توجد أيام تأخر واردة."]]
            : []),
        ],
      },
      {
        title: "عن هذا الملخص",
        lines: [
          [
            "آخر تحديث",
            new Date(history.fetchedAt).toLocaleString("ar-KW", {
              timeZone: "Asia/Kuwait",
            }),
          ],
          [
            "نطاق السجل",
            "يشمل التقارير الواردة من مشرفي الصف. لا يشمل المسودات أو التقارير التي لم تصل بعد. يُحسب يوم التأخر مرة واحدة ولو ورد أكثر من تقرير عنه.",
          ],
          [
            "ملخص الحالات",
            "قد يُختصر وصف الواقعة؛ تتوفر التفاصيل كاملة في تصدير الحالة. عدد التقارير لا يساوي بالضرورة عدد الوقائع في سجلات الحالات المجمعة.",
          ],
        ],
      },
    ],
  };
}

export const historyFileName = (name, extension) =>
  `${name}.${extension}`.replace(/[\\/:*?"<>|]/g, "-");
