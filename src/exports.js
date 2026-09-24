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
      alignment: AlignmentType.START,
      spacing: { after: 110 },
      children: String(text || "")
        .split("\n")
        .flatMap((s, i) => [
          ...(i ? [new TextRun({ break: 1 })] : []),
          new TextRun({
            text: s,
            font: { ascii: "Arial", hAnsi: "Arial", cs: "Arial" },
            size,
            sizeComplexScript: size,
            boldComplexScript: bold,
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
          run: {
            font: { ascii: "Arial", hAnsi: "Arial", cs: "Arial" },
            size: 24,
            sizeComplexScript: 24,
          },
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
export async function pdfBlob(form) {
  const [{ renderPages }, { jsPDF }] = await Promise.all([
    import("./pdf-pages.js"),
    import("jspdf"),
  ]);
  const r = report(form),
    pages = await renderPages(r);
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
      pdf.addImage(
        pages[i].toDataURL("image/png"),
        "PNG",
        0,
        0,
        r.landscape ? 297 : 210,
        r.landscape ? 210 : 297,
        undefined,
        "FAST",
      );
    }
    return pdf.output("blob");
  } finally {
    for (const canvas of pages) {
      canvas.width = 0;
      canvas.height = 0;
    }
  }
}

export async function excelBlob(form) {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  const s = wb.addWorksheet("الحالات", {
    views: [{ rightToLeft: true, state: "frozen", ySplit: 4 }],
    pageSetup: {
      paperSize: 9,
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
  });
  const headers = [
    "التاريخ",
    "اسم الطالب",
    "الشعبة",
    "نوع الواقعة",
    "الإجراء المتخذ",
    "موعد المتابعة",
  ];
  const rows =
    form.kind === "case" ? [form] : form.kind === "cases" ? form.rows : [];
  if (!rows.length && !["case", "cases"].includes(form.kind)) {
    const r = report(form);
    s.name = "السجل";
    s.addRow([r.school]);
    s.addRow([r.title]);
    for (const t of r.tables) {
      s.addRow([t.title]);
      s.addRow(t.columns);
      t.rows.forEach((row) => s.addRow(row));
    }
    for (const section of r.sections) {
      s.addRow([section.title]);
      section.lines.forEach((row) => s.addRow(row));
    }
  } else {
    s.mergeCells("A1:F1");
    s.getCell("A1").value = form.school;
    s.mergeCells("A2:F2");
    s.getCell("A2").value = "سجل الحالات والمتابعة";
    s.mergeCells("A3:F3");
    s.getCell("A3").value =
      `اسم المشرف: ${form.supervisor}    العام الدراسي: ${form.year}`;
    s.addTable({
      name: "Cases",
      ref: "A4",
      headerRow: true,
      style: { theme: "TableStyleMedium2", showRowStripes: true },
      columns: headers.map((name) => ({ name })),
      rows: rows.map((v) =>
        [
          v.date,
          v.student,
          v.className,
          v.type,
          (v.action || "") +
            (v.actionState === "مخطط للتنفيذ" ? " (مخطط للتنفيذ)" : ""),
          v.due,
        ].map((v) => String(v || "")),
      ),
    });
    // Preserve additional case details in a second sheet when present.
    if (form.kind === "case") {
      const detail = wb.addWorksheet("تفاصيل", {
        views: [{ rightToLeft: true }],
      });
      detail.columns = [{ width: 26 }, { width: 65 }];
      const r = report(form);
      detail.addRow([form.school]);
      for (const section of r.sections) {
        detail.addRow([section.title]);
        section.lines.forEach((row) => detail.addRow(row));
      }
    }
    s.pageSetup.printTitlesRow = "1:4";
  }
  s.columns.forEach((c, i) => (c.width = [16, 32, 12, 28, 32, 18][i] || 28));
  for (const sheet of wb.worksheets)
    sheet.eachRow((row) => {
      row.height = 36;
      row.eachCell((cell) => {
        cell.font = { name: "Arial", size: 14 };
        cell.alignment = {
          readingOrder: "rtl",
          vertical: "middle",
          wrapText: true,
        };
      });
    });
  return new Blob([await wb.xlsx.writeBuffer()], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
