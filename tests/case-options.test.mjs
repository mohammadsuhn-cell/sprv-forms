import test from "node:test";
import assert from "node:assert/strict";
import {
  newForm,
  emptyStore,
  validateStore,
  report,
  caseRegister,
  actions,
} from "../src/model.js";
import {
  composeCaseDescription,
  updateCaseChoice,
  actionText,
} from "../src/case-options.js";

test("descriptions use explicit choices, attribute reported information and drop unrelated details", () => {
  let form = newForm("case", { supervisor: "مشرف تجريبي" });
  form = updateCaseChoice(form, "type", "التأخر عن الحصة");
  assert.equal(form.description, "تأخر الطالب عن الحصة.");
  form = updateCaseChoice(form, "incidentDetail", "ذكر تأخر وسيلة النقل");
  form = updateCaseChoice(form, "source", "إفادة منقولة");
  assert(form.description.startsWith("بحسب إفادة منقولة،"));
  assert(form.description.includes("ذكر تأخر وسيلة النقل"));
  assert(!form.description.includes("أول مرة"));
  assert(!form.description.includes("الحصة: الأولى"));
  form = updateCaseChoice(form, "recurrence", "تكررت سابقًا");
  form = updateCaseChoice(form, "type", "شجار");
  assert.equal(form.recurrence, "");
  assert(!form.description.includes("سبق تسجيل"));
  assert.equal(form.incidentDetail, "");
  assert(!form.description.includes("وسيلة النقل"));
  assert.equal(composeCaseDescription({ type: "واقعة أخرى" }), "");
});
test("manual descriptions and old records are never overwritten by dropdown edits, including after backup", () => {
  const form = {
    ...newForm("case", { supervisor: "مشرف تجريبي" }),
    description: "إفادة محفوظة كما كتبها المشرف",
  };
  let next = updateCaseChoice(form, "type", "شجار");
  next = updateCaseChoice(next, "period", "الثانية");
  assert.equal(next.description, form.description);
  assert.equal(form.type, "");
  const store = emptyStore();
  store.drafts.case = next;
  store.saved = [structuredClone(next)];
  const restored = validateStore(JSON.parse(JSON.stringify(store)));
  assert.equal(restored.drafts.case.description, form.description);
  assert.equal(
    updateCaseChoice(restored.drafts.case, "location", "الساحة").description,
    form.description,
  );
  const auto = updateCaseChoice(
    newForm("case", store.profile),
    "type",
    "مقاطعة الشرح",
  );
  store.drafts.case = auto;
  const loaded = validateStore(JSON.parse(JSON.stringify(store))).drafts.case;
  assert(
    updateCaseChoice(loaded, "period", "الثالثة").description.includes(
      "الثالثة",
    ),
  );
});
test("pending actions use the new wording in reports and registers while retaining stored history", () => {
  for (const state of ["مخطط للتنفيذ", "لم يُنفّذ بعد"]) {
    const form = {
      ...newForm("case", { supervisor: "مشرف تجريبي" }),
      student: "طالب تجريبي",
      action: "تعهد خطي",
      actionState: state,
    };
    const original = JSON.stringify(form);
    assert(JSON.stringify(report(form)).includes("لم يُنفّذ بعد"));
    assert(!JSON.stringify(report(form)).includes("مخطط للتنفيذ"));
    assert.equal(
      caseRegister([form]).rows[0].action,
      "تعهد خطي (لم يُنفّذ بعد)",
    );
    assert.equal(JSON.stringify(form), original);
  }
  assert.equal(
    actionText("إنذار أول (مخطط للتنفيذ)"),
    "إنذار أول (لم يُنفّذ بعد)",
  );
  for (const action of ["تعهد خطي", "فصل يوم", "فصل يومين", "فصل ثلاثة أيام"])
    assert(actions.includes(action));
});
