import test from "node:test";
import assert from "node:assert/strict";
import {
  newForm,
  validateForm,
  emptyStore,
  validateStore,
  withRoster,
  report,
  uid,
} from "../src/model.js";
import {
  absenceSummary,
  editAbsenceClass,
  toggleAbsent,
} from "../src/absence.js";
import { fixture, completedForm } from "./absence-fixture.mjs";

test("unreviewed classes cannot export; explicitly confirmed zero absence is valid", () => {
  const form = newForm("absence", { supervisor: "مشرف تجريبي" }, fixture());
  assert.equal(form.grade, "الصف السابع");
  assert.equal(form.classes.length, 6);
  assert.equal(form.roll.length, 140);
  assert(validateForm(form).length);
  form.classes.forEach((c) => (c.confirmed = "yes"));
  assert.deepEqual(validateForm(form), []);
  assert.equal(absenceSummary(form).present, 140);
  assert.equal(absenceSummary(form).absent, 0);
  assert(
    validateForm(newForm("absence", { supervisor: "مشرف تجريبي" })).length,
  );
});
test("paper totals match 55 absent, 85 present and 140 enrolled, and export excludes present names", () => {
  const form = completedForm(),
    summary = absenceSummary(form),
    out = report(form);
  assert.deepEqual(validateForm(form), []);
  assert.deepEqual(
    [summary.absent, summary.present, summary.total],
    [55, 85, 140],
  );
  assert.deepEqual(
    summary.classes.map((c) => c.present),
    [8, 19, 11, 17, 15, 15],
  );
  assert.equal(out.absence.day, "الخميس");
  assert.equal(out.absence.classes[0].students.length, 15);
  assert(!JSON.stringify(out).includes(form.roll[22].student));
  assert.equal(out.absence.roll, undefined);
});
test("selection and enrollment changes invalidate confirmation; counts and duplicate IDs are validated", () => {
  const form = completedForm();
  const changed = toggleAbsent(form, form.roll[0], uid);
  assert.equal(changed.classes[0].confirmed, "");
  assert.equal(absenceSummary(changed).absent, 54);
  assert.equal(form.classes[0].confirmed, "yes");
  assert.equal(
    editAbsenceClass(form, "٧/٢", { total: "24" }).classes[1].confirmed,
    "",
  );
  for (const total of ["", "-1", "1.5", "14", "1001"]) {
    const bad = structuredClone(form);
    bad.classes[0].total = total;
    assert(validateForm(bad).length, total);
  }
  const bad = structuredClone(form);
  bad.students.push({ ...bad.students[0], id: "duplicate" });
  assert(validateForm(bad).length);
  const wrongClass = structuredClone(form);
  wrongClass.students[0].className = "٨/١";
  assert(validateForm(wrongClass).length);
});
test("new sheets start empty; roster updates, removal and backups preserve historical rolls and selections", () => {
  const form = completedForm(),
    store = emptyStore();
  store.drafts.absence = form;
  store.saved = [{ ...structuredClone(form), savedAt: "2026-09-24" }];
  const revised = fixture();
  revised.students[0].name = "اسم محدث";
  const updated = withRoster(store, revised);
  updated.roster = null;
  const restored = validateStore(JSON.parse(JSON.stringify(updated)));
  assert.deepEqual(restored.drafts.absence, form);
  assert.deepEqual(restored.saved, store.saved);
  assert.deepEqual(validateForm(restored.saved[0]), []);
  const fresh = newForm("absence", store.profile, fixture());
  assert.equal(fresh.students.length, 0);
  assert.equal(absenceSummary(fresh).confirmed, 0);
  const empty = emptyStore();
  empty.drafts.absence = newForm("absence", empty.profile);
  assert.equal(withRoster(empty, fixture()).drafts.absence.roll.length, 140);
});
