import { rosterClasses, rosterGrades, classStudents } from "./roster.js";

export function initializeAbsence(form, roster, grade, makeId) {
  const available = rosterGrades(roster);
  grade = available.includes(grade) ? grade : available[0] || "";
  const classes = rosterClasses(roster, grade).map((className) => ({
    id: makeId(),
    className,
    total: String(classStudents(roster, grade, className).length),
    confirmed: "",
  }));
  const roll = classes.flatMap((c) =>
    classStudents(roster, grade, c.className).map((s) => ({
      id: s.id,
      studentId: s.id,
      student: s.name,
      className: s.className,
    })),
  );
  return {
    ...form,
    grade,
    className: classes[0]?.className || "",
    classes,
    roll,
    students: [],
  };
}
export function absenceSummary(form) {
  const order = new Map(form.roll.map((s, i) => [s.studentId, i]));
  const classes = form.classes.map((c) => {
    const students = form.students
      .filter((s) => s.className === c.className)
      .toSorted(
        (a, b) =>
          (order.get(a.studentId) ?? 100000) -
          (order.get(b.studentId) ?? 100000),
      );
    const total = String(c.total).trim() === "" ? NaN : Number(c.total);
    const valid =
      Number.isInteger(total) && total >= students.length && total <= 1000;
    return {
      ...c,
      total: valid ? total : null,
      absent: students.length,
      present: valid ? total - students.length : null,
      students,
      valid,
    };
  });
  const ready =
    classes.length > 0 &&
    classes.every((c) => c.valid && c.confirmed === "yes");
  return {
    classes,
    ready,
    confirmed: classes.filter((c) => c.confirmed === "yes").length,
    total: classes.reduce((sum, c) => sum + (c.total || 0), 0),
    present: classes.reduce((sum, c) => sum + (c.present || 0), 0),
    absent: form.students.length,
  };
}
export function editAbsenceClass(form, className, changes) {
  return {
    ...form,
    classes: form.classes.map((c) =>
      c.className === className ? { ...c, ...changes, confirmed: "" } : c,
    ),
  };
}
export function toggleAbsent(form, student, makeId) {
  const existing = form.students.find(
    (s) => s.studentId && s.studentId === student.studentId,
  );
  return editAbsenceClass(
    {
      ...form,
      students: existing
        ? form.students.filter((s) => s.id !== existing.id)
        : [
            ...form.students,
            {
              id: makeId(),
              studentId: student.studentId,
              student: student.student,
              className: student.className,
            },
          ],
    },
    student.className,
    {},
  );
}
export function validateAbsence(form, validClasses) {
  const errors = [];
  if (!form.classes.length)
    errors.push(["حمّل قائمة الطلبة أولًا.", "Load the student roster first."]);
  const classNames = new Set(form.classes.map((c) => c.className));
  if (
    classNames.size !== form.classes.length ||
    form.classes.some((c) => !validClasses.includes(c.className))
  )
    errors.push(["تحقق من شعب الصف.", "Check the grade's classes."]);
  const summary = absenceSummary(form);
  if (summary.classes.some((c) => !c.valid))
    errors.push([
      "عدد المقيدين يجب ألا يقل عن عدد الغائبين.",
      "Enrollment must be a whole number at least equal to the absent count.",
    ]);
  if (summary.classes.some((c) => c.confirmed !== "yes"))
    errors.push([
      "أكد الغياب في جميع الشعب قبل الحفظ أو التصدير.",
      "Confirm attendance for every class before saving or exporting.",
    ]);
  if (
    form.students.some(
      (s) => !String(s.student || "").trim() || !classNames.has(s.className),
    )
  )
    errors.push([
      "تحقق من أسماء الغائبين وشعبهم.",
      "Check absent students' names and classes.",
    ]);
  const ids = form.students.map((s) => s.studentId).filter(Boolean);
  if (new Set(ids).size !== ids.length)
    errors.push([
      "يوجد طالب مكرر في قائمة الغياب.",
      "A student appears more than once in the absence list.",
    ]);
  return errors;
}
export function absenceReport(form) {
  const summary = absenceSummary(form);
  const date = new Date(`${form.date}T12:00:00`);
  return {
    grade: form.grade,
    date: form.date,
    day: Number.isNaN(date.valueOf())
      ? ""
      : new Intl.DateTimeFormat("ar-KW", { weekday: "long" }).format(date),
    classes: summary.classes.map((c) => ({
      className: c.className,
      total: c.total,
      present: c.present,
      absent: c.absent,
      students: c.students.map((s) => s.student),
    })),
    total: summary.total,
    present: summary.present,
    absent: summary.absent,
  };
}
