import test from "node:test";
import assert from "node:assert/strict";
import {
  validateRoster,
  rosterClasses,
  matchesStudent,
  toggleLateStudent,
} from "../src/roster.js";
import {
  schoolIdentity,
  emptyStore,
  withRoster,
  newForm,
  uid,
  validateStore,
  validateForm,
  report,
} from "../src/model.js";
const roster = () => ({
  format: "sprv-roster",
  version: 1,
  ...schoolIdentity,
  students: [
    {
      id: "test-a",
      name: "أحمد طالب تجريبي",
      grade: "الصف السابع",
      className: "٧/١",
      order: 1,
    },
    {
      id: "test-b",
      name: "طالب تجريبي ثان",
      grade: "الصف السابع",
      className: "٧/٢",
      order: 2,
    },
  ],
});
test("rosters validate IDs, grades and classes and strip unrelated private fields", () => {
  const input = roster();
  input.students[0].civilId = "must-not-import";
  assert.equal(validateRoster(input).students[0].civilId, undefined);
  assert.deepEqual(rosterClasses(input, "الصف السابع"), ["٧/١", "٧/٢"]);
  assert(matchesStudent(input.students[0], "احمد"));
  for (const mutation of [
    (v) => v.students.push(v.students[0]),
    (v) => (v.students[0].grade = "unknown"),
    (v) => (v.students[0].className = "٨/١"),
    (v) => (v.students[0].name = ""),
    (v) => (v.students = []),
  ]) {
    const invalid = roster();
    mutation(invalid);
    assert.throws(() => validateRoster(invalid));
  }
});
test("private import enables an empty checklist and preserves existing records and filled drafts", () => {
  const store = emptyStore();
  store.profile.supervisor = "مشرف تجريبي";
  store.drafts.late = newForm("late", store.profile);
  const next = withRoster(store, validateRoster(roster()));
  assert.equal(next.profile.grade, "الصف السابع");
  assert.equal(next.drafts.late.rosterMode, "yes");
  assert.deepEqual(next.drafts.late.students, []);
  store.drafts.late.students[0].student = "اسم تاريخي";
  const existing = structuredClone(store.drafts.late);
  store.saved.push({ ...existing, savedAt: "2026-09-24" });
  const kept = withRoster(store, validateRoster(roster()));
  assert.deepEqual(kept.drafts.late, existing);
  assert.deepEqual(kept.saved, store.saved);
});
test("cross-class selections keep IDs and historical names through update, backup and exports", () => {
  const store = withRoster(emptyStore(), validateRoster(roster()));
  store.profile.supervisor = "مشرف تجريبي";
  let form = newForm("late", store.profile, store.roster);
  form = toggleLateStudent(form, store.roster.students[0], uid);
  form = { ...form, className: "٧/٢" };
  form = toggleLateStudent(form, store.roster.students[1], uid);
  assert.deepEqual(validateForm(form), []);
  assert.deepEqual(
    form.students.map((s) => s.className),
    ["٧/١", "٧/٢"],
  );
  form.students[0].reason = "تأخر وسيلة النقل";
  store.drafts.late = form;
  store.saved = [{ ...structuredClone(form), savedAt: "2026-09-24" }];
  const revised = roster();
  revised.students[0].name = "اسم محدث";
  revised.students[0].className = "٧/٢";
  const updated = withRoster(store, validateRoster(revised));
  assert.deepEqual(updated.saved, store.saved);
  assert.deepEqual(updated.drafts.late, form);
  const restored = validateStore(JSON.parse(JSON.stringify(updated)));
  assert.equal(restored.roster.students.length, 2);
  assert.deepEqual(restored.drafts.late, form);
  const out = report(form);
  assert.deepEqual(out.tables[0].columns, [
    "اسم الطالب",
    "الشعبة",
    "سبب التأخر (اختياري)",
  ]);
  assert.equal(out.tables[0].rows[0][0], "أحمد طالب تجريبي");
  assert.equal(out.tables[0].rows[0][1], "٧/١");
  assert.equal(out.tables[0].rows[1][1], "٧/٢");
  assert(
    out.meta.some(
      ([label, value]) => label === "عدد المتأخرين" && value === "٢",
    ),
  );
  const deselected = toggleLateStudent(form, store.roster.students[0], uid);
  assert.equal(deselected.students.length, 1);
  assert.equal(form.students.length, 2);
});
test("old backups remain valid and invalid selection metadata is rejected", () => {
  const old = emptyStore();
  delete old.roster;
  delete old.profile.grade;
  assert.equal(validateStore(old).roster, null);
  const store = withRoster(emptyStore(), roster());
  const form = toggleLateStudent(
    newForm("late", store.profile, store.roster),
    store.roster.students[0],
    uid,
  );
  form.students[0].studentId = { bad: true };
  store.drafts.late = form;
  assert.throws(() => validateStore(store));
});
