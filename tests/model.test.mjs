import test from "node:test";
import assert from "node:assert/strict";
import {
  newForm,
  withSupervisor,
  schoolIdentity,
  report,
  validateForm,
  validateStore,
  emptyStore,
  groups,
  newRow,
} from "../src/model.js";
function legacyDaily(profile = {}) {
  const form = newForm("daily", profile);
  for (const key of [
    "dailyMode",
    "summary",
    "repairs",
    "grade",
    "lateZero",
    "staffZero",
  ])
    delete form[key];
  return form;
}
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
    assert.equal(a.school, schoolIdentity.school);
    assert.equal(a.year, schoolIdentity.year);
    assert.equal(a.supervisor, profile.supervisor);
    assert.equal(a.student || "", "");
    if (kind !== "case") {
      assert.notEqual(
        a[groups[kind][0].key][0].id,
        b[groups[kind][0].key][0].id,
      );
      if (kind === "daily") assert.equal(a.summary, null);
      else assert.equal(report(a).tables.length, 0);
    }
  }
});
test("blank numeric attendance differs from explicit zero", () => {
  const v = legacyDaily({ school: "مدرسة", supervisor: "مشرف" });
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
  assert(text.includes("لم يُنفّذ بعد"));
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
  assert.equal(r.rows[0].action, "إنذار أول (لم يُنفّذ بعد)");
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

test("shared school headers apply to restored drafts and exports without changing saved case contents", () => {
  const v = emptyStore();
  v.profile = { school: "اسم قديم", year: "2025", supervisor: "مشرف آخر" };
  const old = {
    ...newForm("case", v.profile),
    school: "اسم قديم",
    year: "2025",
    student: "طالب تجريبي",
    description: "تفاصيل محفوظة",
  };
  v.drafts.case = old;
  v.saved = [{ ...old }];
  const loaded = validateStore(v);
  assert.equal(loaded.profile.school, schoolIdentity.school);
  assert.equal(loaded.drafts.case.year, schoolIdentity.year);
  assert.equal(loaded.profile.supervisor, "مشرف آخر");
  assert.deepEqual(loaded.saved[0], old);
  const exported = report(old);
  assert.equal(exported.school, schoolIdentity.school);
  assert.equal(exported.year, schoolIdentity.year);
  assert(JSON.stringify(exported).includes("تفاصيل محفوظة"));
});

test("legacy daily brief retains attendance, optional late names, cover, and facilities", () => {
  const v = legacyDaily({ supervisor: "مشرف" });
  Object.assign(v.attendance[0], {
    className: "٧/١",
    present: "20",
    absent: "3",
    lateCount: "2",
    lateNames: "طالب أول\nطالب ثان",
  });
  Object.assign(v.covers[0], {
    teacher: "معلم",
    substitute: "بديل",
    coverage: "حضر البديل",
  });
  Object.assign(v.facilities[0], {
    location: "الفصل",
    need: "تكييف",
    details: "تعطل التكييف",
  });
  v.decisions = "إبلاغ الصيانة";
  const r = report(v);
  assert.equal(r.tables.length, 3);
  assert.equal(r.tables[0].columns.length, 4);
  assert.equal(r.tables[0].rows[0][3], "٢");
  assert(
    r.sections.some(
      (s) =>
        s.title === "أسماء المتأخرين صباحًا" &&
        s.lines[0][1].includes("طالب ثان"),
    ),
  );
  assert(r.sections.some((s) => s.title === "الإجراءات والمتابعة"));
  assert.deepEqual(validateForm(v), []);
  v.attendance[0].lateCount = "-1";
  assert(validateForm(v).length);
});
test("legacy daily backups gain blank lateness fields without losing zero counts", () => {
  const store = emptyStore(),
    v = legacyDaily();
  v.attendance[0].present = "0";
  delete v.attendance[0].lateCount;
  delete v.attendance[0].lateNames;
  store.saved = [v];
  const restored = validateStore(JSON.parse(JSON.stringify(store))).saved[0];
  assert.equal(restored.attendance[0].present, "0");
  assert.equal(restored.attendance[0].lateCount, "");
  assert.equal(restored.attendance[0].lateNames, "");
});

test("late students require matching grade/class and names, count named students, and survive backup", async () => {
  const { classesForGrade } = await import("../src/model.js");
  const v = newForm("late", { supervisor: "مشرف" });
  v.grade = "الصف السابع";
  v.className = "٧/٢";
  v.students[0].student = "طالب أول";
  v.students.push({
    ...newRow(groups.late[0]),
    student: "طالب ثان",
    arrival: "07:45",
    reason: "تأخر وسيلة النقل",
  });
  v.students.push(newRow(groups.late[0]));
  assert.deepEqual(validateForm(v), []);
  assert.equal(classesForGrade(v.grade).length, 6);
  assert.deepEqual(classesForGrade("غير معروف"), []);
  const r = report(v);
  assert(
    r.meta.some(([key, value]) => key === "عدد المتأخرين" && value === "٢"),
  );
  assert.equal(r.tables[0].rows.length, 2);
  assert.equal(r.tables[0].columns.length, 3);
  const store = emptyStore();
  store.saved = [v];
  store.drafts.late = v;
  assert.deepEqual(validateStore(JSON.parse(JSON.stringify(store))), store);
  v.grade = "الصف الثامن";
  assert(validateForm(v).length);
  v.className = "٨/١";
  assert.deepEqual(validateForm(v), []);
  v.students[2].arrival = "08:00";
  assert(validateForm(v).length);
});

test("supervisor changes populate unfinished drafts without changing historical authors", () => {
  const store = emptyStore();
  store.profile.supervisor = "المشرف السابق";
  for (const kind of ["case", "daily", "late", "staffing"])
    store.drafts[kind] = newForm(kind, store.profile);
  store.drafts.case.supervisor = "";
  store.drafts.late.supervisor = "مشرف آخر";
  store.drafts.staffing.savedAt = "2026-09-24T08:00:00Z";
  store.saved = [structuredClone(store.drafts.staffing)];
  const next = withSupervisor(store, "المشرف الجديد");
  assert.equal(next.profile.supervisor, "المشرف الجديد");
  assert.equal(next.drafts.case.supervisor, "المشرف الجديد");
  assert.equal(next.drafts.daily.supervisor, "المشرف الجديد");
  assert.equal(next.drafts.late.supervisor, "مشرف آخر");
  assert.equal(next.drafts.staffing.supervisor, "المشرف السابق");
  assert.deepEqual(next.saved, store.saved);
  assert.equal(store.drafts.case.supervisor, "");
});
