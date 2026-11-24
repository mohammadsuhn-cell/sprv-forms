import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyStore,
  newForm,
  validateStore,
  withSupervisor,
} from "../src/model.js";
import { withReceivedReferences } from "../src/case-reference.js";
import { fixture } from "./absence-fixture.mjs";
import {
  activateDraft,
  dailyFormForDate,
  discardDraft,
  formState,
  hasDraftInput,
  isUnfinished,
  mergeWorkspaceBackup,
  openWorkspaceForm,
  saveWorkspaceForm,
  unfinishedDrafts,
} from "../src/form-workspace.js";

const date = "2026-11-24";
const previousDate = "2026-11-23";
function workspace() {
  const store = emptyStore();
  store.profile = {
    ...store.profile,
    supervisor: "مشرف تجريبي",
    grade: "الصف السابع",
    syncSupervisorId: "test-supervisor",
  };
  store.roster = fixture();
  return store;
}
function open(store, kind, day = date, extra = {}) {
  return openWorkspaceForm(store, kind, store.profile, { date: day, ...extra });
}
function fill(form) {
  switch (form.kind) {
    case "case":
      return { ...form, student: "طالب تجريبي", className: "٧/١" };
    case "daily":
      return { ...form, repairs: "صيانة تجريبية" };
    case "absence":
      return {
        ...form,
        classes: form.classes.map((c) => ({ ...c, confirmed: "yes" })),
      };
    case "late":
      return {
        ...form,
        students: [
          {
            id: "synthetic-row",
            studentId: "synthetic-student",
            student: "طالب تجريبي",
            className: "٧/١",
            arrival: "",
            reason: "",
            action: "",
          },
        ],
      };
    case "staffing":
      return {
        ...form,
        covers: form.covers.map((c) => ({ ...c, teacher: "معلم تجريبي" })),
      };
  }
}

for (const kind of ["case", "daily", "absence", "late", "staffing"]) {
  test(`${kind}: empty visits do not accumulate drafts; yesterday's unfinished work survives today's entry and reload`, () => {
    let store = open(workspace(), kind, previousDate);
    assert.equal(hasDraftInput(store.drafts[kind], store.roster), false);
    assert.equal(unfinishedDrafts(store).length, 0);
    store = open(store, kind);
    assert.equal(store.drafts[kind].date, date);
    assert.equal(store.draftArchive.length, 0);
    const yesterday = fill({ ...store.drafts[kind], date: previousDate });
    store = activateDraft(store, yesterday);
    store = open(store, kind);
    assert.notEqual(store.drafts[kind].id, yesterday.id);
    assert.equal(store.drafts[kind].date, date);
    assert.deepEqual(store.draftArchive, [yesterday]);
    assert.equal(
      store.saved.length,
      0,
      "Preserving a draft must never submit it",
    );
    store = validateStore(JSON.parse(JSON.stringify(store)));
    const current = fill(store.drafts[kind]);
    store = activateDraft(store, current);
    store = activateDraft(store, store.draftArchive[0]);
    assert.deepEqual(store.drafts[kind], yesterday);
    assert.deepEqual(store.draftArchive, [current]);
    const restored = validateStore(JSON.parse(JSON.stringify(store)));
    assert.deepEqual(restored.draftArchive, [current]);
    assert.equal(unfinishedDrafts(restored).length, 2);
  });
}

for (const kind of ["absence", "daily"]) {
  test(`${kind}: today's saved report and unsent correction keep their identity; tomorrow starts clean`, () => {
    let store = open(workspace(), kind);
    const form = fill(store.drafts[kind]);
    store = saveWorkspaceForm(store, form, `${date}T08:00:00Z`);
    const saved = structuredClone(store.saved[0]);
    store = open(store, kind);
    assert.deepEqual(store.drafts[kind], saved);
    assert.equal(formState(store, store.drafts[kind]), "pending");
    const corrected = { ...saved, notes: "تصحيح تجريبي" };
    store = activateDraft(store, corrected);
    store = open(store, kind);
    assert.deepEqual(store.drafts[kind], corrected);
    assert.equal(formState(store, corrected), "edited");
    store = saveWorkspaceForm(store, corrected, `${date}T09:00:00Z`);
    assert.equal(store.saved.length, 1);
    assert.equal(store.saved[0].id, saved.id);
    assert.equal(store.saved[0].notes, "تصحيح تجريبي");
    const nextDay = open(store, kind, "2026-11-25");
    assert.notEqual(nextDay.drafts[kind].id, saved.id);
    assert.equal(nextDay.drafts[kind].date, "2026-11-25");
    assert.equal(nextDay.drafts[kind].notes, "");
    assert.deepEqual(nextDay.saved, store.saved);
    if (kind === "absence") {
      assert(nextDay.drafts.absence.classes.every((c) => !c.confirmed));
      assert.deepEqual(nextDay.drafts.absence.students, []);
    } else assert.equal(nextDay.drafts.daily.repairs, "");
  });
}

test("daily selection respects author, grade, withdrawal and most recent saved version", () => {
  let store = open(workspace(), "daily");
  store = saveWorkspaceForm(
    store,
    fill(store.drafts.daily),
    `${date}T08:00:00Z`,
  );
  const original = store.saved[0];
  store.saved.push({
    ...original,
    id: "other-author",
    syncSupervisorId: "other",
    savedAt: `${date}T11:00:00Z`,
  });
  store.saved.push({
    ...original,
    id: "other-grade",
    grade: "الصف الثامن",
    savedAt: `${date}T12:00:00Z`,
  });
  assert.equal(
    dailyFormForDate(store, "daily", store.profile, date).id,
    original.id,
  );
  assert.equal(
    dailyFormForDate(store, "daily", store.profile, date, [original.id]),
    null,
  );
  const fresh = open(store, "daily", date, { excluded: [original.id] });
  assert.notEqual(fresh.drafts.daily.id, original.id);
  assert.equal(
    dailyFormForDate(
      store,
      "daily",
      { ...store.profile, grade: "الصف الثامن" },
      date,
    ).id,
    "other-grade",
  );
  const renamed = { ...store.profile, supervisor: "اسم محدث" };
  assert.equal(dailyFormForDate(store, "daily", renamed, date).id, original.id);
  assert.equal(
    dailyFormForDate(
      store,
      "daily",
      { ...store.profile, syncSupervisorId: "different" },
      date,
    ),
    null,
  );
});

test("opening another date or saved record keeps an unfinished correction, including changed dates", () => {
  let store = open(workspace(), "absence");
  store = saveWorkspaceForm(store, fill(store.drafts.absence));
  const saved = structuredClone(store.saved[0]);
  const correction = { ...saved, date: previousDate, notes: "تصحيح مؤرخ" };
  store = activateDraft(store, correction);
  store = open(store, "absence");
  assert.deepEqual(
    store.drafts.absence,
    correction,
    "A saved copy must not silently replace pending corrections",
  );
  store = open(store, "absence", "2026-11-20");
  assert.deepEqual(store.draftArchive, [correction]);
  store = discardDraft(store, correction.id);
  assert.deepEqual(store.saved, [saved]);
  assert.equal(
    dailyFormForDate(store, "absence", store.profile, date).id,
    saved.id,
  );
});

test("new case always starts fresh and preserves both unrelated drafts and saved reports", () => {
  let store = open(workspace(), "case");
  const first = fill(store.drafts.case);
  store = activateDraft(store, first);
  store = open(store, "case");
  assert.notEqual(store.drafts.case.id, first.id);
  assert.deepEqual(store.draftArchive, [first]);
  const second = fill(store.drafts.case);
  store = saveWorkspaceForm(store, second);
  store = open(store, "case");
  assert.notEqual(store.drafts.case.id, second.id);
  assert.equal(unfinishedDrafts(store).length, 1);
  assert.equal(store.saved.length, 1);
});

test("receipt arrival and repeated unchanged saves never create an extra revision", () => {
  let store = open(workspace(), "case");
  store = saveWorkspaceForm(
    store,
    fill(store.drafts.case),
    `${date}T08:00:00Z`,
  );
  const saved = store.saved[0];
  const records = [
    {
      formId: saved.id,
      savedAt: saved.savedAt,
      receipt: {
        reference: "CASE-2026-000001",
        receivedAt: `${date}T08:01:00Z`,
      },
      pending: false,
    },
  ];
  assert.equal(formState(store, saved, records), "received");
  store = withReceivedReferences(store, records);
  const unchanged = saveWorkspaceForm(
    store,
    store.drafts.case,
    `${date}T09:00:00Z`,
  );
  assert.equal(unchanged.saved, store.saved);
  assert.equal(unchanged.saved[0].savedAt, saved.savedAt);
  assert.equal(isUnfinished(unchanged, unchanged.drafts.case), false);
  const correction = { ...unchanged.drafts.case, notes: "تعديل" };
  assert.equal(formState(unchanged, correction, records), "edited");
  store = saveWorkspaceForm(unchanged, correction, `${date}T10:00:00Z`);
  assert.equal(
    formState(store, store.drafts.case, records),
    "pending",
    "Old receipt cannot acknowledge a newer edit",
  );
  const latest = [
    { ...records[0], savedAt: store.saved[0].savedAt, pending: true },
  ];
  assert.equal(formState(store, store.drafts.case, latest), "pending");
  assert.equal(
    formState(store, store.drafts.case, [{ ...latest[0], blocked: true }]),
    "blocked",
  );
  assert.equal(
    formState(store, correction, [
      { ...latest[0], withdrawalRequestedAt: date },
    ]),
    "withdrawn",
  );
});

test("backup restore keeps different unfinished entries of the same type and active corrections win for the same ID", () => {
  let current = open(workspace(), "case");
  current = activateDraft(current, fill(current.drafts.case));
  let backup = open(workspace(), "case");
  backup = activateDraft(backup, fill(backup.drafts.case));
  backup = open(backup, "case");
  backup = activateDraft(backup, fill(backup.drafts.case));
  const merged = validateStore(
    JSON.parse(JSON.stringify(mergeWorkspaceBackup(current, backup))),
  );
  assert.deepEqual(merged.drafts.case, current.drafts.case);
  assert.equal(unfinishedDrafts(merged).length, 3);
  assert.equal(merged.saved.length, 0);
  const again = mergeWorkspaceBackup(merged, backup);
  assert.equal(unfinishedDrafts(again).length, 3);
  const conflicting = {
    ...backup,
    drafts: { case: { ...current.drafts.case, notes: "نسخة قديمة" } },
  };
  assert.deepEqual(
    mergeWorkspaceBackup(current, conflicting).drafts.case,
    current.drafts.case,
  );
});

test("legacy backups work; archived drafts get full validation and identity updates", () => {
  const legacy = workspace();
  delete legacy.draftArchive;
  assert.deepEqual(validateStore(legacy).draftArchive, []);
  let store = open(workspace(), "case");
  store = activateDraft(store, fill(store.drafts.case));
  store = open(store, "case");
  const renamed = withSupervisor(store, "مشرف محدث");
  assert.equal(renamed.draftArchive[0].supervisor, "مشرف محدث");
  for (const bad of [
    null,
    {},
    [null],
    [{ ...store.draftArchive[0], school: null }],
    [store.drafts.case],
  ]) {
    assert.throws(() => validateStore({ ...store, draftArchive: bad }));
  }
  const huge = {
    ...store,
    draftArchive: Array.from({ length: 2000 }, (_, i) => ({
      ...store.draftArchive[0],
      id: `overflow-${i}`,
    })),
  };
  assert.throws(() => validateStore(huge), /Too many forms/);
});
