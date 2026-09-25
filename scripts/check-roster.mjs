import { chromium, expect } from "@playwright/test";
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { schoolIdentity, storageKey, arDigits } from "../src/model.js";
const url = "http://127.0.0.1:4323/";
const server = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "preview",
    "--host",
    "127.0.0.1",
    "--port",
    "4323",
    "--strictPort",
  ],
  { stdio: "pipe" },
);
const fixture = {
  format: "sprv-roster",
  version: 1,
  ...schoolIdentity,
  students: Array.from({ length: 140 }, (_, i) => ({
    id: `synthetic-${i}`,
    name: `أحمد طالب تجريبي رقم ${i + 1}`,
    grade: "الصف السابع",
    className: arDigits(`7/${(i % 6) + 1}`),
    order: i,
  })),
};
const errors = [],
  uploads = [];
const button = (page, name) => page.getByRole("button", { name, exact: true });
const state = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)), storageKey);
const file = (value) => ({
  name: "synthetic-roster.json",
  mimeType: "application/json",
  buffer: Buffer.from(JSON.stringify(value)),
});
async function importRoster(page, value, accept = true) {
  const dialog = page.waitForEvent("dialog");
  await page
    .getByLabel("ملف قائمة الطلبة", { exact: true })
    .setInputFiles(file(value));
  await (await dialog)[accept ? "accept" : "dismiss"]();
}
async function download(page, name, output) {
  const pending = page.waitForEvent("download", { timeout: 60000 });
  await button(page, name).click();
  if (["PDF", "Word", "XLSX"].includes(name)) {
    await button(page, "تنزيل الملف").click();
    await button(page, "إغلاق خيارات الملف").click();
    await page.locator(".export-menu summary").click();
  }
  const result = await pending;
  assert.equal(await result.failure(), null);
  await result.saveAs(output);
}
let browser;
try {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(url)).ok) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await ctx.addInitScript(() => {
    window.drawn = [];
    const draw = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (text, ...args) {
      window.drawn.push(String(text));
      return draw.call(this, text, ...args);
    };
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (!["GET", "HEAD"].includes(r.method())) uploads.push(r.url());
  });
  await page.goto(url);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await button(page, "الطلبة المتأخرون").click();
  await button(page, "الإعدادات").click();
  await page.getByLabel("اسم المشرف", { exact: true }).fill("مشرف التجربة");
  // Invalid imports and cancellation do not erase drafts or install a roster.
  await page
    .getByLabel("ملف قائمة الطلبة", { exact: true })
    .setInputFiles(file({ bad: true }));
  await expect(page.locator(".toast")).toHaveText("الملف ليس قائمة طلبة صالحة");
  await page
    .getByLabel("ملف قائمة الطلبة", { exact: true })
    .setInputFiles(file({ ...fixture, year: "wrong year" }));
  await expect(page.locator(".toast")).toContainText("عامًا دراسيًا مختلفًا");
  await importRoster(page, fixture, false);
  assert.equal((await state(page)).roster, null);
  await importRoster(page, fixture);
  await expect(page.locator(".toast")).toHaveText(
    "تم حفظ قائمة الطلبة على هذا الجهاز",
  );
  assert.equal((await state(page)).roster.students.length, 140);
  assert.equal((await state(page)).drafts.late.rosterMode, "yes");
  await button(page, "النماذج").click();
  await button(page, "الطلبة المتأخرون").click();
  await expect(page.getByLabel("الصف", { exact: true })).toHaveValue(
    "الصف السابع",
  );
  await expect(page.locator(".roster-student")).toHaveCount(24);
  for (const i of [0, 6, 12, 18, 24, 30, 36, 42, 48, 54, 60, 66])
    await page
      .getByRole("checkbox", { name: fixture.students[i].name, exact: true })
      .check();
  await button(page, "الشعبة التالية").click();
  await expect(page.getByLabel("الشعبة", { exact: true })).toHaveValue("٧/٢");
  await button(page, "الشعبة السابقة").click();
  await expect(
    page.getByRole("checkbox", { name: fixture.students[0].name, exact: true }),
  ).toBeChecked();
  await page.getByLabel("الشعبة", { exact: true }).selectOption("٧/٢");
  await page
    .getByRole("checkbox", { name: fixture.students[1].name, exact: true })
    .check();
  assert.equal((await state(page)).drafts.late.students.length, 13);
  assert.equal((await state(page)).drafts.late.students[0].className, "٧/١");
  await page
    .getByLabel("بحث في أسماء الشعبة", { exact: true })
    .fill("احمد طالب تجريبي رقم 2");
  await expect(
    page.getByRole("checkbox", { name: fixture.students[1].name, exact: true }),
  ).toBeChecked();
  await page.getByLabel("المحددون فقط", { exact: true }).check();
  await expect(page.locator(".roster-student")).toHaveCount(1);
  await page.reload();
  await button(page, "الطلبة المتأخرون").click();
  await expect(
    page.getByRole("checkbox", { name: fixture.students[1].name, exact: true }),
  ).toBeChecked();
  await button(page, "إضافة اسم غير موجود").click();
  await page.getByLabel("اسم الطالب", { exact: true }).fill("طالب يدوي إضافي");
  await button(page, "إضافة إلى المتأخرين").click();
  await expect(
    page.getByRole("checkbox", { name: "طالب يدوي إضافي", exact: true }),
  ).toBeChecked();
  assert.equal((await state(page)).drafts.late.students.length, 14);
  await button(page, "إضافة اسم غير موجود").click();
  await page.getByLabel("اسم الطالب", { exact: true }).fill("طالب يدوي إضافي");
  await expect(button(page, "إضافة إلى المتأخرين")).toBeDisabled();
  await button(page, "إضافة اسم غير موجود").click();
  await page
    .getByText("مراجعة المحددين وتفاصيل التأخر", { exact: false })
    .click();
  const first = page.locator(".selected-details .entry").first();
  await first.locator("summary").click();
  await first.getByLabel("وقت الوصول (اختياري)", { exact: true }).fill("07:45");
  await button(page, "عرض الشعبة ٧/١").click();
  page.once("dialog", (d) => d.dismiss());
  await page
    .getByRole("checkbox", { name: fixture.students[0].name, exact: true })
    .click();
  await expect(
    page.getByRole("checkbox", { name: fixture.students[0].name, exact: true }),
  ).toBeChecked();
  await page.locator(".roster-grade summary").click();
  page.once("dialog", (d) => d.dismiss());
  await page.getByLabel("الصف", { exact: true }).selectOption("الصف الثامن");
  await expect(page.getByLabel("الصف", { exact: true })).toHaveValue(
    "الصف السابع",
  );
  assert.equal((await state(page)).drafts.late.students.length, 14);
  await button(page, "حفظ النموذج").click();
  await page.locator(".saved-open").click();
  await page.getByText("تصدير", { exact: true }).click();
  fs.mkdirSync("test-results", { recursive: true });
  for (const [name, ext] of [
    ["PDF", "pdf"],
    ["Word", "docx"],
    ["XLSX", "xlsx"],
  ])
    await download(page, name, `test-results/roster-late.${ext}`);
  const drawn = await page.evaluate(() => window.drawn.join("\n"));
  for (const name of [
    fixture.students[0].name,
    fixture.students[1].name,
    "طالب يدوي إضافي",
    "٧/١",
    "٧/٢",
  ])
    assert(drawn.includes(name), `PDF missing ${name}`);
  assert(!drawn.includes(fixture.students[139].name));
  const xml = execFileSync(
    "unzip",
    ["-p", "test-results/roster-late.docx", "word/document.xml"],
    { encoding: "utf8" },
  );
  for (const text of [
    fixture.students[0].name,
    "٧/١",
    "٧/٢",
    "طالب يدوي إضافي",
  ])
    assert(xml.includes(text));
  assert(!xml.includes(fixture.students[139].name));
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile("test-results/roster-late.xlsx");
  const bookText = JSON.stringify(wb.model);
  assert(bookText.includes("الشعبة"));
  assert(bookText.includes("طالب يدوي إضافي"));
  assert(!bookText.includes(fixture.students[139].name));
  // A roster correction/transfer does not rewrite a report saved earlier.
  await button(page, "الإعدادات").click();
  const updated = structuredClone(fixture);
  updated.students[0].name = "اسم تجريبي محدث";
  updated.students[0].className = "٧/٢";
  await importRoster(page, updated);
  assert.equal(
    (await state(page)).saved[0].students[0].student,
    fixture.students[0].name,
  );
  assert.equal((await state(page)).saved[0].students[0].className, "٧/١");
  await button(page, "النماذج").click();
  await button(page, "تسجيل حالة").click();
  await page.getByLabel("اسم الطالب", { exact: true }).fill("اسم تجريبي محدث");
  await page
    .locator(".student-results button")
    .filter({ hasText: "اسم تجريبي محدث" })
    .click();
  await expect(page.getByLabel("الشعبة", { exact: true })).toHaveValue("٧/٢");
  assert.equal(
    (await state(page)).drafts.case.studentId,
    fixture.students[0].id,
  );
  await button(page, "حفظ الحالة").click();
  await button(page, "النماذج").click();
  await button(page, "الموجز اليومي").click();
  await expect(page.getByLabel("الصف", { exact: true })).toHaveValue(
    "الصف السابع",
  );
  await expect(page.locator(".brief-attendance tbody tr")).toHaveCount(6);
  assert.equal((await state(page)).drafts.daily.summary.cases, 1);
  await button(page, "الإعدادات").click();
  await download(
    page,
    "تنزيل نسخة احتياطية",
    "test-results/roster-backup.json",
  );
  const backup = JSON.parse(
    fs.readFileSync("test-results/roster-backup.json", "utf8"),
  );
  assert.equal(backup.roster.students.length, 140);
  const fresh = await browser.newContext();
  const restored = await fresh.newPage();
  await restored.goto(url);
  await button(restored, "الإعدادات").click();
  const restoreDialog = restored.waitForEvent("dialog");
  await restored
    .getByLabel("ملف النسخة الاحتياطية", { exact: true })
    .setInputFiles("test-results/roster-backup.json");
  await (await restoreDialog).accept();
  await expect(restored.locator(".toast")).toHaveText("تمت الاستعادة");
  assert.equal((await state(restored)).roster.students.length, 140);
  assert.equal((await state(restored)).saved.length, 2);
  await fresh.close();
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller);
  await ctx.setOffline(true);
  await page.reload();
  await button(page, "الطلبة المتأخرون").click();
  assert.equal((await state(page)).drafts.late.students.length, 14);
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({
    path: "test-results/roster-phone.png",
    fullPage: true,
  });
  await button(page, "EN").click();
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await ctx.setOffline(false);
  await button(page, "Settings").click();
  page.once("dialog", (d) => d.accept());
  await button(page, "Remove roster").click();
  assert.equal((await state(page)).roster, null);
  assert.equal((await state(page)).saved.length, 2);
  await button(page, "Forms").click();
  await button(page, "Late students").click();
  await expect(
    page.getByRole("checkbox", { name: fixture.students[0].name, exact: true }),
  ).toBeChecked();
  assert.deepEqual(errors, []);
  assert.deepEqual(uploads, []);
  console.log(
    "PASS: private 140-student import, validation/cancellation, 6 classes, cross-class ticking, Arabic search, manual names, details and grade confirmations, saved history, case lookup, class dropdowns, selected-only PDF/Word/Excel, backup/restore, roster update/removal, offline mobile and no uploads.",
  );
} finally {
  await browser?.close();
  server.kill();
}
