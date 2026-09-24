import { schoolIdentity, arDigits, newForm } from "../src/model.js";
export const enrolled = [23, 23, 22, 24, 25, 23];
export const absences = [15, 4, 11, 7, 10, 8];
export function fixture() {
  return {
    format: "sprv-roster",
    version: 1,
    ...schoolIdentity,
    students: enrolled.flatMap((total, c) =>
      Array.from({ length: total }, (_, i) => ({
        id: `synthetic-${c}-${i}`,
        name: `طالب تجريبي ${arDigits(c + 1)} ${arDigits(i + 1)}`,
        className: arDigits(`7/${c + 1}`),
        grade: "الصف السابع",
        order: i,
      })),
    ),
  };
}
export function completedForm() {
  const form = newForm(
    "absence",
    { supervisor: "مشرف تجريبي", grade: "الصف السابع" },
    fixture(),
  );
  form.date = "2026-09-24";
  form.students = form.classes.flatMap((c, index) =>
    form.roll
      .filter((s) => s.className === c.className)
      .slice(0, absences[index])
      .map((s) => ({ ...s })),
  );
  form.classes = form.classes.map((c) => ({ ...c, confirmed: "yes" }));
  return form;
}
