// Isolated browser storage and synthetic records; never activate or submit.
import { chromium, webkit } from "playwright";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { dailyFixture } from "../tests/daily-fixture.mjs";
import { newForm, storageKey, today, validateForm } from "../src/model.js";
import { refreshDailyBrief } from "../src/daily-brief.js";

const driver = process.env.SPRV_WEBKIT_DRIVER
  ? await import(process.env.SPRV_WEBKIT_DRIVER)
  : null;
const { expect } = await import(
  driver
    ? new URL("./test.mjs", process.env.SPRV_WEBKIT_DRIVER).href
    : "@playwright/test"
);
const url = process.env.SPRV_FORMS_URL || "http://127.0.0.1:4329/";
const server = process.env.SPRV_FORMS_URL
  ? null
  : spawn(
      process.execPath,
      [
        "node_modules/vite/bin/vite.js",
        "preview",
        "--host",
        "127.0.0.1",
        "--port",
        "4329",
        "--strictPort",
      ],
      { stdio: "pipe" },
    );
let browser;
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(url)).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert(ready, "Forms site did not respond");
  browser = await (driver?.webkit || chromium).launch(
    driver ? { executablePath: webkit.executablePath() } : {},
  );
  for (const [kind, title] of [
    ["case", "Record a case"],
    ["daily", "Daily brief"],
    ["absence", "Daily absence sheet"],
    ["late", "Late students"],
    ["staffing", "Teachers & substitutes"],
  ]) {
    const { store, date, late } = dailyFixture();
    const original = structuredClone(
      kind === "daily"
        ? {
            ...refreshDailyBrief(
              {
                ...newForm("daily", store.profile, store.roster),
                date,
                repairs: "Old saved repair",
              },
              store.saved,
              store.roster,
            ),
            savedAt: date + "T09:00:00Z",
          }
        : kind === "late"
          ? late
          : store.saved.find((row) => row.kind === kind),
    );
    assert.deepEqual(validateForm(original), [], kind);
    store.lang = "en";
    store.saved = [original];
    store.drafts = { [kind]: structuredClone(original) };
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      serviceWorkers: "block",
    });
    await context.addInitScript(
      ({ key, store, origin }) => {
        if (location.origin !== origin) return;
        if (!localStorage.getItem(key))
          localStorage.setItem(key, JSON.stringify(store));
      },
      { key: storageKey, store, origin: new URL(url).origin },
    );
    const errors = [],
      uploads = [];
    let acceptDialog = true;
    context.on("page", (page) => {
      page.setDefaultTimeout(15000);
      page.on("dialog", (d) => (acceptDialog ? d.accept() : d.dismiss()));
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("request", (r) => {
        if (!["GET", "HEAD"].includes(r.method())) uploads.push(r.url());
      });
    });
    let page = await context.newPage();
    const button = (name) =>
      page.getByRole("button", { name, exact: true }).first();
    const read = () =>
      page.evaluate((key) => JSON.parse(localStorage.getItem(key)), storageKey);
    const openHomeForm = async () => {
      await button(title).click();
      await expect(button("New")).toBeVisible();
    };
    const assertFresh = async (previousId) => {
      const fresh = (await read()).drafts[kind];
      assert.notEqual(
        fresh.id,
        previousId,
        kind + " must get a fresh record ID",
      );
      assert.equal(fresh.date, today());
      assert(!fresh.savedAt);
      assert.equal(fresh.supervisor, store.profile.supervisor);
      if (kind === "case") assert.equal(fresh.student, "");
      if (kind === "absence" || kind === "late")
        assert.equal(fresh.students.length, 0);
      if (kind === "absence")
        assert(fresh.classes.every((row) => !row.confirmed));
      if (kind === "staffing") {
        assert.equal(fresh.absences[0].teacher, "");
        assert.equal(fresh.covers[0].teacher, "");
      }
      if (kind === "daily") {
        assert.equal(fresh.repairs, "");
        assert.equal(
          fresh.summary.cases,
          0,
          "Recalculate today's sources instead of copying old counts",
        );
        assert.equal(fresh.summary.late, null);
      }
      return fresh;
    };
    await page.goto(url);
    await openHomeForm();
    await assertFresh(original.id);
    assert.deepEqual((await read()).saved, [original]);

    // Unfinished new entries survive navigation, reload and browser reopening.
    await page.getByLabel("Date", { exact: true }).fill("2026-09-23");
    const unfinished = (await read()).drafts[kind];
    acceptDialog = false;
    await button("New").click();
    acceptDialog = true;
    assert.deepEqual((await read()).drafts[kind], unfinished);
    await button("Forms").click();
    await openHomeForm();
    assert.deepEqual((await read()).drafts[kind], unfinished);
    await page.reload();
    await openHomeForm();
    assert.deepEqual((await read()).drafts[kind], unfinished);
    await page.close();
    page = await context.newPage();
    await page.goto(url);
    await openHomeForm();
    assert.deepEqual((await read()).drafts[kind], unfinished);

    // Saved history still opens the original, and an unsaved correction resumes.
    await button("Forms").click();
    await page.getByRole("button", { name: /^Records & follow-up/ }).click();
    await page.locator(".saved-open").click();
    assert.equal((await read()).drafts[kind].id, original.id);
    await expect(page.getByLabel("Date", { exact: true })).toHaveValue(
      original.date,
    );
    await page.getByLabel("Date", { exact: true }).fill("2026-09-22");
    if (kind === "absence") {
      for (const row of original.classes)
        await button("Confirm class and continue").click();
    }
    const correction = (await read()).drafts[kind];
    await button("Forms").click();
    await openHomeForm();
    assert.deepEqual((await read()).drafts[kind], correction);
    await page.reload();
    await openHomeForm();
    assert.deepEqual((await read()).drafts[kind], correction);
    assert.deepEqual((await read()).saved, [original]);
    await button(kind === "case" ? "Save record" : "Save form").click();
    await expect(page.locator(".saved-open")).toHaveCount(1);
    const updated = (await read()).saved[0];
    assert.equal(updated.id, original.id);
    assert.equal(updated.date, "2026-09-22");
    await button("Forms").click();
    await openHomeForm();
    const fresh = await assertFresh(updated.id);
    await button("New").click();
    await assertFresh(fresh.id);
    assert.deepEqual((await read()).saved, [updated]);
    assert.deepEqual(errors, []);
    assert.deepEqual(uploads, [], "No synthetic records may be uploaded");
    await context.close();
    console.log(
      `PASS ${kind}: fresh ID/date/content after save; unfinished drafts and corrections resume; history edits preserve identity; explicit New/cancel preserves saved records.`,
    );
  }
} finally {
  await browser?.close();
  server?.kill("SIGTERM");
}
