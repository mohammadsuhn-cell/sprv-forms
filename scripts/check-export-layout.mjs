import { chromium } from "@playwright/test";
import { spawn, execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import fs from "node:fs";
import ExcelJS from "exceljs";
import { newForm, newRow, groups, report } from "../src/model.js";
import { wordBlob, excelBlob } from "../src/exports.js";

// Synthetic fixtures only. Exercise long bordered rows, continuation headers and native files.
const long = newForm("case", { supervisor: "مشرف تجريبي" });
long.student = "طالب تجريبي";
long.className = "٧/٢";
const tokens = Array.from(
  { length: 110 },
  (_, i) => `S${String(i).padStart(3, "0")}`,
);
long.description = tokens
  .map(
    (id) =>
      `${id} متابعة انتظام الطالب والتواصل مع ولي الأمر وتوثيق الإجراءات.`,
  )
  .join("\n");
long.action = "إنذار أول";
long.actionState = "مخطط للتنفيذ";
long.outcome = "نهاية السجل المحفوظ";
const late = newForm("late", { supervisor: "مشرف تجريبي" });
late.grade = "الصف السابع";
late.className = "٧/٢";
late.students = Array.from({ length: 45 }, (_, i) => ({
  ...newRow(groups.late[0]),
  student: `طالب تجريبي L${String(i).padStart(3, "0")}`,
  arrival: "07:45",
}));
const rosterLate = structuredClone(late);
rosterLate.rosterMode = "yes";
rosterLate.students = rosterLate.students.map((student, i) => ({
  ...student,
  studentId: `fixture-${i}`,
  className: `٧/${"١٢٣٤٥٦"[i % 6]}`,
}));
const original = JSON.stringify([long, late]);
fs.mkdirSync("test-results", { recursive: true });
for (const [name, fixture] of [
  ["long-case", long],
  ["long-late", late],
]) {
  fs.writeFileSync(
    `test-results/${name}.docx`,
    Buffer.from(await (await wordBlob(fixture)).arrayBuffer()),
  );
  fs.writeFileSync(
    `test-results/${name}.xlsx`,
    Buffer.from(await (await excelBlob(fixture)).arrayBuffer()),
  );
}
const xml = execFileSync(
  "unzip",
  ["-p", "test-results/long-case.docx", "word/document.xml"],
  { encoding: "utf8" },
);
for (const token of tokens) assert(xml.includes(token));
assert(xml.includes("نهاية السجل المحفوظ"));
assert(xml.includes("لم يُنفّذ بعد"));
const book = new ExcelJS.Workbook();
await book.xlsx.readFile("test-results/long-case.xlsx");
assert.equal(
  book.worksheets[0].getCell("E6").value,
  "إنذار أول (لم يُنفّذ بعد)",
);
const values = [];
book
  .getWorksheet("تفاصيل")
  .eachRow((r) => values.push(String(r.getCell(2).value || "")));
assert(values.join("").includes(long.description));
for (const sheet of book.worksheets)
  sheet.eachRow((r) =>
    assert(r.height <= 409, `Excel row clipped: ${r.number}`),
  );
assert.equal(
  JSON.stringify([long, late]),
  original,
  "Exports must not mutate form data",
);

const server = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "preview",
    "--host",
    "127.0.0.1",
    "--port",
    "4321",
  ],
  { stdio: "pipe" },
);
let browser;
try {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch("http://127.0.0.1:4321")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }
  browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto("http://127.0.0.1:4321/");
  const asset = fs
    .readdirSync("dist/assets")
    .find((name) => name.startsWith("pdf-pages-") && name.endsWith(".js"));
  for (const [name, fixture] of [
    ["long-case", long],
    ["long-late", late],
    ["long-roster-late", rosterLate],
  ]) {
    const result = await page.evaluate(
      async ({ asset, r }) => {
        const lines = [],
          overflow = [];
        const proto = CanvasRenderingContext2D.prototype,
          draw = proto.fillText,
          stroke = proto.strokeRect;
        proto.fillText = function (text, x, y, ...args) {
          const m = this.measureText(text);
          if (
            x - m.actualBoundingBoxLeft < 43 ||
            x + m.actualBoundingBoxRight > this.canvas.width / 2 - 43 ||
            y + m.actualBoundingBoxDescent > this.canvas.height / 2
          )
            overflow.push(String(text));
          lines.push(String(text));
          return draw.call(this, text, x, y, ...args);
        };
        proto.strokeRect = function (x, y, w, h) {
          if (y + h > this.canvas.height / 2 - 59)
            overflow.push(`Border outside print area: ${y + h}`);
          return stroke.call(this, x, y, w, h);
        };
        try {
          const { renderPages } = await import(`/assets/${asset}`);
          const pages = await renderPages(r);
          const result = {
            count: pages.length,
            lines,
            overflow,
            first: pages[0].toDataURL(),
            last: pages.at(-1).toDataURL(),
          };
          pages.forEach((c) => {
            c.width = 0;
            c.height = 0;
          });
          return result;
        } finally {
          proto.fillText = draw;
          proto.strokeRect = stroke;
        }
      },
      { asset, r: report(fixture) },
    );
    assert(result.count > 1);
    assert.deepEqual(result.overflow, []);
    const stamps = result.lines.filter((line) =>
      line.includes("تاريخ التصدير:"),
    );
    assert.equal(stamps.length, result.count);
    assert.equal(
      new Set(stamps).size,
      1,
      "Each page retains the same export timestamp",
    );
    const text = result.lines.join("\n");
    for (const token of name === "long-case" ? tokens : ["L000", "L044"])
      assert(text.includes(token), token);
    assert(
      result.lines.filter(
        (line) =>
          line === (name === "long-case" ? "بيانات الحالة" : "أسماء الطلبة"),
      ).length > 1,
      "Continuation pages repeat the section heading",
    );
    for (const which of ["first", "last"])
      fs.writeFileSync(
        `test-results/${name}-${which}.png`,
        Buffer.from(result[which].split(",")[1], "base64"),
      );
    console.log(
      `PASS: ${name}, ${result.count} pages, every entry retained, repeated headings, no text or border overflow`,
    );
  }
} finally {
  if (browser) await browser.close();
  server.kill();
}
console.log(
  "PASS: Word/Excel preserve long text, planned actions and source data; Excel rows fit printable heights",
);
