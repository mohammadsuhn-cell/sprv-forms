import { chromium, webkit } from "playwright";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import fs from "node:fs";
import { emptyStore, newForm, storageKey } from "../src/model.js";
const { expect } = await import(
  process.env.SPRV_WEBKIT_DRIVER
    ? new URL("./test.mjs", process.env.SPRV_WEBKIT_DRIVER).href
    : "@playwright/test"
);
const url = "http://127.0.0.1:4324/";
const server = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "preview",
    "--host",
    "127.0.0.1",
    "--port",
    "4324",
    "--strictPort",
  ],
  { stdio: "pipe" },
);
const button = (page, name) => page.getByRole("button", { name, exact: true });
const fixture = emptyStore();
fixture.profile.supervisor = "مشرف تجريبي";
fixture.drafts.case = {
  ...newForm("case", fixture.profile),
  student: "طالب اختبار تدفق الملفات",
  className: "٧/١",
};
const webkitDriver = process.env.SPRV_WEBKIT_DRIVER
  ? (await import(process.env.SPRV_WEBKIT_DRIVER)).webkit
  : webkit;
const browsers =
  process.env.FILE_FLOW_BROWSER === "all"
    ? [chromium, webkitDriver]
    : process.env.FILE_FLOW_BROWSER === "webkit"
      ? [webkitDriver]
      : [chromium];
let browser;
try {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(url)).ok) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  for (const engine of browsers) {
    console.log(`Checking ${engine.name()} file actions`);
    browser = await engine.launch({
      timeout: 30000,
      ...(engine.name() === "webkit" && process.env.SPRV_WEBKIT_DRIVER
        ? { executablePath: webkit.executablePath() }
        : {}),
    });
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      acceptDownloads: true,
    });
    await ctx.addInitScript(
      ({ key, value }) => {
        if (!localStorage.getItem(key))
          localStorage.setItem(key, JSON.stringify(value));
        window.clickedFiles = [];
        const click = HTMLAnchorElement.prototype.click;
        HTMLAnchorElement.prototype.click = function () {
          if (this.href.startsWith("blob:"))
            window.clickedFiles.push({
              target: this.target,
              rel: this.rel,
              name: this.download,
            });
          return click.call(this);
        };
      },
      { key: storageKey, value: fixture },
    );
    const page = await ctx.newPage(),
      errors = [],
      downloads = [],
      popups = [],
      uploads = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("download", (d) => downloads.push(d));
    page.on("popup", (p) => popups.push(p));
    page.on("request", (r) => {
      if (!["GET", "HEAD"].includes(r.method())) uploads.push(r.url());
    });
    await page.goto(url);
    await page.waitForFunction(() => navigator.serviceWorker.controller, {
      timeout: 15000,
    });
    await button(page, "تسجيل حالة").click();
    // Force generation beyond a normal transient-activation window.
    await page.evaluate(() => {
      const load = document.fonts.load.bind(document.fonts);
      document.fonts.load = async (...args) => {
        await new Promise((resolve) => setTimeout(resolve, 6000));
        return load(...args);
      };
      window.restoreFonts = () => {
        document.fonts.load = load;
      };
    });
    await page.locator(".export-menu summary").click();
    await button(page, "PDF").click();
    await expect(button(page, "تنزيل الملف")).toBeVisible({ timeout: 30000 });
    assert.equal(
      downloads.length,
      0,
      "Preparing must not trigger navigation or download",
    );
    assert.equal(popups.length, 0, "Preparing must not open a window");
    assert.equal(page.url(), url);
    await expect(page.getByLabel("اسم الطالب", { exact: true })).toHaveValue(
      fixture.drafts.case.student,
    );
    const preview = page.getByRole("link", {
      name: "فتح في تبويب جديد",
      exact: true,
    });
    await expect(preview).toHaveAttribute("target", "_blank");
    await expect(preview).toHaveAttribute("rel", "noopener noreferrer");
    const previewWindow = page.waitForEvent("popup");
    await preview.click();
    const previewPage = await previewWindow;
    assert.equal(page.url(), url);
    await expect(page.getByLabel("اسم الطالب", { exact: true })).toHaveValue(
      fixture.drafts.case.student,
    );
    await previewPage.close();
    await page.bringToFront();
    const downloading = page.waitForEvent("download");
    await button(page, "تنزيل الملف").click();
    const pdf = await downloading;
    assert.equal(await pdf.failure(), null);
    const bytes = fs.readFileSync(await pdf.path());
    assert.equal(bytes.subarray(0, 4).toString(), "%PDF");
    const click = await page.evaluate(() => window.clickedFiles.at(-1));
    assert.equal(click.target, "_blank");
    assert.equal(click.rel, "noopener noreferrer");
    assert.equal(page.url(), url);
    await page.evaluate(() => {
      Object.defineProperty(navigator, "canShare", {
        configurable: true,
        value: () => true,
      });
      Object.defineProperty(navigator, "share", {
        configurable: true,
        value: async ({ files }) => {
          window.shared = {
            name: files[0].name,
            active: navigator.userActivation?.isActive ?? true,
          };
        },
      });
    });
    await button(page, "مشاركة").click();
    assert(
      (await page.evaluate(() => window.shared)).active,
      "Share must have a fresh activation",
    );
    assert((await page.evaluate(() => window.shared)).name.endsWith(".pdf"));
    await page.evaluate(() =>
      Object.defineProperty(navigator, "share", {
        configurable: true,
        value: async () => {
          throw new DOMException("cancel", "AbortError");
        },
      }),
    );
    await button(page, "مشاركة").click();
    await expect(button(page, "تنزيل الملف")).toBeVisible();
    assert.equal(page.url(), url);
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    fs.mkdirSync("test-results", { recursive: true });
    await page.screenshot({
      path: `test-results/file-ready-${engine.name()}.png`,
    });
    await button(page, "إغلاق خيارات الملف").click();
    await expect(button(page, "حفظ الحالة")).toBeVisible();
    await expect(page.getByLabel("اسم الطالب", { exact: true })).toHaveValue(
      fixture.drafts.case.student,
    );
    await page.evaluate(() => window.restoreFonts());
    for (const name of ["Word", "XLSX"]) {
      await page.locator(".export-menu summary").click();
      await button(page, name).click();
      await expect(button(page, "تنزيل الملف")).toBeVisible({ timeout: 30000 });
      await expect(
        page.getByRole("link", { name: "فتح في تبويب جديد", exact: true }),
      ).toHaveCount(0);
      const pending = page.waitForEvent("download");
      await button(page, "تنزيل الملف").click();
      const file = await pending;
      assert.equal(await file.failure(), null);
      assert.equal(
        fs
          .readFileSync(await file.path())
          .subarray(0, 2)
          .toString(),
        "PK",
      );
      assert.equal(page.url(), url);
      await button(page, "إغلاق خيارات الملف").click();
    }
    // Discard an in-flight result if the user edits the draft before generation ends.
    await page.evaluate(() => {
      const load = document.fonts.load.bind(document.fonts);
      document.fonts.load = async (...args) => {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return load(...args);
      };
    });
    await page.locator(".export-menu summary").click();
    await button(page, "PDF").click();
    await page
      .getByLabel("اسم الطالب", { exact: true })
      .fill("اسم معدل أثناء التجهيز");
    await expect(page.locator(".busy-status")).toHaveCount(0, {
      timeout: 15000,
    });
    await expect(page.locator(".file-ready")).toHaveCount(0);
    await button(page, "EN").click();
    await button(page, "PDF").click();
    await expect(button(page, "Download file")).toBeVisible({ timeout: 30000 });
    await expect(
      page.getByRole("link", { name: "Open in new tab", exact: true }),
    ).toBeVisible();
    await button(page, "Close file options").click();
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await ctx.setOffline(true);
    // The frozen macOS 14 WebKit build errors internally on emulated offline
    // navigation. Check in-page offline export there; Chromium also reloads.
    if (engine.name() !== "webkit" || !process.env.SPRV_WEBKIT_DRIVER) {
      await page.reload();
      await button(page, "Record a case").click();
    }
    await page.locator(".export-menu summary").click();
    await button(page, "PDF").click();
    await expect(button(page, "Download file")).toBeVisible({ timeout: 30000 });
    assert.equal(page.url(), url);
    assert.deepEqual(errors, []);
    assert.deepEqual(uploads, []);
    console.log(
      `PASS ${engine.name()}: delayed generation stays in form, PDF preview opens separately, explicit PDF/Word/Excel downloads, fresh-gesture sharing/cancel, draft retained, stale export discarded, Arabic/English, offline export.`,
    );
    await browser.close();
    browser = null;
  }
} finally {
  await browser?.close();
  server.kill();
}
