import { chromium, expect } from "@playwright/test";
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { storageKey, newForm } from "../src/model.js";
import { dailyFixture } from "../tests/daily-fixture.mjs";

const url = "http://127.0.0.1:4326/";
const server = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "preview",
    "--host",
    "127.0.0.1",
    "--port",
    "4326",
    "--strictPort",
  ],
  { stdio: "pipe" },
);
const button = (page, name) => page.getByRole("button", { name, exact: true });
const state = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)), storageKey);
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
  const { store, date } = dailyFixture();
  await ctx.addInitScript(
    ({ key, store }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(key, JSON.stringify(store));
      window.exportLines = [];
      const fillText = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (value, ...args) {
        window.exportLines.push(String(value));
        return fillText.call(this, value, ...args);
      };
    },
    { key: storageKey, store },
  );
  const page = await ctx.newPage(),
    errors = [],
    uploads = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (!["GET", "HEAD"].includes(r.method())) uploads.push(r.url());
  });
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto(url);
  await button(page, "الموجز اليومي").click();
  await page.getByLabel("التاريخ", { exact: true }).fill(date);
  await expect(page.locator(".brief-attendance tbody tr")).toHaveCount(6);
  await expect(page.locator(".brief-attendance tfoot")).toContainText("١٤٠");
  assert.equal((await state(page)).drafts.daily.summary.late, 3);
  assert.equal((await state(page)).drafts.daily.summary.cases, 2);
  assert(!(await page.locator("main").innerText()).includes("طالب تجريبي"));
  await page
    .getByLabel("الأعطال والإصلاحات (اختياري)")
    .fill("تعطل تكييف الفصل ٧/٢، تم إبلاغ الصيانة.");
  fs.mkdirSync("test-results", { recursive: true });
  await page.screenshot({
    path: "test-results/daily-phone.png",
    fullPage: true,
  });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await button(page, "حفظ النموذج").click();
  const savedBrief = (await state(page)).saved.find((s) => s.kind === "daily");
  await button(page, "النماذج").click();
  await button(page, "الموجز اليومي").click();
  await page.getByText("تصدير", { exact: true }).click();
  for (const [label, ext] of [
    ["PDF", "pdf"],
    ["Word", "docx"],
    ["XLSX", "xlsx"],
  ]) {
    await button(page, label).click();
    const downloaded = page.waitForEvent("download");
    await button(page, "تنزيل الملف").click();
    await (await downloaded).saveAs(`test-results/linked-daily.${ext}`);
    await button(page, "إغلاق خيارات الملف").click();
    await page.locator(".export-menu summary").click();
  }
  const word = execFileSync(
    "unzip",
    ["-p", "test-results/linked-daily.docx", "word/document.xml"],
    { encoding: "utf8" },
  );
  const book = new ExcelJS.Workbook();
  await book.xlsx.readFile("test-results/linked-daily.xlsx");
  const texts = [
    word,
    JSON.stringify(book.model),
    (await page.evaluate(() => window.exportLines)).join(" "),
  ];
  for (const text of texts) {
    for (const token of [
      "١٤٠",
      "٨٥",
      "٥٥",
      "الحالات المسجلة",
      "المعلمون والاحتياط",
      "تعطل تكييف الفصل",
    ])
      assert(text.includes(token), token);
    for (const token of ["طالب تجريبي", "وصف خاص", "بديل جديد"])
      assert(!text.includes(token), token);
  }
  const pdfInfo = execFileSync("pdfinfo", ["test-results/linked-daily.pdf"], {
    encoding: "utf8",
  });
  const pages = Number(pdfInfo.match(/Pages:\s+(\d+)/)[1]);
  console.log(`Daily PDF pages: ${pages}`);
  assert.equal(pages, 1, "The standard six-class brief fits one A4 page");

  // Correct the saved sources and reopen. The issued snapshot remains fixed.
  await page.evaluate((key) => {
    const data = JSON.parse(localStorage.getItem(key));
    const absence = data.saved.find((s) => s.kind === "absence");
    absence.students.shift();
    absence.savedAt = "2026-09-24T11:00:00Z";
    const index = data.saved.findIndex((s) => s.kind === "case");
    data.saved.splice(index, 1);
    localStorage.setItem(key, JSON.stringify(data));
  }, storageKey);
  await page.reload();
  await button(page, "الموجز اليومي").click();
  assert.deepEqual((await state(page)).drafts.daily, savedBrief);
  await expect(
    page.getByText("توجد بيانات أحدث", { exact: true }),
  ).toBeVisible();
  await button(page, "تحديث من السجلات").click();
  const refreshed = await state(page);
  assert.equal(refreshed.drafts.daily.summary.cases, 1);
  assert.equal(
    refreshed.drafts.daily.summary.attendance.reduce(
      (sum, row) => sum + row.absent,
      0,
    ),
    54,
  );
  assert.deepEqual(
    refreshed.saved.find((s) => s.id === savedBrief.id),
    savedBrief,
  );
  assert.equal(refreshed.drafts.daily.repairs, savedBrief.repairs);
  await page.getByLabel("التاريخ", { exact: true }).fill("2026-09-25");
  assert.equal((await state(page)).drafts.daily.summary.late, null);
  await button(page, "تأكيد عدم وجود متأخرين").click();
  assert.equal((await state(page)).drafts.daily.lateZero, "yes");
  await page.getByLabel("الصف", { exact: true }).selectOption("الصف الثامن");
  assert.equal((await state(page)).drafts.daily.lateZero, "");
  await button(page, "EN").click();
  await expect(
    page.getByRole("heading", { name: "Student attendance", exact: true }),
  ).toBeVisible();
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );

  // Existing manual briefs retain editable fields and historical names.
  const legacy = newForm("daily", store.profile);
  for (const key of [
    "dailyMode",
    "summary",
    "repairs",
    "grade",
    "lateZero",
    "staffZero",
  ])
    delete legacy[key];
  legacy.attendance[0] = {
    ...legacy.attendance[0],
    className: "٧/١",
    present: "20",
    absent: "3",
    lateCount: "2",
    lateNames: "اسم قديم محفوظ",
  };
  await page.evaluate(
    ({ key, legacy }) => {
      const data = JSON.parse(localStorage.getItem(key));
      data.drafts.daily = legacy;
      data.lang = "ar";
      localStorage.setItem(key, JSON.stringify(data));
    },
    { key: storageKey, legacy },
  );
  await page.reload();
  await button(page, "الموجز اليومي").click();
  await expect(page.getByLabel("الحاضرون", { exact: true })).toHaveValue("20");
  assert.equal(
    (await state(page)).drafts.daily.attendance[0].lateNames,
    "اسم قديم محفوظ",
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(uploads, []);
  console.log(
    "PASS: local aggregation, class totals, counts-only exports, snapshot refresh, scope changes, zero confirmation, Arabic/English phone layout and legacy briefs",
  );
} finally {
  await browser?.close();
  server.kill();
}
