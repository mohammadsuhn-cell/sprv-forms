// Temporary browser storage and synthetic students only.
import { chromium, webkit } from "playwright";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { emptyStore, storageKey, grades } from "../src/model.js";
const expect = process.env.SPRV_WEBKIT_DRIVER
  ? (await import(new URL("./test.mjs", process.env.SPRV_WEBKIT_DRIVER).href))
      .expect
  : (await import("@playwright/test")).expect;

const origin = "http://127.0.0.1:4328";
const server = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "preview",
    "--host",
    "127.0.0.1",
    "--port",
    "4328",
    "--strictPort",
  ],
  { stdio: "pipe" },
);
let browser;
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(origin)).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert(ready, "Isolated forms server did not start");
  const driver = process.env.SPRV_WEBKIT_DRIVER
    ? await import(process.env.SPRV_WEBKIT_DRIVER)
    : null;
  browser = await (driver?.webkit || chromium).launch(
    driver ? { executablePath: webkit.executablePath() } : {},
  );
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: "block",
  });
  const seed = emptyStore();
  seed.lang = "en";
  seed.profile.supervisor = "Synthetic Grade 8 supervisor";
  seed.profile.grade = grades[2];
  await context.addInitScript(
    ({ key, seed }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(key, JSON.stringify(seed));
    },
    { key: storageKey, seed },
  );
  const button = (page, name) =>
    page.getByRole("button", { name, exact: true });
  const data = (page) =>
    page.evaluate((key) => JSON.parse(localStorage.getItem(key)), storageKey);
  const first = await context.newPage();
  await first.goto(origin);
  await button(first, "Record a case").click();
  await first
    .getByLabel("Student name", { exact: true })
    .fill("Synthetic saved student");
  await first.getByLabel("Class", { exact: true }).fill("٨/١");
  const second = await context.newPage();
  await second.goto(origin);
  await expect(second.getByRole("alert")).toContainText("another tab");
  await expect(second.getByRole("textbox")).toHaveCount(0);
  await button(second, "Open forms here").click();
  await expect(second.getByRole("alert")).toContainText("another tab");
  await button(first, "Save record").click();
  await expect(first.locator(".saved-open")).toHaveCount(1);
  await first.goto(origin);
  await button(first, "Record a case").click();
  await first
    .getByLabel("Student name", { exact: true })
    .fill("Synthetic unfinished draft");
  const expected = await data(first);
  assert.equal(expected.saved.length, 1);
  assert.equal(expected.drafts.case.student, "Synthetic unfinished draft");
  await first.close();
  await button(second, "Open forms here").click();
  await expect(button(second, "Settings")).toBeVisible();
  assert.deepEqual(await data(second), expected);
  await button(second, "Settings").click();
  await second
    .getByLabel("Supervisor", { exact: true })
    .fill("Renamed synthetic supervisor");
  const edited = await data(second);
  assert.deepEqual(edited.saved, expected.saved);
  assert.equal(edited.drafts.case.student, "Synthetic unfinished draft");

  // A page restored from the back/forward cache must acquire ownership again.
  await second.evaluate(() =>
    window.dispatchEvent(
      new PageTransitionEvent("pagehide", { persisted: true }),
    ),
  );
  const third = await context.newPage();
  await third.goto(origin);
  await expect(button(third, "Settings")).toBeVisible();
  await second.evaluate(() =>
    window.dispatchEvent(
      new PageTransitionEvent("pageshow", { persisted: true }),
    ),
  );
  await expect(second.getByRole("alert")).toContainText("another tab");
  await button(third, "Settings").click();
  await third
    .getByLabel("Supervisor", { exact: true })
    .fill("Latest synthetic supervisor");
  await third.close();
  await button(second, "Open forms here").click();
  await button(second, "Settings").click();
  await expect(second.getByLabel("Supervisor", { exact: true })).toHaveValue(
    "Latest synthetic supervisor",
  );
  assert.deepEqual((await data(second)).saved, expected.saved);
  assert.equal(
    (await data(second)).drafts.case.student,
    "Synthetic unfinished draft",
  );
  // A fast return can arrive before the previous lock request has settled.
  await second.evaluate(() => {
    window.dispatchEvent(
      new PageTransitionEvent("pagehide", { persisted: true }),
    );
    window.dispatchEvent(
      new PageTransitionEvent("pageshow", { persisted: true }),
    );
  });
  await expect(button(second, "Settings")).toBeVisible();
  assert.deepEqual((await data(second)).saved, expected.saved);
  await context.close();
  console.log(
    "PASS: one writing tab, blocked stale edits, saved cases and unfinished drafts preserved, ownership transfer, latest settings reloaded, and back/forward-cache recovery.",
  );
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
