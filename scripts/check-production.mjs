import { chromium } from "@playwright/test";
import { spawn, execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  newForm,
  newRow,
  groups,
  emptyStore,
  storageKey,
} from "../src/model.js";
const server = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "preview",
    "--host",
    "127.0.0.1",
    "--port",
    "4319",
  ],
  { stdio: "pipe" },
);
const wait = () => new Promise((r) => setTimeout(r, 200));
let browser;
try {
  for (let i = 0; i < 40; i++) {
    try {
      if ((await fetch("http://127.0.0.1:4319")).ok) break;
    } catch {}
    await wait();
  }
  browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    acceptDownloads: true,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const state = emptyStore();
  state.profile = {
    school: "مدرسة الاختبار",
    supervisor: "مشرف تجريبي",
    year: "٢٠٢٦/٢٠٢٧",
  };
  for (const kind of ["cases", "daily", "staffing"]) {
    const v = newForm(kind, state.profile);
    for (const g of groups[kind]) {
      v[g.key] = Array.from({ length: kind === "cases" ? 16 : 2 }, (_, i) => {
        const r = newRow(g);
        for (const f of g.fields)
          r[f.key] =
            f.kind === "date"
              ? "2026-09-24"
              : f.kind === "time"
                ? "09:00"
                : f.kind === "select"
                  ? f.options[1]
                  : f.kind === "number"
                    ? "0"
                    : f.key === "className"
                      ? "٧/٢"
                      : f.kind === "textarea"
                        ? `نص تجريبي للسجل ${i + 1}. `.repeat(
                            kind === "cases" ? 30 : 2,
                          )
                        : `بيان تجريبي ${i + 1}`;
        return r;
      });
    }
    state.drafts[kind] = v;
  }
  await ctx.addInitScript(
    ({ key, value }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(key, JSON.stringify(value));
    },
    { key: storageKey, value: state },
  );
  await page.goto("http://127.0.0.1:4319/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller);
  for (const [kind, label] of [
    ["cases", "سجل الحالات والمتابعة"],
    ["daily", "التقرير اليومي للإشراف"],
    ["staffing", "غياب المعلمين والبدلاء"],
  ]) {
    await page.locator(".form-card").filter({ hasText: label }).click();
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    const downloading = page.waitForEvent("download", { timeout: 120000 });
    await page.getByRole("button", { name: "PDF", exact: true }).click();
    await page.waitForSelector(".export-host", { state: "attached" });
    const layout = await page.evaluate(() => ({
      pages: document.querySelectorAll(".paper").length,
      overflow: [...document.querySelectorAll(".paper-body")].some(
        (e) => e.scrollHeight > e.clientHeight + 1,
      ),
      text: document.querySelector(".export-host").textContent,
    }));
    assert(!layout.overflow, `${kind}: clipping`);
    if (kind === "cases") {
      assert(layout.pages > 1);
      assert(layout.text.includes("بيان تجريبي 16"));
    }
    const dl = await downloading;
    await dl.saveAs(`test-results/${kind}.pdf`);
    console.log(`PASS ${kind}: ${layout.pages} PDF pages, no clipped content.`);
    if (kind === "staffing") {
      const wd = page.waitForEvent("download");
      await page.getByRole("button", { name: "Word", exact: true }).click();
      await (await wd).saveAs("test-results/staffing.docx");
    }
    await page.getByRole("button", { name: "النماذج", exact: true }).click();
  }
  await ctx.setOffline(true);
  await page.reload();
  await page.getByRole("heading", { name: "النماذج", exact: true }).waitFor();
  await page
    .locator(".form-card")
    .filter({ hasText: "التقرير اليومي للإشراف" })
    .click();
  const word = page.waitForEvent("download");
  await page.getByRole("button", { name: "Word", exact: true }).click();
  await (await word).saveAs("test-results/offline.docx");
  assert.deepEqual(errors, []);
  console.log("PASS production: offline reload and offline Word export.");
} finally {
  if (browser) await browser.close();
  server.kill();
}
