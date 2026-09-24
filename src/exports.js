import { report, withSchoolIdentity, letterhead } from "./model.js";
import { printStyle as colors, columnPercentages } from "./export-style.js";
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
  // If Safari previews instead of downloading, keep the working form in its tab.
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
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
    HeightRule,
    TableLayoutType,
    VerticalAlign,
  } = await import("docx");
  const r = report(form),
    pageWidth = r.landscape ? 15398 : 10466;
  const border = { style: BorderStyle.SINGLE, size: 6, color: colors.line };
  const borders = Object.fromEntries(
    [
      "top",
      "bottom",
      "left",
      "right",
      "insideHorizontal",
      "insideVertical",
    ].map((side) => [side, border]),
  );
  const p = (
    text,
    {
      bold = false,
      size = 28,
      color = colors.ink,
      center = false,
      keepNext = false,
    } = {},
  ) =>
    new Paragraph({
      bidirectional: true,
      alignment: center ? AlignmentType.CENTER : AlignmentType.START,
      spacing: { before: 0, after: 40, line: 340 },
      keepNext,
      children: String(text ?? "")
        .split("\n")
        .flatMap((line, i) => [
          ...(i ? [new TextRun({ break: 1 })] : []),
          new TextRun({
            text: line,
            font: { ascii: "Arial", hAnsi: "Arial", cs: "Arial" },
            size,
            sizeComplexScript: size,
            bold,
            boldComplexScript: bold,
            rightToLeft: true,
            color,
          }),
        ]),
    });
  const cell = (text, { fill = colors.white, span = 1, ...options } = {}) =>
    new TableCell({
      columnSpan: span,
      shading: { fill },
      verticalAlign: VerticalAlign.CENTER,
      margins: { top: 115, bottom: 115, left: 140, right: 140 },
      children: [p(text, options)],
    });
  const grid = (percentages, rows) =>
    new Table({
      visuallyRightToLeft: true,
      layout: TableLayoutType.FIXED,
      columnWidths: percentages.map((v) => Math.round((v * pageWidth) / 100)),
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders,
      rows,
    });
  const spacer = () =>
    new Paragraph({
      spacing: { before: 0, after: 0, line: 150 },
      children: [],
    });
  const banner = (title, columns) =>
    new TableRow({
      tableHeader: true,
      children: [
        cell(title, {
          span: columns,
          bold: true,
          size: 30,
          fill: colors.soft,
          keepNext: true,
        }),
      ],
    });
  const table = (t) =>
    grid(columnPercentages(t.columns), [
      banner(t.title, t.columns.length),
      new TableRow({
        tableHeader: true,
        children: t.columns.map((c) =>
          cell(c, {
            bold: true,
            size: 24,
            fill: colors.ink,
            color: colors.white,
            keepNext: true,
          }),
        ),
      }),
      ...t.rows.map(
        (row, index) =>
          new TableRow({
            children: row.map((c) =>
              cell(c, {
                size: 26,
                fill: index % 2 ? colors.stripe : colors.white,
              }),
            ),
          }),
      ),
    ]);
  const section = (s) =>
    grid(
      [25, 75],
      [
        banner(s.title, 2),
        ...s.lines.map(
          ([key, value]) =>
            new TableRow({
              children: key
                ? [
                    cell(key, { bold: true, size: 25, fill: colors.soft }),
                    cell(value),
                  ]
                : [cell(value, { span: 2 })],
            }),
        ),
      ],
    );
  const metadata = [...r.meta, ["اسم المشرف", r.supervisor]],
    metaRows = [];
  for (let i = 0; i < metadata.length; i += 2) {
    const pairs = metadata.slice(i, i + 2);
    metaRows.push(
      new TableRow({
        children: pairs.flatMap(([key, value]) => [
          cell(key, { bold: true, size: 24, fill: colors.soft }),
          cell(value, { size: 26, span: pairs.length === 1 ? 3 : 1 }),
        ]),
      }),
    );
  }
  const headerTable = grid(
    [50, 50],
    [
      new TableRow({
        children: [
          new TableCell({
            margins: { top: 120, bottom: 120, left: 160, right: 160 },
            children: [
              p(r.ministry, { bold: true }),
              p(r.district, { size: 24 }),
            ],
          }),
          new TableCell({
            margins: { top: 120, bottom: 120, left: 160, right: 160 },
            children: [
              p(r.school, { bold: true, size: 26, center: true }),
              p(`العام الدراسي: ${r.year}`, { size: 24, center: true }),
            ],
          }),
        ],
      }),
    ],
  );
  const children = [
    grid(
      [100],
      [
        new TableRow({
          children: [
            cell(r.title, {
              bold: true,
              size: 40,
              center: true,
              fill: colors.ink,
              color: colors.white,
              keepNext: true,
            }),
          ],
        }),
      ],
    ),
    spacer(),
    grid([17, 33, 17, 33], metaRows),
    spacer(),
    ...r.tables.flatMap((t) => [table(t), spacer()]),
    ...r.sections.flatMap((s) => [section(s), spacer()]),
    grid(
      [17, 33, 17, 33],
      [
        new TableRow({
          cantSplit: true,
          height: { value: 1000, rule: HeightRule.ATLEAST },
          children: [
            cell("اسم المشرف", { bold: true, size: 24, fill: colors.soft }),
            cell(r.supervisor, { size: 26 }),
            cell("التوقيع", { bold: true, size: 24, fill: colors.soft }),
            cell(""),
          ],
        }),
      ],
    ),
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
              top: 1900,
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
                children: [
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    size: 20,
                    color: colors.muted,
                  }),
                ],
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

function styleExcelSheet(
  sheet,
  { titleRow = 3, columnHeader = 5, sectionRows = [] } = {},
) {
  const line = { style: "thin", color: { argb: `FF${colors.line}` } };
  sheet.views = [
    { rightToLeft: true, showGridLines: false, state: "frozen", ySplit: 5 },
  ];
  sheet.pageSetup.margins = {
    left: 0.35,
    right: 0.35,
    top: 0.4,
    bottom: 0.4,
    header: 0.15,
    footer: 0.2,
  };
  sheet.pageSetup.horizontalCentered = true;
  sheet.pageSetup.printArea = `A1:${sheet.getColumn(sheet.columnCount).letter}${sheet.rowCount}`;
  sheet.eachRow((row) => {
    const dark = row.number === titleRow || row.number === columnHeader;
    const section = sectionRows.includes(row.number);
    for (let i = 1; i <= sheet.columnCount; i++) {
      const cell = row.getCell(i);
      cell.font = {
        name: "Arial",
        size: row.number === titleRow ? 20 : row.number === 1 ? 16 : 14,
        bold: row.number <= 5 || section,
        color: { argb: `FF${dark ? colors.white : colors.ink}` },
      };
      cell.alignment = {
        readingOrder: "rtl",
        horizontal: row.number === titleRow ? "center" : "right",
        vertical: "middle",
        wrapText: true,
      };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: {
          argb: `FF${dark ? colors.ink : section || row.number === 4 ? colors.soft : row.number > 5 && row.number % 2 ? colors.stripe : colors.white}`,
        },
      };
      cell.border = { top: line, bottom: line, left: line, right: line };
    }
    let required = row.number === titleRow ? 46 : 36;
    // Measure each merged area once and include explicit newlines in row heights.
    row.eachCell((cell, col) => {
      if (cell.isMerged && cell.master.address !== cell.address) return;
      let width = sheet.getColumn(col).width || 12;
      for (
        let next = col + 1;
        next <= sheet.columnCount &&
        row.getCell(next).master.address === cell.address;
        next++
      )
        width += sheet.getColumn(next).width || 12;
      const lineCount = String(cell.value ?? "")
        .split("\n")
        .reduce(
          (sum, line) =>
            sum +
            Math.max(
              1,
              Math.ceil(line.length / Math.max(10, (width - 3) * 0.65)),
            ),
          0,
        );
      required = Math.max(required, lineCount * 22 + 16);
    });
    row.height = Math.max(row.height || 0, required);
  });
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
    for (const sheet of wb.worksheets) styleExcelSheet(sheet);
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
      style: { theme: "TableStyleMedium4", showRowStripes: true },
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
        pageSetup: {
          paperSize: 9,
          orientation: "portrait",
          fitToPage: true,
          fitToWidth: 1,
          fitToHeight: 0,
          printTitlesRow: "1:5",
        },
      });
      detail.columns = [{ width: 26 }, { width: 65 }];
      const r = report(form);
      detail.addRow([r.ministry, r.school]);
      detail.addRow([r.district, `العام الدراسي: ${r.year}`]);
      detail.addRow([r.title]);
      detail.mergeCells("A3:B3");
      detail.addRow([
        `التاريخ: ${r.meta[0][1]}    اسم المشرف: ${r.supervisor}`,
      ]);
      detail.mergeCells("A4:B4");
      detail.addRow(["البيان", "التفاصيل"]);
      const sectionRows = [];
      for (const section of r.sections) {
        const heading = detail.addRow([section.title]);
        detail.mergeCells(heading.number, 1, heading.number, 2);
        sectionRows.push(heading.number);
        for (const [label, value] of section.lines) {
          const pieces = String(value ?? "").match(/[\s\S]{1,240}/g) || [""];
          pieces.forEach((piece, index) =>
            detail.addRow([index ? "" : label, piece]),
          );
        }
      }
      detail._printSectionRows = sectionRows;
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
  for (const sheet of wb.worksheets) {
    styleExcelSheet(sheet, { sectionRows: sheet._printSectionRows || [] });
    delete sheet._printSectionRows;
  }
  return new Blob([await wb.xlsx.writeBuffer()], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
