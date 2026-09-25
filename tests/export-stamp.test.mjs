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
