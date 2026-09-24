// Private roster data is imported on the device, never bundled with the site.
export const rosterFormat = "sprv-roster";
const gradeNames = ["الصف السادس", "الصف السابع", "الصف الثامن", "الصف التاسع"];
export const normalizeSearch = (value) =>
  String(value ?? "")
    .normalize("NFKC")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .toLocaleLowerCase()
    .trim();
const digits = (value) =>
  String(value).replace(/[٠-٩]/g, (c) => "٠١٢٣٤٥٦٧٨٩".indexOf(c));
export function validateRoster(value) {
  if (
    !value ||
    value.format !== rosterFormat ||
    value.version !== 1 ||
    !Array.isArray(value.students) ||
    !value.students.length ||
    value.students.length > 3000
  )
    throw Error("Invalid roster");
  for (const key of ["school", "year"])
    if (
      typeof value[key] !== "string" ||
      !value[key].trim() ||
      value[key].length > 250
    )
      throw Error("Invalid roster identity");
  const ids = new Set();
  const students = value.students.map((s, index) => {
    if (
      !s ||
      ["id", "name", "grade", "className"].some(
        (k) => typeof s[k] !== "string" || !s[k].trim() || s[k].length > 250,
      )
    )
      throw Error("Invalid student");
    const grade = gradeNames.indexOf(s.grade) + 6;
    const match = digits(s.className).match(/^(\d)\/(\d{1,2})$/);
    if (
      grade < 6 ||
      !match ||
      Number(match[1]) !== grade ||
      Number(match[2]) < 1 ||
      Number(match[2]) > (grade === 7 ? 6 : 10) ||
      ids.has(s.id)
    )
      throw Error("Invalid class or duplicate ID");
    ids.add(s.id);
    return {
      id: s.id,
      name: s.name.trim(),
      grade: s.grade,
      className: digits(s.className).replace(/\d/g, (c) => "٠١٢٣٤٥٦٧٨٩"[c]),
      order: Number.isInteger(s.order) && s.order >= 0 ? s.order : index,
    };
  });
  return {
    format: rosterFormat,
    version: 1,
    school: value.school.trim(),
    year: value.year.trim(),
    students,
  };
}
export const rosterGrades = (roster) =>
  gradeNames.filter((g) => roster?.students.some((s) => s.grade === g));
export const rosterClasses = (roster, grade) =>
  [
    ...new Set(
      (roster?.students || [])
        .filter((s) => !grade || s.grade === grade)
        .map((s) => s.className),
    ),
  ].sort((a, b) => digits(a).localeCompare(digits(b), "en", { numeric: true }));
export const classStudents = (roster, grade, className) =>
  (roster?.students || [])
    .filter((s) => s.grade === grade && s.className === className)
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "ar"));
export const matchesStudent = (student, query) =>
  normalizeSearch(student.name).includes(normalizeSearch(query));
export function toggleLateStudent(form, student, makeId) {
  const existing = form.students.find((s) => s.studentId === student.id);
  return {
    ...form,
    students: existing
      ? form.students.filter((s) => s.id !== existing.id)
      : [
          ...form.students,
          {
            id: makeId(),
            studentId: student.id,
            student: student.name,
            className: student.className,
            arrival: "",
            reason: "",
            action: "",
          },
        ],
  };
}
