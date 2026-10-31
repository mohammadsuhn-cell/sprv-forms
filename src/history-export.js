import { shortCaseReference } from "./case-reference.js";
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
      [
        dateLabel(summary.date || record.date),
        shortCaseReference(record.reference),
      ]
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
      [
        "أيام الغياب المبلغ عنها",
        history.absenceCoverage === false ||
        typeof history.totals.absenceDays !== "number"
          ? "—"
          : arDigits(history.totals.absenceDays),
      ],
      ...(history.reviews
        ? [
            [
              "تحديث المتابعات",
              new Date(history.reviews.fetchedAt).toLocaleString("ar-KW", {
                timeZone: "Asia/Kuwait",
              }),
            ],
          ]
        : []),
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
      ...(history.absenceCoverage !== false &&
      (typeof history.totals.absenceDays === "number" ||
        history.records.some((r) => r.kind === "absence"))
        ? [
            {
              title: "الغياب المبلغ عنه",
              columns: ["التاريخ", "المشرف"],
              rows: history.records
                .filter((r) => r.kind === "absence")
                .map((r) => [dateLabel(r.date), r.supervisorName]),
            },
          ]
        : []),
      ...(history.reviews
        ? [
            {
              title: history.reviews.offline
                ? "المتابعات المحفوظة على الجهاز"
                : "ملاحظات الإشراف العام والمتابعة",
              columns: ["بيانات المتابعة", "تفاصيل الملاحظة أو الرد"],
              rows: history.reviews.threads.flatMap(({ thread, events }) =>
                events
                  .filter((e) => e.operation.type !== "open")
                  .map((e) => [
                    [
                      shortCaseReference(thread.source?.reference) ||
                        dateLabel(thread.source?.date),
                      "نسخة المراجعة: " + thread.reportRevision,
                      thread.archivedAt
                        ? "التقرير مسحوب"
                        : {
                            open: "طلب مفتوح",
                            closed: "طلب مغلق",
                            cancelled: "طلب ملغى",
                            note: "ملاحظة",
                          }[thread.status],
                      e.actorName,
                      new Date(e.receivedAt).toLocaleString("ar-KW", {
                        timeZone: "Asia/Kuwait",
                      }),
                    ]
                      .filter(Boolean)
                      .join("\n"),
                    [
                      {
                        request: "طلب متابعة",
                        note: "ملاحظة",
                        reply: "رد",
                        acknowledge: "إقرار بالاطلاع",
                        amend: "توضيح",
                        close: "إغلاق الطلب",
                        reopen: "إعادة فتح الطلب",
                        cancel: "إلغاء الطلب",
                      }[e.operation.type],
                      e.operation.text,
                    ]
                      .filter(Boolean)
                      .join(": "),
                  ]),
              ),
            },
          ]
        : []),
    ],
    sections: [],
  };
}

export const historyFileName = (name, extension) =>
  `${name}.${extension}`.replace(/[\\/:*?"<>|]/g, "-");
