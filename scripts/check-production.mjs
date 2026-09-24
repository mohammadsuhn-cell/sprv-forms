import { chromium } from "@playwright/test";
import { spawn, execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import fs from "node:fs";
import ExcelJS from "exceljs";
import {
  newForm,
  newRow,
  groups,
  emptyStore,
  storageKey,
} from "../src/model.js";
async function downloadPrepared(page) {
  const en = (await page.locator("html").getAttribute("lang")) === "en";
  await page
    .getByRole("button", {
      name: en ? "Download file" : "تنزيل الملف",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", {
      name: en ? "Close file options" : "إغلاق خيارات الملف",
      exact: true,
    })
    .click();
  const menu = page.locator(".export-menu");
  if (await menu.count()) await menu.locator("summary").click();
}
fs.mkdirSync("test-results", { recursive: true });
const server = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "preview",
    "--host",
    "127.0.0.1",
    "--port",
    "4320",
  ],
  { stdio: "pipe" },
);
let browser;
try {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch("http://127.0.0.1:4320")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }
  browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    acceptDownloads: true,
  });
  const state = emptyStore();
  state.profile = {
    school: "مدرسة الاختبار",
    supervisor: "مشرف تجريبي",
    year: "٢٠٢٦/٢٠٢٧",
  };
  for (const kind of ["daily", "cases"]) {
    const v = newForm(kind, state.profile);
    for (const g of groups[kind])
      v[g.key] = Array.from({ length: kind === "cases" ? 18 : 1 }, (_, i) => {
        const r = newRow(g);
        for (const f of g.fields)
          r[f.key] =
            f.kind === "date"
              ? "2026-09-24"
              : f.kind === "number"
                ? "0"
                : f.kind === "select"
                  ? f.options[1]
                  : f.kind === "textarea"
                    ? `تفاصيل الحالة التجريبية ${i + 1} ومتابعة الطالب. `.repeat(
                        4,
                      )
                    : `بيان تجريبي ${i + 1}`;
        return r;
      });
    state.drafts[kind] = v;
  }
  await ctx.addInitScript(
    ({ key, value }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(key, JSON.stringify(value));
      window.drawnLines = [];
      const draw = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (text, ...args) {
        window.drawnLines.push(String(text));
        return draw.call(this, text, ...args);
      };
    },
    { key: storageKey, value: state },
  );
  const page = await ctx.newPage(),
    errors = [],
    uploads = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (!["GET", "HEAD"].includes(r.method())) uploads.push(r.url());
  });
  await page.goto("http://127.0.0.1:4320/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller);
  assert.equal(await page.locator(".form-card").count(), 4);
  assert.equal(
    await page.getByText("التقرير اليومي للإشراف", { exact: true }).count(),
    0,
  );
  await page.getByRole("button", { name: "تسجيل حالة", exact: true }).click();
  assert.equal(
    await page.locator("input:visible,select:visible,textarea:visible").count(),
    6,
  );
  await page
    .getByLabel("اسم الطالب", { exact: true })
    .fill("عبدالرحمن عبدالله طالب تجريبي");
  await page.getByLabel("الشعبة", { exact: true }).fill("٧/٢");
  await page
    .getByLabel("نوع الواقعة", { exact: true })
    .selectOption("التأخر عن الحصة");
  await page
    .getByLabel("الإجراء المتخذ", { exact: true })
    .selectOption("إنذار أول");
  await page
    .getByLabel("موعد المتابعة (اختياري)", { exact: true })
    .fill("2026-09-24");
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({
    path: "test-results/simple-phone.png",
    fullPage: true,
  });
  await page.getByText("تفاصيل إضافية", { exact: true }).click();
  await page
    .getByLabel("وصف الواقعة", { exact: true })
    .fill(
      "تأخر الطالب عن الحصة الأولى. تم التواصل مع ولي الأمر لمتابعة الانتظام. الشعبة ٧/٢، الموعد 09:00.",
    );
  await page
    .getByLabel("حالة الإجراء", { exact: true })
    .selectOption("مخطط للتنفيذ");
  await page.getByRole("button", { name: "حفظ الحالة", exact: true }).click();
  await page
    .getByRole("heading", { name: "السجلات والمتابعة", exact: true })
    .waitFor();
  await page.locator(".saved-open").click();
  await page.getByText("تصدير", { exact: true }).click();
  for (const [label, ext] of [
    ["PDF", "pdf"],
    ["Word", "docx"],
    ["XLSX", "xlsx"],
  ]) {
    const waiting = page.waitForEvent("download", { timeout: 60000 });
    await page.getByRole("button", { name: label, exact: true }).click();
    await downloadPrepared(page);
    await (await waiting).saveAs(`test-results/simple-case.${ext}`);
  }
  const drawn = await page.evaluate(() => window.drawnLines.join("\n"));
  assert(drawn.includes("تأخر الطالب عن الحصة الأولى."));
  assert(drawn.includes("مخطط للتنفيذ"));
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile("test-results/simple-case.xlsx");
  assert.equal(
    wb.worksheets[0].getCell("E6").value,
    "إنذار أول (مخطط للتنفيذ)",
  );
  await page.getByRole("button", { name: "النماذج", exact: true }).click();
  await page.getByRole("button", { name: /السجلات والمتابعة/ }).click();
  await page.getByLabel("متابعات مستحقة", { exact: true }).check();
  assert.equal(await page.locator(".saved-open").count(), 1);
  const register = page.waitForEvent("download");
  await page.getByRole("button", { name: "تصدير Excel", exact: true }).click();
  await downloadPrepared(page);
  await (await register).saveAs("test-results/simple-register.xlsx");
  await page.getByRole("button", { name: "الإعدادات", exact: true }).click();
  await page.getByText("ملفات ونماذج أخرى", { exact: true }).click();
  await page
    .getByRole("button", { name: "سجل الحالات والمتابعة", exact: true })
    .click();
  await page.getByText("تصدير", { exact: true }).click();
  const longDownload = page.waitForEvent("download", { timeout: 120000 });
  await page.getByRole("button", { name: "PDF", exact: true }).click();
  await downloadPrepared(page);
  await (await longDownload).saveAs("test-results/long-register.pdf");
  assert(
    (await page.evaluate(() => window.drawnLines.join("\n"))).includes(
      "بيان تجريبي 18",
    ),
  );
  const info = execFileSync("pdfinfo", ["test-results/long-register.pdf"], {
    encoding: "utf8",
  });
  assert(Number(info.match(/Pages:\s+(\d+)/)[1]) > 1);
  await page.getByRole("button", { name: "EN", exact: true }).click();
  assert.equal(await page.locator("html").getAttribute("dir"), "ltr");
  await page.getByRole("button", { name: "Forms", exact: true }).click();
  await ctx.setOffline(true);
  await page.reload();
  await page.getByRole("heading", { name: "Forms", exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Record a case", exact: true })
    .click();
  assert.equal(
    await page.getByLabel("Student name", { exact: true }).inputValue(),
    "عبدالرحمن عبدالله طالب تجريبي",
  );
  await page.getByText("Export", { exact: true }).click();
  const offline = page.waitForEvent("download");
  await page.getByRole("button", { name: "PDF", exact: true }).click();
  await downloadPrepared(page);
  await (await offline).saveAs("test-results/offline-case.pdf");
  const data = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    storageKey,
  );
  assert.equal(data.saved.length, 1);
  assert(data.drafts.daily);
  const fresh = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const entry = await fresh.newPage();
  entry.on("pageerror", (e) => errors.push(e.message));
  entry.on("request", (r) => {
    if (!["GET", "HEAD"].includes(r.method())) uploads.push(r.url());
  });
  await entry.goto("http://127.0.0.1:4320/");
  await entry.getByRole("button", { name: "تسجيل حالة", exact: true }).click();
  await entry
    .getByLabel("اسم المشرف", { exact: true })
    .pressSequentially("المشرف الجديد");
  assert.equal(
    await entry.getByLabel("اسم المشرف", { exact: true }).inputValue(),
    "المشرف الجديد",
  );
  assert(await entry.getByLabel("اسم المشرف", { exact: true }).isVisible());
  await entry.getByRole("button", { name: "النماذج", exact: true }).click();
  await entry
    .getByRole("button", { name: "الموجز اليومي", exact: true })
    .click();
  assert.equal(
    await entry
      .locator("input:visible,select:visible,textarea:visible")
      .count(),
    5,
  );
  await entry
    .getByLabel("الشعبة", { exact: true })
    .filter({ visible: true })
    .fill("٧/١");
  await entry.getByLabel("الحاضرون", { exact: true }).fill("20");
  await entry.getByLabel("الغائبون", { exact: true }).fill("3");
  await entry.getByLabel("المتأخرون صباحًا", { exact: true }).fill("2");
  await entry.getByText("الأسماء وتفاصيل إضافية", { exact: true }).click();
  await entry
    .getByLabel("أسماء المتأخرين (اختياري)", { exact: true })
    .fill("طالب أول\nطالب ثان");
  await entry
    .locator("summary")
    .filter({ hasText: "غياب المعلمين والبدلاء" })
    .click();
  await entry.getByLabel("المعلم الغائب", { exact: true }).fill("معلم تجريبي");
  await entry.getByLabel("البديل", { exact: true }).fill("بديل تجريبي");
  await entry
    .getByLabel("حالة التغطية", { exact: true })
    .selectOption("حضر البديل");
  await entry
    .locator("summary")
    .filter({ hasText: "الأعطال والاحتياجات" })
    .click();
  await entry.getByLabel("الموقع", { exact: true }).selectOption("الفصل");
  await entry.getByLabel("نوع الاحتياج", { exact: true }).selectOption("تكييف");
  await entry
    .getByLabel("التفاصيل والمتابعة", { exact: true })
    .fill("تعطل التكييف، تم إبلاغ الصيانة.");
  await entry.getByRole("button", { name: "حفظ النموذج", exact: true }).click();
  await entry.locator(".saved-open").click();
  await entry.getByText("تصدير", { exact: true }).click();
  for (const [label, ext] of [
    ["PDF", "pdf"],
    ["Word", "docx"],
    ["XLSX", "xlsx"],
  ]) {
    const waiting = entry.waitForEvent("download", { timeout: 60000 });
    await entry.getByRole("button", { name: label, exact: true }).click();
    await downloadPrepared(entry);
    await (await waiting).saveAs(`test-results/daily-brief.${ext}`);
  }
  const briefBook = new ExcelJS.Workbook();
  await briefBook.xlsx.readFile("test-results/daily-brief.xlsx");
  const bookText = JSON.stringify(briefBook.model);
  for (const text of [
    "وزارة التربية",
    "منطقة الفروانية التعليمية",
    "المتأخرون صباحًا",
    "طالب ثان",
    "معلم تجريبي",
    "تعطل التكييف",
  ])
    assert(bookText.includes(text), text);
  await entry.getByRole("button", { name: "النماذج", exact: true }).click();
  await entry
    .getByRole("button", { name: "سجل المعلمين والبدلاء", exact: true })
    .click();
  assert.equal(
    await entry
      .locator("input:visible,select:visible,textarea:visible")
      .count(),
    6,
  );
  await entry.getByLabel("المعلم الأصلي", { exact: true }).fill("معلم تجريبي");
  await entry.getByLabel("الحصة", { exact: true }).selectOption("الأولى");
  await entry
    .getByLabel("الشعبة", { exact: true })
    .filter({ visible: true })
    .fill("٧/١");
  await entry.getByLabel("البديل المبلّغ", { exact: true }).fill("بديل تجريبي");
  await entry
    .getByLabel("حالة التغطية", { exact: true })
    .selectOption("حضر البديل");
  await entry.getByText("تصدير", { exact: true }).click();
  const coverPdf = entry.waitForEvent("download");
  await entry.getByRole("button", { name: "PDF", exact: true }).click();
  await downloadPrepared(entry);
  await (await coverPdf).saveAs("test-results/teacher-log.pdf");
  assert(
    await entry.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await entry.getByRole("button", { name: "النماذج", exact: true }).click();
  await entry
    .getByRole("button", { name: "الطلبة المتأخرون", exact: true })
    .click();
  assert(await entry.getByLabel("الشعبة", { exact: true }).isDisabled());
  await entry.getByLabel("الصف", { exact: true }).selectOption("الصف السابع");
  assert.equal(
    await entry.getByLabel("الشعبة", { exact: true }).locator("option").count(),
    7,
  );
  await entry.getByLabel("الشعبة", { exact: true }).selectOption("٧/٢");
  await entry.getByLabel("اسم الطالب", { exact: true }).fill("طالب متأخر أول");
  await entry.getByRole("button", { name: "إضافة طالب", exact: true }).click();
  await entry
    .getByLabel("اسم الطالب", { exact: true })
    .nth(1)
    .fill("طالب متأخر ثان");
  await entry.getByLabel("الصف", { exact: true }).selectOption("الصف الثامن");
  assert.equal(
    await entry.getByLabel("الشعبة", { exact: true }).inputValue(),
    "",
  );
  assert.equal(
    await entry.getByLabel("اسم الطالب", { exact: true }).first().inputValue(),
    "طالب متأخر أول",
  );
  await entry.getByLabel("الصف", { exact: true }).selectOption("الصف السابع");
  await entry.getByLabel("الشعبة", { exact: true }).selectOption("٧/٢");
  await entry.reload();
  await entry
    .getByRole("button", { name: "الطلبة المتأخرون", exact: true })
    .click();
  assert.equal(
    await entry.getByLabel("الشعبة", { exact: true }).inputValue(),
    "٧/٢",
  );
  assert.equal(
    await entry.getByLabel("اسم الطالب", { exact: true }).count(),
    2,
  );
  assert(
    await entry.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await entry.screenshot({
    path: "test-results/late-phone.png",
    fullPage: true,
  });
  await entry.getByRole("button", { name: "حفظ النموذج", exact: true }).click();
  await entry
    .locator(".saved-open")
    .filter({ hasText: "الطلبة المتأخرون" })
    .click();
  await entry.getByText("تصدير", { exact: true }).click();
  for (const [label, ext] of [
    ["PDF", "pdf"],
    ["Word", "docx"],
    ["XLSX", "xlsx"],
  ]) {
    const waiting = entry.waitForEvent("download", { timeout: 60000 });
    await entry.getByRole("button", { name: label, exact: true }).click();
    await downloadPrepared(entry);
    await (await waiting).saveAs(`test-results/late-students.${ext}`);
  }
  const lateBook = new ExcelJS.Workbook();
  await lateBook.xlsx.readFile("test-results/late-students.xlsx");
  for (const text of [
    "٧/٢",
    "الصف السابع",
    "عدد المتأخرين: ٢",
    "طالب متأخر ثان",
  ])
    assert(JSON.stringify(lateBook.model).includes(text), text);
  await fresh.close();
  assert.deepEqual(errors, []);
  assert.deepEqual(uploads, []);
  console.log(
    "PASS: four simple forms, dependent Arabic grade/class dropdowns, lateness persistence and exports, daily attendance/lateness/names/cover/facilities exports, official headers, six-field mobile entry, local save/edit, planned action preserved, Word/PDF/Excel, long Arabic table pagination, legacy drafts retained, English, offline PDF and zero form uploads.",
  );
} finally {
  if (browser) await browser.close();
  server.kill();
}
