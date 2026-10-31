import { storageKey, grades, schoolIdentity } from "./model.js";
import { validateRoster } from "./roster.js";

export const authoringKey = (connection) =>
  connection?.supervisor.role === "general"
    ? `${storageKey}:general:${connection.serverId}:${connection.supervisor.id}`
    : storageKey;

export async function loadAuthoringRoster(read) {
  const students = [];
  let cursor;
  const seen = new Set();
  let total;
  const ids = new Set();
  do {
    const page = await read("students", cursor ? { cursor } : {});
    if (
      !Array.isArray(page.students) ||
      !Number.isSafeInteger(page.total) ||
      page.total < 0 ||
      (total !== undefined && total !== page.total)
    )
      throw Error("Incomplete roster");
    total = page.total;
    for (const student of page.students) {
      if (ids.has(student.id)) throw Error("Duplicate roster student");
      ids.add(student.id);
    }
    students.push(...page.students.filter((s) => !s.archived));
    cursor = page.nextCursor;
    if (page.nextOffset !== null && !cursor) throw Error("Incomplete roster");
    if (cursor && seen.has(cursor)) throw Error("Invalid roster page");
    if (cursor) seen.add(cursor);
  } while (cursor);
  if (ids.size !== total) throw Error("Incomplete roster");
  return validateRoster({
    format: "sprv-roster",
    version: 1,
    ...schoolIdentity,
    students: students.map((s) => {
      const className = s.className
        .replace(/[٠-٩]/g, (c) => "٠١٢٣٤٥٦٧٨٩".indexOf(c))
        .replace(/\s/g, "")
        .replace(/[\\-]/g, "/");
      return {
        id: s.id,
        name: s.name,
        className,
        grade: grades[Number(className[0]) - 6],
      };
    }),
  });
}
