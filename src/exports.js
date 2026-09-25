import { actionText } from "./case-options.js";
import { exportStamp } from "./export-stamp.js";
import { report, withSchoolIdentity } from "./model.js";
import {
  printStyle as colors,
  columnPercentages,
  reportHeader,
} from "./export-style.js";
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
  const stamp = exportStamp(form.supervisor);
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
    head = reportHeader(r, stamp),
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
  const noBorders = Object.fromEntries(
    Object.keys(borders).map((side) => [
      side,
      { style: BorderStyle.NONE, size: 0, color: colors.white },
    ]),
  );
  const grid = (percentages, rows, tableBorders = borders) =>
    new Table({
      visuallyRightToLeft: true,
      layout: TableLayoutType.FIXED,
      columnWidths: percentages.map((v) => Math.round((v * pageWidth) / 100)),
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: tableBorders,
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
            fill: colors.soft,
            color: colors.ink,
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
  const metadata = [
      ...r.meta.filter(
        ([key]) => !["التاريخ", "من تاريخ", "إلى تاريخ"].includes(key),
      ),
      ["اسم المشرف", r.supervisor],
    ],
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
    [60, 40],
    [
      new TableRow({
        children: [
          new TableCell({
            margins: { top: 0, bottom: 120, left: 140, right: 0 },
            children: head.right.map((value, i) =>
              p(value, { bold: i !== 1, size: i === 1 ? 24 : 26 }),
            ),
          }),
          new TableCell({
            margins: { top: 0, bottom: 120, left: 0, right: 140 },
            children: head.left.map((value) => p(value, { size: 23 })),
          }),
        ],
      }),
    ],
    { ...noBorders, bottom: border },
  );
  const headerChildren = [
    headerTable,
    spacer(),
    p(r.title, { bold: true, size: 40, center: true }),
  ];
  if (head.issued)
    headerChildren.push(p(head.issued, { size: 23, center: true }));
  const children = [
    grid([17, 33, 17, 33], metaRows),
    spacer(),
    ...r.tables.flatMap((t) => [table(t), spacer()]),
    ...r.sections.flatMap((s) => [section(s), spacer()]),
    grid(
      [60, 40],
      [
        new TableRow({
          cantSplit: true,
          height: { value: 800, rule: HeightRule.ATLEAST },
          children: [
            cell(`اسم المشرف: ${r.supervisor}`, { bold: true, size: 26 }),
            cell("التوقيع: ................................", {
              bold: true,
              size: 26,
            }),
          ],
        }),
      ],
      noBorders,
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
              top: head.issued ? 3100 : 2700,
              bottom: 1100,
              footer: 360,
              left: 720,
              right: 720,
              header: 500,
            },
          },
        },
        headers: { default: new Header({ children: headerChildren }) },
        footers: {
          default: new Footer({
            children: [
              p(stamp.text, { size: 18, color: colors.muted, center: true }),
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
  const stamp = exportStamp(form.supervisor);
  const [{ renderPages }, { jsPDF }] = await Promise.all([
    import("./pdf-pages.js"),
    import("jspdf"),
  ]);
  const r = { ...report(form), exportStamp: stamp },
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

function styleExcelSheet(sheet, sectionRows = []) {
  const line = { style: "thin", color: { argb: `FF${colors.line}` } };
  sheet.views = [
    { rightToLeft: true, showGridLines: false, state: "frozen", ySplit: 6 },
  ];
  sheet.pageSetup.margins = {
    left: 0.35,
    right: 0.35,
    top: 0.4,
    bottom: 0.65,
    header: 0.15,
    footer: 0.2,
  };
  sheet.pageSetup.horizontalCentered = true;
  sheet.pageSetup.printTitlesRow = "1:6";
  sheet.pageSetup.printArea = `A1:${sheet.getColumn(sheet.columnCount).letter}${sheet.rowCount}`;
  sheet.eachRow((row) => {
    const section = sectionRows.includes(row.number);
    for (let i = 1; i <= sheet.columnCount; i++) {
      const cell = row.getCell(i);
      cell.font = {
        name: "Arial",
        size:
          row.number === 4
            ? 20
            : row.number <= 3
              ? 13
              : row.number === 5
                ? 12
                : 14,
        bold: row.number <= 6 || section,
        color: { argb: `FF${colors.ink}` },
      };
      cell.alignment = {
        readingOrder: "rtl",
        horizontal:
          row.number === 4
            ? "center"
            : row.number <= 3 && i > Math.ceil(sheet.columnCount / 2)
              ? "left"
              : "right",
        vertical: "middle",
        wrapText: true,
      };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: {
          argb: `FF${row.number === 6 || section ? colors.soft : colors.white}`,
        },
      };
      cell.border =
        row.number <= 5
          ? row.number === 3
            ? { bottom: line }
            : {}
          : { top: line, bottom: line, left: line, right: line };
    }
    let required = row.number === 4 ? 44 : row.number <= 3 ? 26 : 36;
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
          (sum, text) =>
            sum +
            Math.max(
              1,
              Math.ceil(text.length / Math.max(10, (width - 3) * 0.65)),
            ),
          0,
        );
      required = Math.max(
        required,
        lineCount * (row.number <= 5 ? 18 : 22) + 12,
      );
    });
    row.height = Math.max(row.height || 0, required);
  });
}
function excelHeader(sheet, r, stamp, title = r.title) {
  const head = reportHeader(r, stamp),
    count = sheet.columns.length,
    half = Math.ceil(count / 2);
  for (let row = 1; row <= 3; row++) {
    if (half > 1) sheet.mergeCells(row, 1, row, half);
    if (count - half > 1) sheet.mergeCells(row, half + 1, row, count);
    sheet.getCell(row, 1).value = head.right[row - 1] || "";
    sheet.getCell(row, half + 1).value = head.left[row - 1] || "";
  }
  sheet.mergeCells(4, 1, 4, count);
  sheet.getCell(4, 1).value = title;
  sheet.mergeCells(5, 1, 5, count);
  const metadata = [
    ...r.meta
      .filter(([key]) => !["التاريخ", "من تاريخ", "إلى تاريخ"].includes(key))
      .map(([key, value]) => `${key}: ${value}`),
    `اسم المشرف: ${r.supervisor}`,
  ].join("    ");
  sheet.getCell(5, 1).value = [head.issued, metadata]
    .filter(Boolean)
    .join("\n");
}
export async function excelBlob(form) {
  const stamp = exportStamp(form.supervisor);
  form = withSchoolIdentity(form);
  const r = report(form);
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  const addSheet = (name, widths, landscape) => {
    const sheet = wb.addWorksheet(name, {
      pageSetup: {
        paperSize: 9,
        orientation: landscape ? "landscape" : "portrait",
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
      },
    });
    sheet.columns = widths.map((width) => ({ width }));
    return sheet;
  };
  const sectionRows = new Map();
  if (["case", "cases"].includes(form.kind)) {
    const sheet = addSheet("الحالات", [16, 32, 12, 28, 32, 18], true);
    excelHeader(sheet, r, stamp, "سجل الحالات والمتابعة");
    const records = form.kind === "case" ? [form] : form.rows;
    sheet.addTable({
      name: "Cases",
      ref: "A6",
      headerRow: true,
      style: { theme: "TableStyleLight1", showRowStripes: false },
      columns: [
        "التاريخ",
        "اسم الطالب",
        "الشعبة",
        "نوع الواقعة",
        "الإجراء المتخذ",
        "موعد المتابعة",
      ].map((name) => ({ name })),
      rows: records.map((v) =>
        [
          v.date,
          v.student,
          v.className,
          v.type,
          actionText(v.action, v.actionState),
          v.due,
        ].map((v) => String(v || "")),
      ),
    });
    if (form.kind === "case") {
      const detail = addSheet("تفاصيل", [26, 65], false);
      excelHeader(detail, r, stamp);
      detail.addRow(["البيان", "التفاصيل"]);
      const headings = [];
      for (const section of r.sections) {
        const heading = detail.addRow([section.title]);
        detail.mergeCells(heading.number, 1, heading.number, 2);
        headings.push(heading.number);
        for (const [label, value] of section.lines) {
          const pieces = String(value ?? "").match(/[\s\S]{1,240}/g) || [""];
          pieces.forEach((piece, index) =>
            detail.addRow([index ? "" : label, piece]),
          );
        }
      }
      sectionRows.set(detail.id, headings);
    }
  } else {
    const parts = [
      ...r.tables,
      ...r.sections.map((section) => ({
        title: section.title,
        columns: ["البيان", "التفاصيل"],
        rows: section.lines,
      })),
    ];
    for (const [index, part] of parts.entries()) {
      const count = Math.max(2, part.columns.length);
      const widths = Array.from({ length: count }, (_, i) =>
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
      );
      const sheet = addSheet(
        `${index + 1} ${part.title}`.slice(0, 31),
        widths,
        count > 4,
      );
      excelHeader(sheet, r, stamp, `${r.title} · ${part.title}`);
      sheet.addRow(part.columns);
      for (const values of part.rows) {
        const pieces = values.map(
          (value) => String(value ?? "").match(/[\s\S]{1,240}/g) || [""],
        );
        for (let i = 0; i < Math.max(...pieces.map((p) => p.length)); i++)
          sheet.addRow(pieces.map((p) => p[i] || ""));
      }
      if (part.columns.length === 1)
        for (let row = 6; row <= sheet.rowCount; row++)
          sheet.mergeCells(row, 1, row, count);
    }
  }
  for (const sheet of wb.worksheets) {
    styleExcelSheet(sheet, sectionRows.get(sheet.id) || []);
    stampExcelSheet(sheet, stamp);
  }
  return new Blob([await wb.xlsx.writeBuffer()], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

function stampExcelSheet(sheet, stamp) {
  const escape = (value) => value.replace(/&/g, "&&");
  sheet.headerFooter.oddFooter = `&C&"Arial,Regular"&9${escape(stamp.name)}\n${escape(stamp.generated)}&L&P / &N`;
  sheet.pageSetup.margins.bottom = 0.65;
}
