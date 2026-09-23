import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs";
const out = "test-results";
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    acceptDownloads: true,
  });
  const page = await ctx.newPage(),
    errors = [],
    uploads = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (!["GET", "HEAD"].includes(r.method())) uploads.push(r.url());
  });
  await page.goto("http://127.0.0.1:4318");
  await page.getByRole("button", { name: "الإعدادات", exact: true }).click();
  await page
    .getByLabel("اسم المدرسة", { exact: true })
    .pressSequentially("مدرسة تجريبية", { delay: 10 });
  assert.equal(
    await page.getByLabel("اسم المدرسة", { exact: true }).inputValue(),
    "مدرسة تجريبية",
  );
  await page.getByLabel("اسم المشرف", { exact: true }).fill("مشرف تجريبي");
  await page.getByLabel("العام الدراسي", { exact: true }).fill("٢٠٢٦/٢٠٢٧");
  await page.getByRole("button", { name: "النماذج", exact: true }).click();
  await page.screenshot({ path: out + "/home-mobile.png", fullPage: true });
  await page.locator(".form-card").filter({ hasText: "تفاصيل الحالة" }).click();
  await page
    .getByLabel("اسم الطالب", { exact: true })
    .fill("طالب تجريبي للتحقق من النماذج");
  await page.getByLabel("الشعبة", { exact: true }).fill("٧/٢");
  await page
    .getByLabel("نوع الواقعة", { exact: true })
    .selectOption("التأخر عن الحصة");
  await page
    .getByLabel("وصف الواقعة", { exact: true })
    .fill("تأخر الطالب عن الحصة. وصف تجريبي لفحص سلامة العربية وتنسيق الأسطر.");
  await page
    .getByLabel("الإجراء المتخذ", { exact: true })
    .selectOption("إعداد استدعاء ولي الأمر");
  await page
    .getByLabel("حالة الإجراء", { exact: true })
    .selectOption("تم التنفيذ");
  await page
    .getByLabel("حالة المتابعة", { exact: true })
    .selectOption("بانتظار مقابلة ولي الأمر");
  await page.getByLabel("موعد المتابعة", { exact: true }).fill("2026-09-25");
  await page.getByLabel("وقت المتابعة", { exact: true }).fill("09:00");
  await page.getByRole("button", { name: "حفظ نسخة", exact: true }).click();
  await page.reload();
  await page.locator(".form-card").filter({ hasText: "تفاصيل الحالة" }).click();
  assert.equal(
    await page.getByLabel("اسم الطالب", { exact: true }).inputValue(),
    "طالب تجريبي للتحقق من النماذج",
  );
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({ path: out + "/case-mobile.png", fullPage: true });
  for (const [label, ext] of [
    ["Word", "docx"],
    ["PDF", "pdf"],
  ]) {
    const wait = page.waitForEvent("download", { timeout: 90000 });
    await page.getByRole("button", { name: label, exact: true }).click();
    const download = await wait;
    await download.saveAs(out + "/case." + ext);
    assert(fs.statSync(out + "/case." + ext).size > 2000);
  }
  await page.getByRole("button", { name: "EN", exact: true }).click();
  assert.equal(await page.locator("html").getAttribute("dir"), "ltr");
  await page.getByRole("button", { name: "Forms", exact: true }).click();
  assert(
    await page.getByRole("heading", { name: "Forms", exact: true }).isVisible(),
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(uploads, []);
  console.log(
    "PASS: mobile typing, draft persistence, saved copy, bilingual layout, local Word/PDF downloads, no form uploads.",
  );
  await ctx.close();
} finally {
  await browser.close();
}
