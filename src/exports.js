import { report, withSchoolIdentity, letterhead } from "./model.js";
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
    Header,
    BorderStyle,
    PageNumber,
  } = await import("docx");
  const r = report(form);
  const p = (text, bold = false, size = 28, options = {}) =>
    new Paragraph({
      bidirectional: true,
      alignment: AlignmentType.START,
      spacing: { before: bold ? 180 : 0, after: 160, line: 360 },
      keepNext: bold,
      ...options,
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
                children: [p(c, true, 24)],
              }),
          ),
        }),
        ...t.rows.map(
          (row) =>
            new TableRow({
              children: row.map(
                (c) => new TableCell({ children: [p(c, false, 24)] }),
              ),
            }),
        ),
      ],
    });
  const quiet = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  const headerText = (text, bold = false, centered = false) =>
    p(text, bold, bold ? 28 : 24, {
      keepNext: false,
      spacing: { after: 60, line: 300 },
      alignment: centered ? AlignmentType.CENTER : AlignmentType.START,
    });
  const headerTable = new Table({
    visuallyRightToLeft: true,
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: [
      Math.round((r.landscape ? 15398 : 10466) / 2),
      Math.round((r.landscape ? 15398 : 10466) / 2),
    ],
    borders: {
      top: quiet,
      left: quiet,
      right: quiet,
      insideHorizontal: quiet,
      insideVertical: quiet,
      bottom: { style: BorderStyle.SINGLE, size: 6, color: "90988F" },
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            children: [headerText(r.ministry, true), headerText(r.district)],
          }),
          new TableCell({
            children: [
              headerText(r.school, true, true),
              headerText(`العام الدراسي: ${r.year}`, false, true),
            ],
          }),
        ],
      }),
    ],
  });
  const children = [
    p(r.title, true, 44, { alignment: AlignmentType.CENTER }),
    ...r.meta.map(([k, v]) => p(`${k}: ${v}`)),
    ...r.tables.flatMap((t) => [p(t.title, true, 32), table(t)]),
    ...r.sections.flatMap((s) => [
      p(s.title, true, 32),
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
            size: 28,
            sizeComplexScript: 28,
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
            margin: {
              top: 2200,
              bottom: 720,
              left: 720,
              right: 720,
              header: 500,
            },
          },
        },
        headers: { default: new Header({ children: [headerTable] }) },
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
  form = withSchoolIdentity(form);
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  const s = wb.addWorksheet("الحالات", {
    views: [{ rightToLeft: true, state: "frozen", ySplit: 5 }],
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
    wb.removeWorksheet(s.id);
    const parts = [
      ...r.tables,
      ...r.sections.map((section) => ({
        title: section.title,
        columns: ["البيان", "التفاصيل"],
        rows: section.lines,
      })),
    ];
    for (const [index, part] of parts.entries()) {
      const count = Math.max(2, part.columns.length),
        half = Math.ceil(count / 2);
      const sheet = wb.addWorksheet(`${index + 1} ${part.title}`.slice(0, 31), {
        views: [{ rightToLeft: true, state: "frozen", ySplit: 5 }],
        pageSetup: {
          paperSize: 9,
          orientation: count > 4 ? "landscape" : "portrait",
          horizontalCentered: true,
          fitToPage: true,
          fitToWidth: 1,
          fitToHeight: 0,
          printTitlesRow: "1:5",
        },
      });
      sheet.columns = Array.from({ length: count }, (_, i) => ({
        width:
          count === 2
            ? i === 0
              ? 25
              : 65
            : count === 3
              ? i === 2
                ? 65
                : 23
              : i === 0
                ? 22
                : 27,
      }));
      const merge = (row, from, to) => {
        if (to > from) sheet.mergeCells(row, from, row, to);
      };
      merge(1, 1, half);
      merge(1, half + 1, count);
      merge(2, 1, half);
      merge(2, half + 1, count);
      merge(3, 1, count);
      merge(4, 1, count);
      sheet.getCell(1, 1).value = r.ministry;
      sheet.getCell(1, half + 1).value = r.school;
      sheet.getCell(2, 1).value = r.district;
      sheet.getCell(2, half + 1).value = `العام الدراسي: ${r.year}`;
      sheet.getCell(3, 1).value = `${r.title} · ${part.title}`;
      sheet.getCell(4, 1).value = [
        ...r.meta.map(([key, value]) => `${key}: ${value}`),
        `اسم المشرف: ${r.supervisor}`,
      ].join("    ");
      sheet.addRow(part.columns);
      for (const values of part.rows) {
        const pieces = values.map(
          (value) => String(value ?? "").match(/[\s\S]{1,240}/g) || [""],
        );
        for (let i = 0; i < Math.max(...pieces.map((p) => p.length)); i++)
          sheet.addRow(pieces.map((p) => p[i] || ""));
      }
      if (part.columns.length === 1)
        for (let row = 5; row <= sheet.rowCount; row++) merge(row, 1, count);
      sheet.eachRow((row) => {
        row.eachCell((cell) => {
          cell.font = {
            name: "Arial",
            size: row.number === 3 ? 18 : 14,
            bold: row.number <= 5,
          };
          cell.alignment = {
            readingOrder: "rtl",
            horizontal: row.number === 3 ? "center" : "right",
            vertical: "middle",
            wrapText: true,
          };
          if (row.number === 5)
            cell.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FFE9EDE8" },
            };
        });
        row.height =
          row.number <= 4
            ? row.number === 4 && r.meta.length > 1
              ? 84
              : 48
            : Math.max(
                36,
                ...row.values
                  .slice(1)
                  .map(
                    (value, i) =>
                      Math.ceil(
                        String(value ?? "").length /
                          Math.max(
                            12,
                            (sheet.getColumn(i + 1).width - 2) * 0.8,
                          ),
                      ) *
                        22 +
                      12,
                  ),
              );
      });
    }
    return new Blob([await wb.xlsx.writeBuffer()], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  } else {
    for (const range of ["A1:C1", "D1:F1", "A2:C2", "D2:F2", "A3:F3", "A4:F4"])
      s.mergeCells(range);
    s.getCell("A1").value = letterhead.ministry;
    s.getCell("D1").value = form.school;
    s.getCell("A2").value = letterhead.district;
    s.getCell("D2").value = `العام الدراسي: ${form.year}`;
    s.getCell("A3").value = "سجل الحالات والمتابعة";
    s.getCell("A4").value = `اسم المشرف: ${form.supervisor}`;
    s.addTable({
      name: "Cases",
      ref: "A5",
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
      for (const value of [
        letterhead.ministry,
        letterhead.district,
        form.school,
        `العام الدراسي: ${form.year}`,
        r.title,
      ]) {
        const row = detail.addRow([value]);
        detail.mergeCells(row.number, 1, row.number, 2);
      }
      for (const section of r.sections) {
        detail.addRow([section.title]);
        section.lines.forEach((row) => detail.addRow(row));
      }
    }
    s.pageSetup.printTitlesRow = "1:5";
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
  if (["case", "cases"].includes(form.kind)) {
    for (const ref of ["A1", "D1"])
      s.getCell(ref).font = { name: "Arial", size: 16, bold: true };
    s.getCell("A3").font = { name: "Arial", size: 20, bold: true };
    s.getCell("A3").alignment = {
      horizontal: "center",
      vertical: "middle",
      readingOrder: "rtl",
    };
    s.getRow(1).height = 48;
    s.getRow(2).height = 32;
    s.getRow(3).height = 44;
  }
  return new Blob([await wb.xlsx.writeBuffer()], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
