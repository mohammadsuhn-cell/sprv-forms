import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import {
  newForm,
  validateForm,
  validateStore,
  emptyStore,
  report,
  caseRegister,
} from "../src/model.js";
import {
  caseParticipants,
  withCaseParticipants,
} from "../src/case-students.js";
import { prepareCaseDraft } from "../src/case-options.js";
import { buildDailySummary } from "../src/daily-brief.js";
import { excelBlob, wordBlob } from "../src/exports.js";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function fixture() {
  const legacy = {
    ...newForm("case", { supervisor: "مشرف تجريبي" }),
    student: "طالب أول تجريبي",
    className: "٧/١",
    type: "شجار",
    action: "تنبيه شفهي",
    actionState: "تم التنفيذ",
    reportingTeacher: "معلم تجريبي",
  };
  return withCaseParticipants(legacy, [
    caseParticipants(legacy)[0],
    {
      id: "second",
      student: "طالب ثان تجريبي",
      className: "٧/٢",
      actionMode: "individual",
      action: "إنذار أول",
      actionState: "لم يُنفّذ بعد",
    },
  ]);
}
test("group cases round-trip without rewriting old cases or losing individual planned actions", () => {
  const form = fixture(),
    store = emptyStore();
  const legacy = {
    ...newForm("case", { supervisor: "مشرف" }),
    student: "طالب قديم",
    className: "٧/٣",
    description: "النص التاريخي",
  };
  store.saved = [legacy, form];
  store.drafts.case = form;
  const snapshot = JSON.stringify(store);
  assert.deepEqual(validateStore(JSON.parse(snapshot)), store);
  assert.deepEqual(validateForm(form), []);
  const text = JSON.stringify(report(form));
  for (const value of [
    form.reportingTeacher,
    "طالب أول تجريبي",
    "طالب ثان تجريبي",
    "٧/٢",
    "تنبيه شفهي",
    "إنذار أول (لم يُنفّذ بعد)",
  ])
    assert(text.includes(value), value);
  assert.equal(JSON.stringify(store), snapshot);
  assert.equal(caseParticipants(legacy).length, 1);
  assert.equal(caseRegister([form]).rows.length, 1);
  assert(caseRegister([form]).rows[0].action.includes("لم يُنفّذ بعد"));
  const daily = {
    ...newForm("daily", { supervisor: form.supervisor, grade: "الصف السابع" }),
    date: form.date,
  };
  assert.equal(
    buildDailySummary(daily, [form, caseRegister([form])], null).cases,
    1,
  );
});
test("every student is validated and removing the first student updates compatibility fields", () => {
  const form = fixture();
  const changeSecond = (values) =>
    withCaseParticipants(form, [
      form.participants[0],
      { ...form.participants[1], ...values },
    ]);
  assert(validateForm(changeSecond({ student: "" })).length);
  assert(validateForm(changeSecond({ className: "" })).length);
  assert(
    validateForm(changeSecond({ student: form.student, className: "7 / 1" }))
      .length,
  );
  assert(validateForm(changeSecond({ action: "" })).length);
  assert(validateForm({ ...form, status: "مغلقة" }).length);
  const remaining = withCaseParticipants(form, form.participants.slice(1));
  assert.equal(remaining.student, "طالب ثان تجريبي");
  assert.deepEqual(validateForm(remaining), []);
  assert(JSON.stringify(report(remaining)).includes("لم يُنفّذ بعد"));
  for (const participants of [
    [],
    null,
    {},
    [form.participants[0], form.participants[0]],
    [{ ...form.participants[0], action: {} }],
    Array.from({ length: 101 }, (_, i) => ({
      ...form.participants[0],
      id: String(i),
    })),
  ]) {
    const store = emptyStore();
    store.saved = [{ ...form, participants }];
    assert.throws(() => validateStore(store));
  }
  const store = emptyStore();
  store.saved = [{ ...form, student: "wrong projection" }];
  assert.throws(() => validateStore(store));
});
test("group descriptions remain neutral and manual narratives stay unchanged", () => {
  const form = prepareCaseDraft(fixture());
  assert(form.description.includes("الطلبة المذكورين"));
  const single = prepareCaseDraft(
    withCaseParticipants(form, [form.participants[0]]),
  );
  assert(!single.description.includes("الطلبة المذكورين"));
  assert.equal(
    prepareCaseDraft({ ...form, description: "نص محفوظ" }).description,
    "نص محفوظ",
  );
});
test("Word and Excel exports contain all students, teacher and actions; register filters preserve one incident", async () => {
  const form = fixture(),
    original = JSON.stringify(form);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await (await excelBlob(form)).arrayBuffer());
  assert.equal(
    wb.worksheets[0].getCell("B7").value,
    "طالب أول تجريبي\nطالب ثان تجريبي",
  );
  assert(
    wb.worksheets[0].getCell("E7").value.includes("إنذار أول (لم يُنفّذ بعد)"),
  );
  const details = JSON.stringify(wb.getWorksheet("تفاصيل").getSheetValues());
  assert(details.includes(form.reportingTeacher));
  assert(details.includes("طالب ثان تجريبي"));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sprv-case-export-"));
  try {
    const file = path.join(dir, "case.docx");
    fs.writeFileSync(
      file,
      Buffer.from(await (await wordBlob(form)).arrayBuffer()),
    );
    const xml = execFileSync("unzip", ["-p", file, "word/document.xml"], {
      encoding: "utf8",
    });
    for (const value of [
      form.reportingTeacher,
      "طالب أول تجريبي",
      "طالب ثان تجريبي",
      "لم يُنفّذ بعد",
    ])
      assert(xml.includes(value));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  const unrelated = { ...newForm("case"), student: "unrelated" };
  const register = caseRegister(
    [form, unrelated].filter((s) =>
      JSON.stringify(s).includes("طالب ثان تجريبي"),
    ),
  );
  assert.equal(register.rows.length, 1);
  assert(register.rows[0].student.includes(form.student));
  assert.equal(JSON.stringify(form), original);
});
