import test from "node:test";
import assert from "node:assert/strict";
import { authoringKey, loadAuthoringRoster } from "../src/authoring.js";
import { storageKey, grades } from "../src/model.js";

test("general authoring is isolated while the ordinary workspace retains its key", () => {
  const account = {
    serverId: "school",
    supervisor: { id: "general", role: "general" },
  };
  assert.notEqual(authoringKey(account), storageKey);
  assert.notEqual(
    authoringKey(account),
    authoringKey({ ...account, serverId: "another-school" }),
  );
  assert.equal(
    authoringKey({ supervisor: { role: "supervisor" } }),
    storageKey,
  );
  assert.equal(authoringKey(null), storageKey);
});

test("authoring requires a complete roster snapshot and retains canonical student IDs", async () => {
  const students = [
    { id: "eight", name: "طالب ثامن", className: "٨ / ١" },
    { id: "seven", name: "طالب سابع", className: "7/1", archived: true },
  ];
  const roster = await loadAuthoringRoster(async (_, params) =>
    params.cursor
      ? {
          students: students.slice(1),
          total: 2,
          nextOffset: null,
          nextCursor: null,
        }
      : {
          students: students.slice(0, 1),
          total: 2,
          nextOffset: 1,
          nextCursor: "next",
        },
  );
  assert.equal(roster.students.length, 1);
  assert.equal(roster.students[0].id, "eight");
  assert.equal(roster.students[0].grade, grades[2]);
  for (const page of [
    { students, total: 3, nextOffset: null },
    { students: [students[0], students[0]], total: 2, nextOffset: null },
    { students, total: 4, nextOffset: 2 },
  ])
    await assert.rejects(() => loadAuthoringRoster(async () => page));
});
