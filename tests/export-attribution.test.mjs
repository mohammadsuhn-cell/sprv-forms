import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import ExcelJS from "exceljs";
import { newForm, report, grades } from "../src/model.js";
import { withCaseParticipants } from "../src/case-students.js";
import {
  createExportContext,
  prepareExportReport,
} from "../src/export-stamp.js";
import { wordBlob, excelBlob, fileName } from "../src/exports.js";
import { completedForm } from "./absence-fixture.mjs";
import { renderPages } from "../src/pdf-pages.js";
import {
  makeSchoolSnapshot,
  createSnapshotReader,
} from "../src/snapshot-model/school-snapshot.js";
import { loadProfileHistory } from "../src/history-export.js";
import { buildStudentArchive } from "../src/student-archive.js";

const author = "مشرف التقرير الأصلي";
const exporter = "المشرف العام الحالي";
const context = createExportContext(exporter, "2026-11-27T22:04:05Z");
const receivedContext = {
  ...context,
  sourceRevision: 4,
  dataAsOf: "2026-11-20T09:00:00Z",
};
const caseForm = () => ({
  ...newForm("case", { supervisor: author, grade: grades[1] }),
  date: "2026-09-24",
  studentId: "student",
  student: "طالب اختبار",
  className: "٧/١",
  receiverReference: "CASE-2026-000123",
  action: "إنذار أول",
  actionState: "لم يُنفّذ بعد",
  description: "وصف الواقعة الأصلي",
  savedAt: "2026-09-24T08:00:00Z",
});

test("Word and Excel separate original author from exporter without changing historical forms", async () => {
  for (const kind of ["case", "late", "daily", "staffing"]) {
    const form =
      kind === "case"
        ? caseForm()
        : newForm(kind, { supervisor: author, grade: grades[1] });
    const original = structuredClone(form);
    const word = await JSZip.loadAsync(
      await (await wordBlob(form, receivedContext)).arrayBuffer(),
    );
    const body = await word.file("word/document.xml").async("string");
    const footer = await word.file("word/footer1.xml").async("string");
    const core = await word.file("docProps/core.xml").async("string");
    assert(body.includes(author));
    assert(body.includes("معدّ التقرير"));
    assert(body.includes("نسخة التقرير"));
    assert(body.includes("آخر تحديث للبيانات"));
    assert(body.includes("٢٠٢٦/١١/٢٠"));
    assert(!body.includes(exporter));
    assert(footer.includes(`أصدر النسخة: ${exporter}`));
    assert(!footer.includes(author));
    assert(footer.includes("٢٠٢٦/١١/٢٨"));
    assert(footer.includes("٠١:٠٤:٠٥"));
    assert.match(footer, /NUMPAGES/);
    assert.match(body, /w:bidiVisual/);
    assert(core.includes(`<dc:creator>${author}</dc:creator>`));
    assert(core.includes(`<cp:lastModifiedBy>${exporter}</cp:lastModifiedBy>`));
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(
      await (await excelBlob(form, receivedContext)).arrayBuffer(),
    );
    assert.equal(book.creator, author);
    assert.equal(book.lastModifiedBy, exporter);
    assert.equal(book.modified.toISOString(), context.exportedAt);
    for (const sheet of book.worksheets) {
      assert(sheet.getCell("A5").value.includes(author));
      assert(sheet.getCell("A5").value.includes("نسخة التقرير: ٤"));
      assert(sheet.getCell("A5").value.includes("٢٠٢٦/١١/٢٠"));
      assert(!sheet.getCell("A5").value.includes(exporter));
      assert(sheet.headerFooter.oddFooter.includes(`أصدر النسخة: ${exporter}`));
      assert(sheet.headerFooter.oddFooter.includes("٠١:٠٤:٠٥"));
      assert.equal(sheet.views[0].rightToLeft, true);
      assert.equal(sheet.pageSetup.paperSize, 9);
    }
    assert.deepEqual(form, original);
  }
});

test("numbered case filenames retain the date and distinguish cases from the same day", () => {
  const first = caseForm();
  const second = { ...first, receiverReference: "CASE-2026-000124" };
  assert.match(fileName(first, "pdf"), /2026-09-24-2026-123\.pdf$/);
  assert.notEqual(fileName(first, "pdf"), fileName(second, "pdf"));
  assert(!/[\\/:*?"<>|]/.test(fileName(first, "pdf")));
});

// A text recorder exercises the actual PDF drawing/pagination code in Node.
// It verifies content and page coverage, not browser font shaping or appearance.
function recordCanvas(t) {
  const previous = globalThis.document;
  globalThis.document = {
    fonts: { load: async () => {}, ready: Promise.resolve() },
    createElement(tag) {
      assert.equal(tag, "canvas");
      const texts = [];
      const ctx = {
        font: "16px Arial",
        measureText(value) {
          return {
            width:
              String(value).length *
              (parseFloat(this.font.match(/(\d+)px/)?.[1]) || 16) *
              0.56,
          };
        },
        fillText(value) {
          texts.push(String(value));
        },
        save() {},
        restore() {},
        scale() {},
        fillRect() {},
        strokeRect() {},
        beginPath() {},
        moveTo() {},
        lineTo() {},
        stroke() {},
      };
      return { texts, getContext: () => ctx };
    },
  };
  t.after(() => {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  });
}

test("PDF drawing retains Arabic, long content and a fixed exporter on every page, including absence", async (t) => {
  recordCanvas(t);
  const form = caseForm();
  form.description = Array.from(
    { length: 95 },
    (_, i) => `LONG${String(i).padStart(3, "0")} متابعة عربية مطولة للاختبار`,
  ).join("\n");
  const prepared = prepareExportReport(report(form), context);
  const pages = await renderPages(prepared);
  assert(pages.length > 1);
  const text = pages.flatMap((p) => p.texts).join(" ");
  for (let i = 0; i < 95; i++)
    assert(text.includes(`LONG${String(i).padStart(3, "0")}`));
  assert(text.includes(author));
  assert(text.includes("لم يُنفّذ بعد"));
  for (const page of pages) {
    assert(page.texts.join(" ").includes(`أصدر النسخة: ${exporter}`));
    assert(page.texts.join(" ").includes("٠١:٠٤:٠٥"));
  }
  const absence = completedForm();
  absence.supervisor = author;
  for (const page of await renderPages(
    prepareExportReport(report(absence), context),
  )) {
    const content = page.texts.join(" ");
    assert(content.includes(`معدّ التقرير: ${author}`));
    assert(content.includes(`أصدر النسخة: ${exporter}`));
  }
});

function offlineHistory() {
  const students = [
    { id: "student", name: "طالب اختبار", className: "٧/١" },
    { id: "other", name: "طالب مشارك", className: "٧/١" },
  ];
  const records = Array.from({ length: 35 }, (_, i) => ({
    id: `author:case-${i}`,
    supervisorId: "author",
    supervisorName: author,
    grade: grades[1],
    revision: 2,
    receivedAt: "2026-11-20T08:00:00Z",
    reference: `CASE-2026-${String(i + 1).padStart(6, "0")}`,
    form: withCaseParticipants(
      { ...caseForm(), id: `case-${i}` },
      students.map((s) => ({
        id: s.id,
        studentId: s.id,
        student: s.name,
        className: s.className,
        actionMode: "shared",
      })),
    ),
  }));
  const snapshot = makeSchoolSnapshot(
    { serverId: "receiver", endpoint: "https://receiver.example.invalid" },
    { id: "general", role: "general", name: "اسم سابق وقت تنزيل السجل" },
    students,
    records,
    "snapshot",
    "2026-11-20T09:00:00Z",
    2,
  );
  return createSnapshotReader(snapshot).student;
}
const recordingRenderers = {
  async pdfReportBlob(source, ctx) {
    return new Blob([JSON.stringify(prepareExportReport(source, ctx))]);
  },
  async pdfBlob(form, ctx) {
    return new Blob([JSON.stringify(prepareExportReport(report(form), ctx))]);
  },
};

test("offline ZIP includes all history pages, one PDF per shared incident and one current export identity/time", async () => {
  const read = offlineHistory();
  const history = await loadProfileHistory("student", read);
  assert.equal(history.records.length, 35);
  const original = structuredClone(history);
  const progress = [];
  const blob = await buildStudentArchive(history, read, context, {
    renderers: recordingRenderers,
    onProgress: (...p) => progress.push(p),
  });
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const files = Object.values(zip.files).filter((f) => !f.dir);
  assert.equal(files.length, 36);
  for (const file of files) {
    const r = JSON.parse(await file.async("string"));
    assert.equal(r.exportedBy, exporter);
    assert.equal(r.exportedAt, context.exportedAt);
    assert(
      r.meta.some(
        ([key, value]) =>
          key === "آخر تحديث للبيانات" && value.includes("٢٠٢٦/١١/٢٠"),
      ),
    );
    assert.equal(
      r.supervisor,
      r.kind === "student-profile" ? exporter : author,
    );
    if (file.name.startsWith("الحالات/")) {
      assert(
        r.meta.some(([key, value]) => key === "نسخة التقرير" && value === "٢"),
      );
      assert.match(file.name, /2026-09-24-2026-\d+\.pdf$/);
    }
  }
  assert.deepEqual(progress.at(-1), [35, 35]);
  assert.deepEqual(history, original);
});

test("ZIP export rejects changed revisions, missing cases, failed rendering and cancellation", async () => {
  const read = offlineHistory();
  const history = await loadProfileHistory("student", read);
  const options = { renderers: recordingRenderers };
  await assert.rejects(
    () =>
      buildStudentArchive(
        history,
        async (...args) => ({ ...(await read(...args)), revision: 3 }),
        context,
        options,
      ),
    { code: "pagination_expired" },
  );
  await assert.rejects(
    () =>
      buildStudentArchive(
        history,
        async () => {
          throw Error("Missing report");
        },
        context,
        options,
      ),
    /Missing report/,
  );
  await assert.rejects(
    () =>
      buildStudentArchive(history, read, context, {
        renderers: {
          ...recordingRenderers,
          pdfBlob: async () => {
            throw Error("PDF failed");
          },
        },
      }),
    /PDF failed/,
  );
  await assert.rejects(
    () =>
      buildStudentArchive(history, read, context, {
        ...options,
        active: () => false,
      }),
    { name: "AbortError" },
  );
});
