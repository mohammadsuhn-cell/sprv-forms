import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transformWithOxc } from "vite";
import { emptyStore } from "../src/model.js";
import {
  activateDraft,
  openWorkspaceForm,
  saveWorkspaceForm,
  unfinishedDrafts,
} from "../src/form-workspace.js";

// Compile the real components and render them in Node; no browser or live data.
async function componentModule(name) {
  const url = new URL(`../src/${name}`, import.meta.url);
  const result = await transformWithOxc(
    await fs.readFile(url, "utf8"),
    url.pathname,
    { jsx: { runtime: "classic" } },
  );
  const code = result.code.replace(
    /from "([^"]+)"/g,
    (_, specifier) =>
      `from ${JSON.stringify(specifier.startsWith(".") ? new URL(specifier, url).href : import.meta.resolve(specifier))}`,
  );
  return import(
    `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
  );
}
const { FormLaunchers, DraftList, saveText, statusText } =
  await componentModule("form-workspace-ui.jsx");
const { FileActions } = await componentModule("file-actions.jsx");
const t = (ar, en) => en;
const render = (Component, props) =>
  renderToStaticMarkup(React.createElement(Component, props));
function workspace() {
  const store = emptyStore();
  store.profile = {
    ...store.profile,
    supervisor: "Synthetic supervisor",
    grade: "الصف السابع",
  };
  return store;
}
test("home separates new cases from today's daily report and labels saved daily edits", () => {
  let store = openWorkspaceForm(workspace(), "daily", workspace().profile, {
    date: "2026-11-24",
  });
  let html = render(FormLaunchers, {
    store,
    profile: store.profile,
    date: "2026-11-24",
    excluded: [],
    t,
  });
  assert(html.includes("Record a new case"));
  assert(html.includes("Continue today&#x27;s report"));
  assert(html.includes("Start today&#x27;s report"));
  store = saveWorkspaceForm(store, store.drafts.daily);
  html = render(FormLaunchers, {
    store,
    profile: store.profile,
    date: "2026-11-24",
    excluded: [],
    t,
  });
  assert(html.includes("View / edit today&#x27;s report"));
});
test("draft list identifies old work, preserves student context and offers explicit resume", () => {
  let store = openWorkspaceForm(workspace(), "case", workspace().profile, {
    date: "2026-11-23",
  });
  store = activateDraft(store, {
    ...store.drafts.case,
    student: "Synthetic student",
    className: "٧/١",
  });
  const html = render(DraftList, {
    drafts: unfinishedDrafts(store),
    saved: [],
    t,
    en: true,
  });
  assert(html.includes("Unsubmitted drafts"));
  assert(html.includes("Synthetic student"));
  assert(html.includes("Continue draft"));
  assert(html.includes("2026-11-23"));
  assert(!html.includes("Received by general supervision"));
});
test("the prepared-file panel keeps save and send available beside download and explains draft exports", () => {
  const notice =
    "This file is from a draft. Downloading does not save or submit the report.";
  for (const lang of ["ar", "en"]) {
    const translate = (ar, en) => (lang === "ar" ? ar : en);
    const html = render(FileActions, {
      file: {
        name: "synthetic.pdf",
        blob: new Blob(["synthetic"], { type: "application/pdf" }),
      },
      lang,
      notice,
      primaryAction: {
        label: saveText("edited", true, translate),
        disabled: false,
        onClick() {},
      },
    });
    assert(
      html.includes(saveText("edited", true, translate).replace(/&/g, "&amp;")),
    );
    assert(html.includes(notice));
    assert(html.includes(lang === "ar" ? "تنزيل الملف" : "Download file"));
    assert(!html.includes('disabled=""'));
  }
});
test("local saving, pending submission, receipt and corrections have distinct wording", () => {
  assert.equal(saveText("draft", false, t), "Save form");
  assert.equal(saveText("draft", true, t), "Save & send");
  assert.equal(saveText("edited", true, t), "Save & send changes");
  const states = [
    "draft",
    "edited",
    "local",
    "pending",
    "received",
    "blocked",
    "withdrawn",
  ];
  assert.equal(
    new Set(states.map((s) => statusText(s, t))).size,
    states.length,
  );
  assert(statusText("pending", t).includes("awaiting delivery"));
  assert(!statusText("pending", t).includes("Received"));
});
