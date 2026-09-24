import { chromium, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { emptyStore, newForm, storageKey } from "../src/model.js";

const url = "http://127.0.0.1:4322/";
const server = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "preview",
    "--host",
    "127.0.0.1",
    "--port",
    "4322",
    "--strictPort",
  ],
  { stdio: "pipe" },
);
let browser;
const errors = [],
  uploads = [];
const button = (page, name) => page.getByRole("button", { name, exact: true });
const read = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)), storageKey);
const clickDialog = async (page, name, accept) => {
  page.once("dialog", (dialog) =>
    accept ? dialog.accept() : dialog.dismiss(),
  );
  await button(page, name).click();
};
const download = async (page, action) => {
  const pending = page.waitForEvent("download");
  await action();
  const file = await pending;
  assert.equal(await file.failure(), null);
  return fs.readFile(await file.path());
};
const inputBackup = (page, data) =>
  page.getByLabel("ملف النسخة الاحتياطية", { exact: true }).setInputFiles({
    name: "test-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(typeof data === "string" ? data : JSON.stringify(data)),
  });

try {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(url)).ok) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  context.on("page", (page) => {
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("request", (r) => {
      if (!["GET", "HEAD"].includes(r.method())) uploads.push(r.url());
    });
  });
  let page = await context.newPage();
  await page.goto(url);
  // A draft opened before setup must acquire the name too.
  await button(page, "تسجيل حالة").click();
  await button(page, "حفظ الحالة").click();
  await expect(page.getByRole("alert")).toBeVisible();
  await button(page, "الإعدادات").click();
  await button(page, "حفظ الإعدادات").click();
  await expect(page.locator(".toast")).toHaveText("أدخل اسم المشرف");
  await page
    .getByLabel("اسم المشرف", { exact: true })
    .pressSequentially("المشرف التجريبي");
  assert.equal((await read(page)).profile.supervisor, "المشرف التجريبي");
  assert.equal((await read(page)).drafts.case.supervisor, "المشرف التجريبي");
  await expect(
    page.getByText("الاسم محفوظ على هذا الجهاز", { exact: true }),
  ).toBeVisible();
  // Autosave works without pressing Save, across reload and closing the tab.
  await page.reload();
  await button(page, "الإعدادات").click();
  await expect(page.getByLabel("اسم المشرف", { exact: true })).toHaveValue(
    "المشرف التجريبي",
  );
  await page.close();
  page = await context.newPage();
  await page.goto(url);
  await button(page, "الإعدادات").click();
  await expect(page.getByLabel("اسم المشرف", { exact: true })).toHaveValue(
    "المشرف التجريبي",
  );
  await button(page, "حفظ الإعدادات").click();
  await expect(page.locator(".toast")).toHaveText(
    "تم حفظ الإعدادات على هذا الجهاز",
  );
  for (const label of ["نموذج Excel", "قوالب Word"]) {
    if (
      !(await page.getByRole("link", { name: label, exact: true }).isVisible())
    )
      await page.getByText("ملفات ونماذج أخرى", { exact: true }).click();
    const file = await download(page, () =>
      page.getByRole("link", { name: label, exact: true }).click(),
    );
    assert(file.length > 1000);
    assert.equal(file.subarray(0, 2).toString(), "PK");
  }
  await button(page, "النماذج").click();
  await button(page, "تسجيل حالة").click();
  await page.getByLabel("اسم الطالب", { exact: true }).fill("طالب اختبار");
  await page
    .getByLabel("موعد المتابعة (اختياري)", { exact: true })
    .fill("2020-01-01");
  await button(page, "حفظ الحالة").click();
  await expect(page.locator(".saved-open")).toHaveCount(1);
  await page.locator(".saved-open").click();
  await page.getByLabel("اسم الطالب", { exact: true }).fill("طالب معدل");
  await button(page, "حفظ الحالة").click();
  assert.equal((await read(page)).saved.length, 1);
  await page
    .getByLabel("بحث في المحفوظات", { exact: true })
    .fill("لا يوجد هذا الاسم");
  await expect(button(page, "تصدير Excel")).toBeDisabled();
  await expect(page.locator(".saved-open")).toHaveCount(0);
  await page.getByLabel("بحث في المحفوظات", { exact: true }).fill("طالب معدل");
  await page.getByLabel("متابعات مستحقة", { exact: true }).check();
  await expect(page.locator(".saved-open")).toHaveCount(1);
  await expect(button(page, "تصدير Excel")).toBeEnabled();
  await button(page, "تصدير Excel").click();
  await download(page, () => button(page, "تنزيل الملف").click());
  // Unsupported native sharing falls back to a download; supported sharing and cancellation.
  await page.evaluate(() =>
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      value: () => false,
    }),
  );
  await download(page, () => button(page, "مشاركة").click());
  await page.evaluate(() => {
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      value: () => true,
    });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async ({ files }) => {
        window.sharedFiles = files.length;
      },
    });
  });
  await button(page, "مشاركة").click();
  assert.equal(await page.evaluate(() => window.sharedFiles), 1);
  await page.evaluate(() =>
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async () => {
        throw new DOMException("cancel", "AbortError");
      },
    }),
  );
  await button(page, "مشاركة").click();
  await page.evaluate(() =>
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async () => {
        throw Error("unavailable");
      },
    }),
  );
  await button(page, "مشاركة").click();
  await expect(page.locator(".toast")).toContainText("تعذّرت المشاركة");
  await page.getByLabel("بحث في المحفوظات", { exact: true }).fill("طالب");
  await expect(page.locator(".file-ready")).toHaveCount(0);
  await clickDialog(page, "حذف النسخة", false);
  assert.equal((await read(page)).saved.length, 1);
  await button(page, "الإعدادات").click();
  await page.getByLabel("اسم المشرف", { exact: true }).fill("المشرف التالي");
  await button(page, "حفظ الإعدادات").click();
  assert.equal((await read(page)).saved[0].supervisor, "المشرف التجريبي");
  assert.equal((await read(page)).drafts.case.supervisor, "المشرف التجريبي");
  await button(page, "النماذج").click();
  await button(page, "تسجيل حالة").click();
  await button(page, "جديد").click(); // Saved copy remains, so no discard confirmation.
  await page.getByLabel("اسم الطالب", { exact: true }).fill("مسودة غير محفوظة");
  await clickDialog(page, "جديد", false);
  await expect(page.getByLabel("اسم الطالب", { exact: true })).toHaveValue(
    "مسودة غير محفوظة",
  );
  await clickDialog(page, "جديد", true);
  await expect(page.getByLabel("اسم الطالب", { exact: true })).toHaveValue("");
  assert.equal((await read(page)).drafts.case.supervisor, "المشرف التالي");
  await button(page, "النماذج").click();
  await button(page, "عرض الكل").click();
  page.once("dialog", (d) => d.dismiss());
  await page.locator(".saved-open").click();
  await expect(page.locator(".saved-open")).toHaveCount(1);
  page.once("dialog", (d) => d.accept());
  await page.locator(".saved-open").click();
  await expect(page.getByLabel("اسم الطالب", { exact: true })).toHaveValue(
    "طالب معدل",
  );
  await button(page, "النماذج").click();
  await button(page, "عرض الكل").click();
  await clickDialog(page, "حذف النسخة", true);
  assert.equal((await read(page)).saved.length, 0);
  await button(page, "النماذج").click();
  await button(page, "الطلبة المتأخرون").click();
  await page.getByLabel("اسم الطالب", { exact: true }).fill("طالب تجريبي");
  await clickDialog(page, "حذف السجل", false);
  await expect(page.locator(".entry")).toHaveCount(1);
  await clickDialog(page, "حذف السجل", true);
  await expect(page.locator(".entry")).toHaveCount(0);
  await button(page, "إضافة طالب").click();
  await expect(page.locator(".entry")).toHaveCount(1);
  await button(page, "الإعدادات").click();
  const backup = JSON.parse(
    (
      await download(page, () => button(page, "تنزيل نسخة احتياطية").click())
    ).toString(),
  );
  assert.equal(backup.profile.supervisor, "المشرف التالي");
  const imported = emptyStore();
  imported.profile.supervisor = "مشرف مستورد";
  imported.saved = [
    {
      ...newForm("case", imported.profile),
      student: "طالب مستورد",
      savedAt: new Date().toISOString(),
    },
  ];
  const chooserPromise = page.waitForEvent("filechooser");
  await button(page, "استعادة نسخة").click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from("broken json"),
  });
  await expect(page.locator(".toast")).toHaveText(
    "الملف ليس نسخة احتياطية صالحة",
  );
  page.once("dialog", (d) => d.dismiss());
  await inputBackup(page, imported);
  assert.equal((await read(page)).saved.length, 0);
  for (let i = 0; i < 2; i++) {
    const dialog = page.waitForEvent("dialog");
    await inputBackup(page, imported);
    await (await dialog).accept();
    await expect(page.locator(".toast")).toHaveText("تمت الاستعادة");
  }
  assert.equal((await read(page)).saved.length, 1);
  assert.equal((await read(page)).profile.supervisor, "المشرف التالي");
  // A full/blocked device must not show Saved or navigate away, and backup retains edits.
  await page.evaluate(() => {
    window.originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function () {
      throw new DOMException("full", "QuotaExceededError");
    };
  });
  await page.getByLabel("اسم المشرف", { exact: true }).fill("اسم لم يحفظ بعد");
  await button(page, "حفظ الإعدادات").click();
  await expect(
    page.getByText("لم تُحفظ التغييرات على الجهاز", { exact: true }),
  ).toBeVisible();
  assert.equal((await read(page)).profile.supervisor, "المشرف التالي");
  await expect(page.locator(".toast")).toHaveCount(0);
  const failedBackup = JSON.parse(
    (
      await download(page, () => button(page, "تنزيل نسخة احتياطية").click())
    ).toString(),
  );
  assert.equal(failedBackup.profile.supervisor, "اسم لم يحفظ بعد");
  await button(page, "النماذج").click();
  await button(page, "تسجيل حالة").click();
  await button(page, "حفظ الحالة").click();
  await expect(button(page, "حفظ الحالة")).toBeVisible();
  await expect(page.locator(".toast")).toHaveCount(0);
  await page.evaluate(() => {
    Storage.prototype.setItem = window.originalSetItem;
  });
  await button(page, "حفظ الحالة").click();
  await expect(
    page.getByRole("heading", { name: "السجلات والمتابعة", exact: true }),
  ).toBeVisible();
  await button(page, "EN").click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await button(page, "Settings").click();
  await expect(button(page, "Save settings")).toBeVisible();
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await button(page, "العربية").click();
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await context.close();

  // Restoring into a fresh device also fills a draft opened before restoration.
  const fresh = await browser.newContext();
  const restorePage = await fresh.newPage();
  restorePage.on("pageerror", (e) => errors.push(e.message));
  await restorePage.goto(url);
  await button(restorePage, "تسجيل حالة").click();
  await button(restorePage, "الإعدادات").click();
  const restoreDialog = restorePage.waitForEvent("dialog");
  await inputBackup(restorePage, imported);
  await (await restoreDialog).accept();
  await expect(restorePage.locator(".toast")).toHaveText("تمت الاستعادة");
  assert.equal((await read(restorePage)).drafts.case.supervisor, "مشرف مستورد");
  assert.equal((await read(restorePage)).saved.length, 1);
  await fresh.close();

  // Unreadable original storage must survive until an explicit backup-and-reset.
  const corrupt = await browser.newContext();
  const recovery = await corrupt.newPage();
  recovery.on("pageerror", (e) => errors.push(e.message));
  await recovery.goto(url);
  await recovery.evaluate(
    (key) => localStorage.setItem(key, "{broken-original"),
    storageKey,
  );
  await recovery.reload();
  await button(recovery, "الإعدادات").click();
  await recovery.getByLabel("اسم المشرف", { exact: true }).fill("محاولة");
  await button(recovery, "حفظ الإعدادات").click();
  assert.equal(
    await recovery.evaluate((key) => localStorage.getItem(key), storageKey),
    "{broken-original",
  );
  await expect(button(recovery, "استعادة نسخة")).toBeDisabled();
  await clickDialog(recovery, "تنزيل البيانات وإعادة التهيئة", false);
  const raw = await download(recovery, () =>
    clickDialog(recovery, "تنزيل البيانات وإعادة التهيئة", true),
  );
  assert.equal(raw.toString(), "{broken-original");
  await expect(button(recovery, "استعادة نسخة")).toBeEnabled();
  await recovery
    .getByLabel("اسم المشرف", { exact: true })
    .fill("اسم بعد الإصلاح");
  await button(recovery, "حفظ الإعدادات").click();
  assert.equal((await read(recovery)).profile.supervisor, "اسم بعد الإصلاح");
  await corrupt.close();
  assert.deepEqual(errors, []);
  assert.deepEqual(uploads, []);
  console.log(
    "PASS: settings autosave, explicit save, reload/reopen, inherited names, historical authors, validation, save/update, search/filter/export, share fallback/success/cancel/failure, new/delete confirmations, row controls, backup/restore/deduplication, templates, storage failure/retry, corrupt-data recovery, Arabic/English and zero uploads.",
  );
} finally {
  await browser?.close();
  server.kill();
}
