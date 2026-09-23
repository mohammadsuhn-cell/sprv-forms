import { report } from "./model.js";
export const fileName = (form, extension) =>
  `${report(form).title}-${form.date}.${extension}`.replace(
    /[\\/:*?"<>|]/g,
    "-",
  );
export function download(blob, name) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
const widths = (t) =>
  t.columns.length === 8
    ? [9, 14, 6, 12, 26, 13, 12, 8]
    : Array(t.columns.length).fill(100 / t.columns.length);
export async function wordBlob(form) {
  const {
    Document,
    Packer,
    Paragraph,
    TextRun,
    Table,
    TableRow,
    TableCell,
    WidthType,
    AlignmentType,
    Footer,
    PageNumber,
  } = await import("docx");
  const r = report(form);
  const p = (text, bold = false, size = 24) =>
    new Paragraph({
      bidirectional: true,
      alignment: AlignmentType.RIGHT,
      spacing: { after: 110 },
      children: String(text || "")
        .split("\n")
        .flatMap((s, i) => [
          ...(i ? [new TextRun({ break: 1 })] : []),
          new TextRun({
            text: s,
            font: "Arial",
            size,
            bold,
            rightToLeft: true,
          }),
        ]),
    });
  const table = (t) =>
    new Table({
      visuallyRightToLeft: true,
      columnWidths: widths(t).map((w) =>
        Math.round((w * (r.landscape ? 15398 : 10466)) / 100),
      ),
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          tableHeader: true,
          children: t.columns.map(
            (c) =>
              new TableCell({
                shading: { fill: "E9EEF2" },
                children: [p(c, true, 22)],
              }),
          ),
        }),
        ...t.rows.map(
          (row) =>
            new TableRow({
              children: row.map(
                (c) => new TableCell({ children: [p(c, false, 22)] }),
              ),
            }),
        ),
      ],
    });
  const children = [
    p(r.school, true, 30),
    p(`العام الدراسي: ${r.year}`, false, 22),
    p(r.title, true, 36),
    ...r.meta.map(([k, v]) => p(`${k}: ${v}`)),
    ...r.tables.flatMap((t) => [p(t.title, true, 26), table(t)]),
    ...r.sections.flatMap((s) => [
      p(s.title, true, 26),
      ...s.lines.map(([k, v]) => p(k ? `${k}: ${v}` : v)),
    ]),
    p(`اسم المشرف: ${r.supervisor}`),
    p("التوقيع: ____________________"),
  ];
  const doc = new Document({
    creator: "",
    title: r.title,
    styles: {
      default: {
        document: {
          run: { font: "Arial", size: 24 },
          paragraph: { bidirectional: true },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: {
              width: r.landscape ? 16838 : 11906,
              height: r.landscape ? 11906 : 16838,
            },
            margin: { top: 720, bottom: 720, left: 720, right: 720 },
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ children: [PageNumber.CURRENT] })],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });
  return Packer.toBlob(doc);
}
const node = (tag, text, cls) => {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (cls) e.className = cls;
  return e;
};
const chunks = (text, max = 180) => {
  const words = String(text || "").split(/(?<=\s)/u);
  const parts = [];
  let current = "";
  for (const word of words) {
    if (current.length + word.length > max && current) {
      parts.push(current);
      current = "";
    }
    for (let start = 0; start < word.length; start += max) {
      const piece = word.slice(start, start + max);
      if (piece.length === max) {
        if (current) {
          parts.push(current);
          current = "";
        }
        parts.push(piece);
      } else current += piece;
    }
  }
  if (current || !parts.length) parts.push(current);
  return parts;
};
export function mountReport(form) {
  const r = report(form),
    host = node("div", undefined, "export-host");
  host.setAttribute("aria-hidden", "true");
  document.body.append(host);
  const pages = [];
  let page, body;
  const newPage = () => {
    page = node(
      "article",
      undefined,
      `paper ${r.landscape ? "landscape" : ""}`,
    );
    page.dir = "rtl";
    const header = node("header");
    header.append(
      node("strong", r.school),
      node("span", `العام الدراسي: ${r.year}`),
      node("h1", r.title),
    );
    page.append(header);
    body = node("div", undefined, "paper-body");
    page.append(body, node("footer", String(pages.length + 1)));
    host.append(page);
    pages.push(page);
  };
  newPage();
  const fits = () => body.scrollHeight <= body.clientHeight + 1;
  const append = (e) => {
    body.append(e);
    if (!fits()) {
      e.remove();
      newPage();
      body.append(e);
    }
  };
  const meta = node("div", undefined, "paper-meta");
  for (const [k, v] of r.meta) meta.append(node("span", `${k}: ${v}`));
  append(meta);
  for (const t of r.tables) {
    let table, tbody, wrap;
    const setup = () => {
      wrap = node("section");
      wrap.append(node("h2", t.title));
      table = node("table");
      const columns = node("colgroup");
      for (const width of widths(t)) {
        const col = node("col");
        col.style.width = width + "%";
        columns.append(col);
      }
      table.append(columns);
      const th = node("thead"),
        tr = node("tr");
      for (const c of t.columns) tr.append(node("th", c));
      th.append(tr);
      tbody = node("tbody");
      table.append(th, tbody);
      wrap.append(table);
      body.append(wrap);
    };
    setup();
    for (const row of t.rows) {
      const pieces = row.map((c, i) =>
        chunks(c, Math.max(140, Math.round(widths(t)[i] * 20))),
      );
      const count = Math.max(...pieces.map((p) => p.length));
      for (let i = 0; i < count; i++) {
        const tr = node("tr");
        pieces.forEach((p) => tr.append(node("td", p[i] || "")));
        tbody.append(tr);
        if (!fits()) {
          tr.remove();
          if (!tbody.children.length) wrap.remove();
          newPage();
          setup();
          tbody.append(tr);
        }
      }
    }
  }
  for (const section of r.sections) {
    let first = true;
    for (const [key, value] of section.lines) {
      const parts = chunks(value, 500);
      for (let i = 0; i < parts.length; i++) {
        const wrap = node("section");
        if (first) wrap.append(node("h2", section.title));
        const p = node("p");
        if (key && i === 0) p.append(node("b", key + ": "));
        p.append(document.createTextNode(parts[i]));
        wrap.append(p);
        append(wrap);
        first = false;
      }
    }
  }
  const sig = node("div", undefined, "signature");
  sig.append(
    node("span", `اسم المشرف: ${r.supervisor}`),
    node("span", "التوقيع: ____________________"),
  );
  append(sig);
  return { host, pages, report: r };
}
export async function pdfBlob(form) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);
  await document.fonts.ready;
  const { host, pages, report: r } = mountReport(form);
  try {
    const pdf = new jsPDF({
      orientation: r.landscape ? "landscape" : "portrait",
      unit: "mm",
      format: "a4",
      compress: true,
    });
    pdf.setProperties({ title: r.title, author: "", creator: "نماذج الإشراف" });
    for (let i = 0; i < pages.length; i++) {
      if (i) pdf.addPage();
      const canvas = await html2canvas(pages[i], {
        scale: 2,
        backgroundColor: "#fff",
        logging: false,
        windowWidth: 1200,
        windowHeight: 1200,
        scrollX: 0,
        scrollY: 0,
      });
      pdf.addImage(
        canvas.toDataURL("image/png"),
        "PNG",
        0,
        0,
        r.landscape ? 297 : 210,
        r.landscape ? 210 : 297,
        undefined,
        "FAST",
      );
      canvas.width = 0;
      canvas.height = 0;
    }
    return pdf.output("blob");
  } finally {
    host.remove();
  }
}
