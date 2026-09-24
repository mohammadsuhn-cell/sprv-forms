import { chromium, expect } from "@playwright/test";
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import assert from "node:assert/strict";
import { emptyStore, storageKey, arDigits, newForm } from "../src/model.js";
import { fixture, absences, completedForm } from "../tests/absence-fixture.mjs";
const url = "http://127.0.0.1:4325/";
const server = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "preview",
    "--host",
    "127.0.0.1",
    "--port",
    "4325",
    "--strictPort",
  ],
  { stdio: "pipe" },
);
const button = (p, name) => p.getByRole("button", { name, exact: true });
const state = (p) =>
  p.evaluate((key) => JSON.parse(localStorage.getItem(key)), storageKey);
let browser;
try {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(url)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const initial = emptyStore();
  initial.profile.supervisor = "مشرف تجريبي";
  initial.profile.grade = "الصف السابع";
  initial.roster = fixture();
  await ctx.addInitScript(
    ({ key, initial }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(key, JSON.stringify(initial));
      window.drawn = [];
      window.canvases = [];
      window.overflow = [];
      const original = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (
        value,
        x,
        y,
        ...rest
      ) {
        if (this.canvas.width === 2246) {
          if (!window.canvases.includes(this.canvas))
            window.canvases.push(this.canvas);
          window.drawn.push({
            text: String(value),
            x,
            y,
            page: window.canvases.indexOf(this.canvas),
          });
          const w = this.measureText(String(value)).width;
          const left =
            this.textAlign === "center"
              ? x - w / 2
              : this.textAlign === "left"
                ? x
                : x - w;
          if (left < 30 || left + w > 1093 || y > 785 || y < 20)
            window.overflow.push({ value, x, y, w });
        }
        return original.call(this, value, x, y, ...rest);
      };
      const draw = CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage = function (
        source,
        ...args
      ) {
        if (source instanceof HTMLCanvasElement && source.width === 2246)
          window.lastCanvas = source.toDataURL();
        return draw.call(this, source, ...args);
      };
      const toDataURL = HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL = function (...args) {
        const result = toDataURL.apply(this, args);
        if (this.width === 2246 && args[0] === "image/png")
          window.lastPng = result;
        return result;
      };
    },
    { key: storageKey, initial },
  );
  const page = await ctx.newPage(),
    errors = [],
    uploads = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (!["GET", "HEAD"].includes(r.method())) uploads.push(r.url());
  });
  await page.goto(url);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await button(page, "إحصائية الغياب اليومي").click();
  await button(page, "حفظ النموذج").click();
  await expect(page.getByRole("alert")).toContainText("أكد الغياب");
  await page.getByLabel("التاريخ", { exact: true }).fill("2026-09-24");
  for (let c = 0; c < 6; c++) {
    const names = fixture()
      .students.filter((s) => s.className === arDigits(`7/${c + 1}`))
      .slice(0, absences[c]);
    for (const s of names)
      await page.getByRole("checkbox", { name: s.name, exact: true }).check();
    await button(page, "تأكيد الشعبة والمتابعة").click();
  }
  await expect(page.locator(".absence-complete")).toContainText(
    "١٤٠ مقيدًا · ٨٥ حاضرًا · ٥٥ غائبًا",
  );
  const before = (await state(page)).drafts.absence;
  await page.reload();
  await button(page, "إحصائية الغياب اليومي").click();
  assert.deepEqual((await state(page)).drafts.absence, before);
  await button(page, "الشعبة ٧/١").click();
  await page
    .getByRole("checkbox", { name: fixture().students[0].name, exact: true })
    .uncheck();
  assert.equal((await state(page)).drafts.absence.classes[0].confirmed, "");
  await page
    .getByRole("checkbox", { name: fixture().students[0].name, exact: true })
    .check();
  await button(page, "تأكيد الشعبة والمتابعة").click();
  await page.getByLabel("التاريخ", { exact: true }).fill("2026-09-25");
  assert((await state(page)).drafts.absence.classes.every((c) => !c.confirmed));
  await page.getByLabel("التاريخ", { exact: true }).fill("2026-09-24");
  for (let c = 0; c < 6; c++)
    await button(page, "تأكيد الشعبة والمتابعة").click();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  fs.mkdirSync("test-results", { recursive: true });
  await page.screenshot({
    path: "test-results/absence-phone.png",
    fullPage: true,
  });
  await button(page, "حفظ النموذج").click();
  await page.locator(".saved-open").first().click();
  await page.locator(".export-menu summary").click();
  assert.equal(await page.locator(".export-menu button").count(), 1);
  async function exportPdf(path) {
    await page.evaluate(() => {
      window.drawn = [];
      window.canvases = [];
      window.overflow = [];
    });
    await button(page, "PDF").click();
    await expect(button(page, "تنزيل الملف")).toBeVisible({ timeout: 60000 });
    const pending = page.waitForEvent("download");
    await button(page, "تنزيل الملف").click();
    await (await pending).saveAs(path);
    assert.deepEqual(await page.evaluate(() => window.overflow), []);
    return page.evaluate(() => window.drawn);
  }
  const drawn = await exportPdf("test-results/absence-sheet.pdf");
  const png = await page.evaluate(() => window.lastPng);
  fs.writeFileSync(
    "test-results/absence-sheet.png",
    Buffer.from(png.split(",")[1], "base64"),
  );
  for (const s of before.students)
    assert(
      drawn.some((d) => d.text === s.student),
      s.student,
    );
  const heads = drawn.filter((d) => d.text.startsWith("الشعبة "));
  assert.equal(heads.length, 6);
  assert(heads[0].x > heads[5].x);
  assert(drawn.some((d) => d.text === "إجمالي الغياب: ٥٥"));
  assert(drawn.some((d) => d.text === "إجمالي الحضور: ٨٥"));
  assert.equal(new Set(drawn.map((d) => d.page)).size, 1);
  const pdfInfo = execFileSync("pdfinfo", ["test-results/absence-sheet.pdf"], {
    encoding: "utf8",
  });
  assert.match(pdfInfo, /Pages:\s+1/);
  assert.match(pdfInfo, /A4/);
  // Long names/large absence lists continue with no missing names and totals only at the end.
  const long = completedForm();
  long.students = long.roll.map((s, i) => ({
    ...s,
    student: `عبدالرحمن عبدالله محمد طالب تجريبي برقم ${arDigits(i + 1)}`,
  }));
  await page.evaluate(
    ({ key, long }) => {
      const v = JSON.parse(localStorage.getItem(key));
      v.drafts.absence = long;
      localStorage.setItem(key, JSON.stringify(v));
    },
    { key: storageKey, long },
  );
  await page.reload();
  await button(page, "إحصائية الغياب اليومي").click();
  await page.locator(".export-menu summary").click();
  const longDrawn = await exportPdf("test-results/absence-long.pdf");
  assert(new Set(longDrawn.map((d) => d.page)).size > 1);
  // Each unique numbered suffix is drawn once, including the final student in every column.
  for (let i = 0; i < 140; i++)
    assert.equal(
      longDrawn.filter((d) => d.text.endsWith(`برقم ${arDigits(i + 1)}`))
        .length,
      1,
      `name ${i + 1}`,
    );
  assert.equal(
    longDrawn.filter((d) => d.text === "إجمالي الغياب: ١٤٠").length,
    1,
  );
  await button(page, "إغلاق خيارات الملف").click();
  // New means genuinely empty, historical sheet remains saved.
  page.once("dialog", (d) => d.accept());
  await button(page, "جديد").click();
  assert.equal((await state(page)).drafts.absence.students.length, 0);
  assert.equal((await state(page)).saved[0].students.length, 55);
  // A manually added missing name and enrollment correction survive persistence.
  await page.locator(".absence-adjustments summary").click();
  await page
    .getByLabel("اسم غير موجود في القائمة", { exact: true })
    .fill("طالب مضاف يدويًا");
  await button(page, "إضافة للغائبين").click();
  await page.getByLabel("عدد المقيدين", { exact: true }).fill("24");
  await button(page, "تأكيد الشعبة والمتابعة").click();
  assert.equal((await state(page)).drafts.absence.classes[0].total, "24");
  assert.equal(
    (await state(page)).drafts.absence.students[0].student,
    "طالب مضاف يدويًا",
  );
  await button(page, "EN").click();
  await expect(
    page.getByRole("heading", { name: "Daily absence sheet", exact: true }),
  ).toBeVisible();
  // Grades with ten classes split into balanced groups, including zero absence.
  const eightRoster = {
    ...fixture(),
    students: Array.from({ length: 10 }, (_, i) => ({
      id: `grade-eight-${i}`,
      name: `طالب اختبار ${arDigits(i + 1)}`,
      grade: "الصف الثامن",
      className: arDigits(`8/${i + 1}`),
      order: i,
    })),
  };
  const eight = newForm(
    "absence",
    { supervisor: "مشرف تجريبي", grade: "الصف الثامن" },
    eightRoster,
  );
  eight.classes.forEach((c) => (c.confirmed = "yes"));
  await page.evaluate(
    ({ key, eight }) => {
      const v = JSON.parse(localStorage.getItem(key));
      v.lang = "ar";
      v.drafts.absence = eight;
      localStorage.setItem(key, JSON.stringify(v));
    },
    { key: storageKey, eight },
  );
  await page.reload();
  await button(page, "إحصائية الغياب اليومي").click();
  await ctx.setOffline(true);
  await page.locator(".export-menu summary").click();
  const tenDrawn = await exportPdf("test-results/absence-ten-classes.pdf");
  assert.equal(new Set(tenDrawn.map((d) => d.page)).size, 2);
  assert.equal(tenDrawn.filter((d) => d.text.startsWith("الشعبة ")).length, 10);
  assert.equal(tenDrawn.filter((d) => d.text === "إجمالي الغياب: ٠").length, 1);
  assert.equal(
    tenDrawn.filter((d) => d.text === "إجمالي المقيدين: ١٠").length,
    1,
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(uploads, []);
  console.log(
    "Absence sheet: six-class phone checklist, confirmations, date reset, persistence, saved history, PDF names/totals/RTL, long-list pagination, manual enrollment, English, no uploads: passed.",
  );
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
