// Older cases keep their single student at the top level. New group cases
// retain that first-student projection for existing integrations.
export const maxCaseStudents = 100;
export function caseParticipants(form) {
  return (
    form.participants || [
      {
        id: form.id,
        student: form.student || "",
        studentId: form.studentId || "",
        className: form.className || "",
        actionMode: "shared",
      },
    ]
  );
}

export function withCaseParticipants(form, participants) {
  const first = participants[0];
  return {
    ...form,
    participants,
    student: first.student,
    studentId: first.studentId || "",
    className: first.className,
  };
}

export const participantAction = (form, student) =>
  student.actionMode === "individual" ? student : form;
export const caseStudentNames = (form) =>
  caseParticipants(form)
    .map((s) => s.student)
    .filter(Boolean)
    .join("، ");
export const caseClassNames = (form) =>
  [
    ...new Set(
      caseParticipants(form)
        .map((s) => s.className)
        .filter(Boolean),
    ),
  ].join("، ");

export function validateParticipants(form) {
  if (form.participants === undefined) return;
  const rows = form.participants;
  if (!Array.isArray(rows) || !rows.length || rows.length > maxCaseStudents)
    throw Error("Invalid case students");
  const keys = [
    "id",
    "student",
    "studentId",
    "className",
    "actionMode",
    "action",
    "actionState",
  ];
  for (const row of rows) {
    if (
      !row ||
      typeof row !== "object" ||
      ["id", "student", "className"].some(
        (key) => typeof row[key] !== "string",
      ) ||
      !row.id ||
      Object.entries(row).some(
        ([key, value]) => !keys.includes(key) || typeof value !== "string",
      ) ||
      !["shared", "individual"].includes(row.actionMode)
    )
      throw Error("Invalid case student");
  }
  if (new Set(rows.map((r) => r.id)).size !== rows.length)
    throw Error("Duplicate case student rows");
  const first = rows[0];
  if (
    form.student !== first.student ||
    form.className !== first.className ||
    (form.studentId || "") !== (first.studentId || "")
  )
    throw Error("Inconsistent case student");
}

const normalized = (value) =>
  String(value || "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ");
const classKey = (value) =>
  normalized(value)
    .replace(/[٠-٩]/g, (c) => "٠١٢٣٤٥٦٧٨٩".indexOf(c))
    .replace(/[\\-]/g, "/")
    .replace(/\s/g, "");
export function duplicateCaseStudent(rows) {
  return rows.some((row, index) =>
    rows
      .slice(0, index)
      .some((previous) =>
        row.studentId && previous.studentId
          ? row.studentId === previous.studentId
          : normalized(row.student) &&
            normalized(row.student) === normalized(previous.student) &&
            classKey(row.className) === classKey(previous.className),
      ),
  );
}
