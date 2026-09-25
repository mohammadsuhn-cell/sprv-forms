import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDailySummary,
  refreshDailyBrief,
  attendanceTotals,
  dailyValues,
} from "../src/daily-brief.js";
import {
  newForm,
  report,
  validateForm,
  validateStore,
  caseRegister,
  withRoster,
} from "../src/model.js";
import { dailyFixture } from "./daily-fixture.mjs";

const brief = ({ store, date }) => ({
  ...newForm("daily", store.profile, store.roster),
  date,
});
test("daily brief aggregates class attendance, unique late students, cases and actual cover outcomes", () => {
  const f = dailyFixture(),
    original = structuredClone(f.store);
  const result = refreshDailyBrief(brief(f), f.store.saved, f.store.roster);
  assert.deepEqual(attendanceTotals(result.summary.attendance), {
    enrolled: 140,
    present: 85,
    absent: 55,
  });
  assert.deepEqual(result.summary.attendance[0], {
    className: "٧/١",
    enrolled: 23,
    present: 8,
    absent: 15,
  });
  assert.equal(result.summary.late, 3);
  assert.equal(result.summary.cases, 2);
  assert.deepEqual(result.summary.staffing, {
    absent: 1,
    late: 0,
    leave: 0,
    covered: 1,
    pending: 1,
    uncovered: 1,
  });
  assert.deepEqual(validateForm(result), []);
  result.repairs = "تعطل التكييف، تم إبلاغ الصيانة.";
  const output = JSON.stringify(report(result));
  assert(output.includes(result.repairs));
  for (const name of [
    ...f.absence.students.map((s) => s.student),
    "بديل جديد",
    "وصف خاص",
    "معلم تجريبي غائب",
  ])
    assert(!output.includes(name), name);
  assert.deepEqual(f.store, original);
});

test("date, supervisor and grade isolate sources; registers and drafts do not add cases", () => {
  const f = dailyFixture(),
    v = brief(f);
  f.store.saved.push(
    { ...f.cases[0], id: "old", date: "2026-09-23" },
    { ...f.cases[0], id: "grade8", className: "٨/١" },
    { ...f.cases[0], id: "other", supervisor: "مشرف آخر" },
    caseRegister(f.cases, f.store.profile),
  );
  f.store.drafts.case = { ...f.cases[0], id: "draft" };
  assert.equal(buildDailySummary(v, f.store.saved, f.store.roster).cases, 2);
  const empty = buildDailySummary(
    { ...v, date: "2026-09-25" },
    f.store.saved,
    f.store.roster,
  );
  assert.equal(empty.late, null);
  assert.equal(empty.cases, 0);
  assert.equal(empty.staffing, null);
  assert.deepEqual(attendanceTotals(empty.attendance), {
    enrolled: null,
    present: null,
    absent: null,
  });
  const missing = { ...v, summary: empty, lateZero: "yes", staffZero: "yes" };
  assert.equal(dailyValues(missing).late, 0);
  assert.equal(dailyValues(missing).staffing.absent, 0);
});

test("newer absence sheet replaces totals and an unconfirmed sheet never becomes zero absence", () => {
  const f = dailyFixture(),
    v = brief(f);
  const newer = {
    ...structuredClone(f.absence),
    id: "newer",
    savedAt: "2026-09-24T09:00:00Z",
    students: [],
  };
  f.store.saved.push(newer);
  const summary = buildDailySummary(v, f.store.saved, f.store.roster);
  assert.deepEqual(attendanceTotals(summary.attendance), {
    enrolled: 140,
    present: 140,
    absent: 0,
  });
  newer.classes[0].confirmed = "";
  assert.equal(
    attendanceTotals(
      buildDailySummary(v, f.store.saved, f.store.roster).attendance,
    ).absent,
    null,
  );
});

test("saved brief snapshots survive source edits, deletion, roster removal and backup restore", () => {
  const f = dailyFixture();
  const v = {
    ...refreshDailyBrief(brief(f), f.store.saved, f.store.roster),
    savedAt: "2026-09-24T10:00:00Z",
    repairs: "إصلاح الإنارة",
  };
  f.store.saved.push(v);
  f.store.drafts.daily = structuredClone(v);
  const before = structuredClone(v);
  f.store.saved = f.store.saved.filter(
    (s) => !["case", "late"].includes(s.kind),
  );
  const restored = validateStore(
    JSON.parse(JSON.stringify(withRoster(f.store, null))),
  );
  assert.deepEqual(
    restored.saved.find((s) => s.id === v.id),
    before,
  );
  const updated = refreshDailyBrief(v, restored.saved, restored.roster);
  assert.equal(updated.summary.cases, 0);
  assert.equal(updated.summary.late, null);
  assert.equal(updated.repairs, "إصلاح الإنارة");
  assert.deepEqual(v, before);
  restored.drafts.daily.summary.attendance[0].present = 999;
  assert.throws(() => validateStore(restored));
});

test("same-name roster students stay distinct and a changed source ID is counted once", () => {
  const f = dailyFixture(),
    a = f.late.students[0];
  f.late.students = [
    a,
    { ...a, id: "different-row", studentId: "different-student" },
  ];
  f.otherLate.students = [{ ...a, id: "duplicate-row" }];
  assert.equal(
    buildDailySummary(brief(f), f.store.saved, f.store.roster).late,
    2,
  );
});

test("legacy mixed-grade staffing does not assign unspecific teacher absences to a grade", () => {
  const f = dailyFixture();
  delete f.staff.grade;
  f.staff.covers.push({ ...f.staff.covers[0], id: "grade8", className: "٨/١" });
  const result = buildDailySummary(brief(f), [f.staff], f.store.roster);
  assert.equal(result.staffing.absent, 0);
  assert.equal(result.staffing.uncovered, 1);
  assert.equal(result.staffing.pending, 0);
});

test("zero confirmations apply only to their scope and yield to newly recorded data", () => {
  const f = dailyFixture();
  const empty = refreshDailyBrief(brief(f), [], f.store.roster);
  empty.lateZero = "yes";
  empty.staffZero = "yes";
  assert.equal(refreshDailyBrief(empty, [], f.store.roster).lateZero, "yes");
  const updated = refreshDailyBrief(empty, f.store.saved, f.store.roster);
  assert.equal(updated.lateZero, "");
  assert.equal(updated.staffZero, "");
  assert.equal(dailyValues(updated).late, 3);
  const nextDay = refreshDailyBrief(
    { ...empty, date: "2026-09-25" },
    [],
    f.store.roster,
  );
  assert.equal(nextDay.lateZero, "");
  assert.equal(nextDay.staffZero, "");
  const otherOwner = refreshDailyBrief(
    { ...empty, supervisor: "مشرف آخر" },
    [],
    f.store.roster,
  );
  assert.equal(otherOwner.lateZero, "");
});

test("new staffing logs require a grade while legacy logs remain editable", () => {
  const form = newForm("staffing", { supervisor: "مشرف" });
  form.notes = "متابعة";
  assert(validateForm(form).some(([ar]) => ar === "اختر الصف."));
  form.grade = "الصف السابع";
  assert.deepEqual(validateForm(form), []);
  delete form.grade;
  assert.deepEqual(validateForm(form), []);
});
