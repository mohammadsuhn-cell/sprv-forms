import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import {
  newForm,
  emptyStore,
  validateStore,
  report,
  caseRegister,
} from "../src/model.js";
import {
  submissionForm,
  withReceivedReferences,
  caseReferenceLabel,
} from "../src/case-reference.js";
import { wordBlob, excelBlob } from "../src/exports.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

test("receipt metadata survives backup and edits without changing the submitted payload", async () => {
  const store = emptyStore();
  store.profile = {
    ...store.profile,
    supervisor: "مشرف اختبار",
    syncSupervisorId: "supe",
  };
  const form = {
    ...newForm("case", store.profile),
    student: "طالب اختبار",
    className: "٧/١",
    savedAt: new Date().toISOString(),
  };
  store.saved = [form];
  store.drafts.case = { ...form, notes: "مسودة أحدث" };
  assert.equal(caseReferenceLabel(form), "بانتظار رقم الحالة");
  const reference = "CASE-2026-000123";
  const receipts = [{ formId: form.id, receipt: { reference } }];
  const next = withReceivedReferences(store, receipts);
  assert.equal(next.saved[0].receiverReference, reference);
  assert.equal(next.drafts.case.notes, "مسودة أحدث");
  assert.equal(next.drafts.case.receiverReference, reference);
  assert.deepEqual(submissionForm(next.saved[0]), form);
  assert.equal(withReceivedReferences(next, receipts), next);
  assert.equal(store.saved[0].receiverReference, undefined);
  const restored = validateStore(JSON.parse(JSON.stringify(next))).saved[0];
  assert.equal(restored.receiverReference, reference);
  assert(JSON.stringify(report(restored)).includes(reference));
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "sprv-reference-"));
  const file = path.join(folder, "case.docx");
  try {
    fs.writeFileSync(
      file,
      Buffer.from(await (await wordBlob(restored)).arrayBuffer()),
    );
    assert(
      execFileSync("unzip", ["-p", file, "word/document.xml"], {
        encoding: "utf8",
      }).includes(reference),
    );
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
  for (const exportForm of [
    restored,
    caseRegister([restored], store.profile),
  ]) {
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(await (await excelBlob(exportForm)).arrayBuffer());
    assert(String(book.worksheets[0].getCell("A7").value).includes(reference));
  }
  assert.equal(newForm("case", store.profile).receiverReference, undefined);
  const bad = structuredClone(next);
  bad.saved[0].receiverReference = "fake";
  assert.throws(() => validateStore(bad));
});
