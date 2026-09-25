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
  incidentDetails,
  prepareCaseDraft,
  caseDescription,
} from "../src/case-options.js";

test("descriptions use explicit choices, attribute reported information and drop unrelated details", () => {
  let form = newForm("case", { supervisor: "مشرف تجريبي" });
  form = updateCaseChoice(form, "type", "التأخر عن الحصة");
  assert.equal(form.description, "تأخر الطالب عن الحصة.");
  form = updateCaseChoice(form, "incidentDetail", "ذكر تأخر وسيلة النقل");
  form = updateCaseChoice(form, "source", "إفادة منقولة");
  assert(form.description.startsWith("بحسب إفادة منقولة،"));
  assert(form.description.includes("ذكر أن وسيلة النقل تأخرت"));
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

test("every incident detail becomes a natural sentence without field labels", () => {
  for (const [type, details] of Object.entries(incidentDetails)) {
    const base = composeCaseDescription({ type });
    for (const incidentDetail of details) {
      const text = composeCaseDescription({ type, incidentDetail });
      assert(text.length > 15);
      assert.notEqual(
        text,
        base,
        `${type}: ${incidentDetail} must be represented`,
      );
      assert(!/[:()[\]]/.test(text), text);
    }
  }
  assert.equal(
    composeCaseDescription({
      type: "الخروج من الفصل",
      incidentDetail: "خرج دون استئذان",
      location: "الفصل",
    }),
    "غادر الطالب الفصل دون استئذان.",
  );
  assert.equal(
    composeCaseDescription({
      type: "عدم إحضار الأدوات",
      incidentDetail: "الكتاب المدرسي",
      period: "الثانية",
    }),
    "لم يحضر الطالب الكتاب المدرسي خلال الحصة الثانية.",
  );
});
test("notes remain separate, persist across choices and appear once in the preview and exports", () => {
  let form = updateCaseChoice(
    newForm("case", { supervisor: "مشرف تجريبي" }),
    "type",
    "الخروج من الفصل",
  );
  form = updateCaseChoice(form, "incidentDetail", "خرج دون استئذان");
  form = updateCaseChoice(
    form,
    "incidentNotes",
    "ملاحظة إضافية كما كتبها المشرف",
  );
  form = updateCaseChoice(form, "period", "الثانية");
  assert.equal(form.incidentNotes, "ملاحظة إضافية كما كتبها المشرف");
  assert.equal(caseDescription(form), form.description);
  const store = emptyStore();
  store.drafts.case = form;
  const restored = validateStore(JSON.parse(JSON.stringify(store))).drafts.case;
  const prepared = prepareCaseDraft(restored);
  const line = report(prepared)
    .sections.flatMap((s) => s.lines)
    .find(([key]) => key === "وصف الواقعة");
  assert.equal(line[1], prepared.description);
  assert.equal(line[1].split(form.incidentNotes).length - 1, 1);
  assert(
    !report(prepared)
      .sections.flatMap((s) => s.lines)
      .some(([key]) => key === "تفصيل الواقعة"),
  );
  assert.equal(
    caseRegister([prepared]).rows[0].description,
    prepared.description,
  );
  const notesOnly = updateCaseChoice(
    newForm("case"),
    "incidentNotes",
    "واقعة موضحة بالنص فقط",
  );
  assert.equal(notesOnly.description, "واقعة موضحة بالنص فقط");
});
test("old generated drafts are rephrased while written descriptions and saved source objects stay intact", () => {
  const old = {
    ...newForm("case"),
    type: "الخروج من الفصل",
    incidentDetail: "خرج دون استئذان",
    description: "خرج الطالب من الفصل. التفصيل المسجل: خرج دون استئذان.",
    descriptionGenerated:
      "خرج الطالب من الفصل. التفصيل المسجل: خرج دون استئذان.",
  };
  const previous = JSON.stringify(old);
  assert.equal(
    prepareCaseDraft(old).description,
    "غادر الطالب الفصل دون استئذان.",
  );
  assert.equal(JSON.stringify(old), previous);
  const manual = {
    ...old,
    description: "النص الأصلي الذي كتبه المشرف",
    incidentNotes: "ملاحظة لاحقة",
  };
  assert.equal(prepareCaseDraft(manual).description, manual.description);
  assert.equal(
    caseDescription(manual),
    "النص الأصلي الذي كتبه المشرف\nملاحظة لاحقة",
  );
  assert.equal(
    report(manual)
      .sections.flatMap((s) => s.lines)
      .find(([key]) => key === "وصف الواقعة")[1],
    caseDescription(manual),
  );
});
