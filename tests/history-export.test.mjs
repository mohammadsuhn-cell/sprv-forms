import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import ExcelJS from "exceljs";
import { loadProfileHistory, profileReport } from "../src/history-export.js";
import { wordReportBlob, excelReportBlob } from "../src/exports.js";
import { schoolIdentity } from "../src/model.js";

const record = (id) => ({
  id: String(id),
  kind: "case",
  date: "2026-09-28",
  reference: `CASE-2026-${String(id).padStart(6, "0")}`,
  supervisorName: "مشرف مصدر",
  caseSummaries: [
    {
      date: "2026-09-28",
      type: "متابعة",
      description: "وصف مختصر للواقعة",
      action: "إنذار أول (لم يُنفّذ بعد)",
      due: "2026-10-01",
      status: "",
    },
  ],
});
function fixture() {
  return {
    ...schoolIdentity,
    summaryVersion: 1,
    preparedBy: "مشرف مُصدر",
    student: { id: "student", name: "طالب تجريبي", className: "٧/١" },
    fetchedAt: "2026-09-28T10:00:00Z",
    total: 35,
    totals: {
      caseReports: 35,
      lateDays: 2,
      lateReports: 3,
      lateDates: ["2026-09-28", "2026-09-27"],
    },
    records: Array.from({ length: 35 }, (_, i) => record(i)),
    nextOffset: null,
    nextCursor: null,
  };
}
test("full profile export fetches every snapshot page, independent of on-screen filters", async () => {
  const data = fixture(),
    calls = [];
  const result = await loadProfileHistory("student", async (action, params) => {
    calls.push([action, params]);
    return params.cursor
      ? { ...data, records: data.records.slice(30) }
      : {
          ...data,
          records: data.records.slice(0, 30),
          nextOffset: 30,
          nextCursor: "cursor",
        };
  });
  assert.equal(result.records.length, 35);
  assert.deepEqual(calls, [
    ["student-history", { studentId: "student" }],
    ["student-history", { studentId: "student", cursor: "cursor" }],
  ]);
  for (const bad of [
    { ...data, summaryVersion: undefined },
    { ...data, records: data.records.slice(0, 30) },
    { ...data, records: Array(35).fill(record(1)) },
    { ...data, nextOffset: 30, nextCursor: null },
  ])
    await assert.rejects(() => loadProfileHistory("student", async () => bad), {
      code: "history_unavailable",
    });
  await assert.rejects(
    () =>
      loadProfileHistory("student", async () => {
        throw Object.assign(Error("expired"), { code: "pagination_expired" });
      }),
    { code: "pagination_expired" },
  );
  await assert.rejects(
    () =>
      loadProfileHistory("student", async (action, params) => {
        if (params.cursor)
          throw Object.assign(Error("revoked during export"), { status: 401 });
        return {
          ...data,
          records: data.records.slice(0, 30),
          nextOffset: 30,
          nextCursor: "cursor",
        };
      }),
    { status: 401 },
  );
  await assert.rejects(
    () =>
      loadProfileHistory(
        "student",
        async () => data,
        () => false,
      ),
    { name: "AbortError" },
  );
});

test("profile exports preserve Arabic, full case lists, distinct late dates and pending actions", async () => {
  const data = fixture(),
    original = JSON.stringify(data),
    r = profileReport(data);
  assert.equal(r.tables[0].rows.length, 35);
  assert.equal(r.tables[1].rows.length, 2);
  assert(r.tables[0].rows[34][0].includes("CASE-2026-000034"));
  assert.deepEqual(r.sections, []);
  assert.equal(r.tables[0].rows[0][1], "متابعة");
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(await (await excelReportBlob(r)).arrayBuffer());
  const allCells = JSON.stringify(
    book.worksheets.map((s) => s.getSheetValues()),
  );
  for (const value of [
    "طالب تجريبي",
    "CASE-2026-000034",
    "لم يُنفّذ بعد",
    "٢٧/٠٩/٢٠٢٦",
  ])
    assert(allCells.includes(value), value);
  assert(book.worksheets.every((s) => s.views[0].rightToLeft));
  for (const value of [
    "وصف مختصر للواقعة",
    "عن هذا الملخص",
    "نطاق السجل",
    "إحصائية السجل",
  ])
    assert(!allCells.includes(value), value);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sprv-history-export-"));
  try {
    const file = path.join(dir, "profile.docx");
    fs.writeFileSync(
      file,
      Buffer.from(await (await wordReportBlob(r)).arrayBuffer()),
    );
    const xml = execFileSync("unzip", ["-p", file, "word/document.xml"], {
      encoding: "utf8",
    });
    for (const value of [
      "طالب تجريبي",
      "CASE-2026-000034",
      "لم يُنفّذ بعد",
      "٢٧/٠٩/٢٠٢٦",
      "w:bidi",
      "w:tblHeader",
    ])
      assert(xml.includes(value), value);
    assert(!xml.includes("وصف مختصر للواقعة"));
    assert(!xml.includes("عن هذا الملخص"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  assert.equal(JSON.stringify(data), original);
  const empty = profileReport({
    ...data,
    records: [],
    total: 0,
    totals: { caseReports: 0, lateReports: 0, lateDays: 0, lateDates: [] },
  });
  assert.equal(empty.tables.length, 2);
  assert(empty.tables.every((table) => table.rows.length === 0));
  assert.deepEqual(empty.sections, []);
  const emptyBook = new ExcelJS.Workbook();
  await emptyBook.xlsx.load(await (await excelReportBlob(empty)).arrayBuffer());
  assert.equal(emptyBook.worksheets.length, 2);
});
