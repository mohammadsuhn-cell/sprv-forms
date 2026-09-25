import { newForm, newRow, groups, emptyStore } from "../src/model.js";
import { fixture, completedForm } from "./absence-fixture.mjs";

export function dailyFixture() {
  const store = emptyStore();
  store.roster = fixture();
  store.profile.supervisor = "مشرف تجريبي";
  store.profile.grade = "الصف السابع";
  const date = "2026-09-24";
  const save = (form, minute = 0) => ({
    ...form,
    date,
    savedAt: `2026-09-24T08:${String(minute).padStart(2, "0")}:00Z`,
  });
  const absence = save(completedForm());
  const late = save(newForm("late", store.profile, store.roster));
  const students = [
    store.roster.students[0],
    store.roster.students[23],
    store.roster.students[46],
  ];
  const row = (s) => ({
    ...newRow(groups.late[0]),
    studentId: s.id,
    student: s.name,
    className: s.className,
  });
  late.students = students.slice(0, 2).map(row);
  const otherLate = save(newForm("late", store.profile, store.roster), 1);
  otherLate.students = [
    { ...row(students[0]), studentId: "", className: "7/1" },
    row(students[2]),
  ];
  const cases = [0, 1].map((i) =>
    save(
      {
        ...newForm("case", store.profile),
        student: students[0].name,
        className: "٧/١",
        description: `وصف خاص ${i}`,
      },
      i,
    ),
  );
  const staff = save(newForm("staffing", store.profile));
  staff.absences = [
    {
      ...newRow(groups.staffing[0]),
      teacher: "معلم تجريبي غائب",
      reason: "غياب",
    },
  ];
  staff.covers = [
    {
      ...newRow(groups.staffing[1]),
      teacher: "معلم تجريبي غائب",
      period: "الأولى",
      className: "٧/١",
      substitute: "بديل سابق",
      coverage: "لم يحضر البديل",
    },
  ];
  const laterStaff = save(newForm("staffing", store.profile), 2);
  laterStaff.absences = [{ ...staff.absences[0], id: crypto.randomUUID() }];
  laterStaff.covers = [
    {
      ...staff.covers[0],
      id: crypto.randomUUID(),
      substitute: "بديل جديد",
      coverage: "حضر البديل",
    },
    {
      ...newRow(groups.staffing[1]),
      period: "الثانية",
      className: "٧/٢",
      coverage: "تم إبلاغ البديل",
    },
    {
      ...newRow(groups.staffing[1]),
      period: "الثالثة",
      className: "٧/٣",
      coverage: "لم يحضر البديل",
    },
  ];
  store.saved = [laterStaff, otherLate, ...cases, late, absence, staff];
  return { store, date, absence, late, otherLate, cases, staff, laterStaff };
}
