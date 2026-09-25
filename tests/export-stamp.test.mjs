import test from "node:test";
import assert from "node:assert/strict";
import { exportStamp } from "../src/export-stamp.js";

test("export timestamps use Kuwait time across UTC midnight and normalize supervisor whitespace", () => {
  const stamp = exportStamp(
    "  مشرف\nتجريبي  ",
    new Date("2026-09-24T22:04:05Z"),
  );
  assert.equal(stamp.name, "اسم المشرف: مشرف تجريبي");
  assert.equal(
    stamp.generated,
    "تاريخ التصدير: ٢٠٢٦/٠٩/٢٥ · ٠١:٠٤:٠٥ (الكويت)",
  );
  assert.equal(stamp.text, `${stamp.name} | ${stamp.generated}`);
});

test("late-student headers distinguish attendance date from the fixed issuance timestamp", async () => {
  const { reportHeader } = await import("../src/export-style.js");
  const { newForm, report } = await import("../src/model.js");
  const form = newForm("late", { supervisor: "مشرف تجريبي" });
  form.date = "2026-09-24";
  const stamp = exportStamp(form.supervisor, new Date("2026-09-24T22:04:05Z"));
  const header = reportHeader(report(form), stamp);
  assert(header.left.includes("اليوم: الخميس"));
  assert(header.left.some((line) => line.includes("٢٤/٠٩/٢٠٢٦")));
  assert.equal(
    header.issued,
    "تاريخ ووقت إصدار الكشف: ٢٠٢٦/٠٩/٢٥ · ٠١:٠٤:٠٥ (الكويت)",
  );
  assert.equal(reportHeader(report(newForm("case")), stamp).issued, "");
});
