import test from "node:test";
import assert from "node:assert/strict";
import {
  newForm,
  report,
  validateForm,
  validateStore,
  emptyStore,
  groups,
  newRow,
} from "../src/model.js";
test("new forms retain profile, start blank, and isolate copies", () => {
  for (const kind of ["cases", "case", "daily", "staffing"]) {
    const profile = {
      school: "مدرسة تجريبية",
      supervisor: "مشرف تجريبي",
      year: "٢٠٢٦/٢٠٢٧",
    };
    const a = newForm(kind, profile),
      b = newForm(kind, profile);
    assert.notEqual(a.id, b.id);
    assert.equal(a.school, profile.school);
    assert.equal(a.student || "", "");
    if (kind !== "case") {
      assert.notEqual(
        a[groups[kind][0].key][0].id,
        b[groups[kind][0].key][0].id,
      );
      assert.equal(report(a).tables.length, 0);
    }
  }
});
test("blank numeric attendance differs from explicit zero", () => {
  const v = newForm("daily", { school: "مدرسة", supervisor: "مشرف" });
  v.attendance[0].className = "٧/١";
  v.attendance[0].present = "0";
  v.attendance[0].absent = "";
  const r = report(v);
  assert.equal(r.tables[0].rows[0][1], "٠");
  assert.equal(r.tables[0].rows[0][2], "");
  assert.deepEqual(validateForm(v), []);
  v.attendance[0].present = "-1";
  assert(validateForm(v).length);
});
test("reports preserve source narratives and planned action distinction", () => {
  const v = newForm("case", { school: "مدرسة", supervisor: "مشرف" });
  v.student = "طالب تجريبي";
  v.description = "نص <script> وآخر\nسطر جديد";
  v.action = "إنذار أول";
  v.actionState = "مخطط للتنفيذ";
  v.outcome = "";
  const r = report(v);
  const text = JSON.stringify(r);
  assert(text.includes("مخطط للتنفيذ"));
  assert(text.includes("<script>"));
  assert(!text.includes("تم التنفيذ"));
  assert.deepEqual(validateForm(v), []);
});
test("backups round trip and reject invalid row data", () => {
  const v = emptyStore();
  const a = newForm("daily");
  v.saved = [a];
  assert.deepEqual(validateStore(JSON.parse(JSON.stringify(v))), v);
  v.saved[0].attendance[0].present = { evil: true };
  assert.throws(() => validateStore(v));
  assert.throws(() => validateStore({ version: 1, saved: [] }));
});
test("register validates inverted dates and omits unused rows", () => {
  const v = newForm("cases", { school: "مدرسة", supervisor: "مشرف" });
  v.from = "2026-09-25";
  v.to = "2026-09-24";
  v.rows[0].student = "طالب";
  v.rows.push(newRow(groups.cases[0]));
  assert.equal(report(v).tables[0].rows.length, 1);
  assert(validateForm(v).length);
});

test("simple register preserves planned actions and includes only individual cases", async () => {
  const { caseRegister } = await import("../src/model.js");
  const a = newForm("case", { school: "مدرسة", supervisor: "مشرف" });
  Object.assign(a, {
    student: "طالب",
    date: "2026-09-22",
    action: "إنذار أول",
    actionState: "مخطط للتنفيذ",
    due: "2026-09-25",
  });
  const r = caseRegister([a, newForm("daily")], {
    school: "مدرسة",
    supervisor: "مشرف",
  });
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].action, "إنذار أول (مخطط للتنفيذ)");
  assert.equal(r.from, "2026-09-22");
  assert.equal(r.to, "2026-09-22");
  assert.equal(r.rows[0].due, "2026-09-25");
  const store = emptyStore();
  store.saved = [a];
  store.drafts.daily = newForm("daily");
  assert.equal(
    validateStore(JSON.parse(JSON.stringify(store))).drafts.daily.kind,
    "daily",
  );
});
