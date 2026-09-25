import { exportStamp, canvasExportFooter } from "./export-stamp.js";
import { arDigits } from "./model.js";

// Native canvas text keeps Arabic shaping intact in the exported, offline PDF.
export function renderAbsencePages(report) {
  const width = 1123,
    height = 794,
    margin = 36,
    gridWidth = width - margin * 2;
  const footer = canvasExportFooter(
    report.exportStamp || exportStamp(report.supervisor),
    width,
    margin,
  );
  const extraFooter = Math.max(0, footer.height - 40);
  const gridTop = 180,
    headHeight = 36,
    bodyTop = gridTop + headHeight,
    bodyHeight = 392 - extraFooter;
  const pages = [],
    sheet = report.absence;
  const measure = document.createElement("canvas").getContext("2d");
  function font(ctx, size = 16, bold = false) {
    ctx.font = `${bold ? 600 : 400} ${size}px "Noto Sans Arabic", Arial, sans-serif`;
    ctx.direction = "rtl";
    ctx.textAlign = "right";
    ctx.textBaseline = "alphabetic";
  }
  function wrap(value, maxWidth, size = 16) {
    font(measure, size);
    const lines = [];
    let line = "";
    for (const word of String(value || "").split(/\s+/u)) {
      if (line && measure.measureText(`${line} ${word}`).width > maxWidth) {
        lines.push(line);
        line = "";
      }
      if (measure.measureText(word).width > maxWidth) {
        for (const { segment } of new Intl.Segmenter("ar", {
          granularity: "grapheme",
        }).segment(word)) {
          if (line && measure.measureText(line + segment).width > maxWidth) {
            lines.push(line);
            line = "";
          }
          line += segment;
        }
      } else line = line ? `${line} ${word}` : word;
    }
    if (line) lines.push(line);
    return lines.length ? lines : [""];
  }
  // Use balanced groups for grades with more than six classes.
  const groupSize = Math.ceil(
    sheet.classes.length / Math.ceil(sheet.classes.length / 6),
  );
  const plans = [];
  for (let start = 0; start < sheet.classes.length; start += groupSize) {
    const classes = sheet.classes.slice(start, start + groupSize),
      cellWidth = gridWidth / classes.length;
    const columns = classes.map((c) => {
      const segments = [[]];
      let used = 0;
      for (const name of c.students) {
        let lines = wrap(name, cellWidth - 18);
        while (lines.length) {
          const room = Math.floor((bodyHeight - used - 4) / 22);
          if (!room) {
            segments.push([]);
            used = 0;
            continue;
          }
          // Keep a whole name together unless it exceeds one page by itself.
          if (
            used &&
            lines.length > room &&
            lines.length * 22 + 4 <= bodyHeight
          ) {
            segments.push([]);
            used = 0;
            continue;
          }
          const part = lines.splice(0, room),
            rowHeight = part.length * 22 + 4;
          segments.at(-1).push({ lines: part, height: rowHeight });
          used += rowHeight;
        }
      }
      return segments;
    });
    const count = Math.max(...columns.map((c) => c.length));
    for (let part = 0; part < count; part++)
      plans.push({
        classes,
        cellWidth,
        columns: columns.map((c) => c[part] || []),
        continuation: part > 0,
      });
  }
  plans.forEach((plan, index) => {
    const canvas = document.createElement("canvas");
    canvas.width = width * 2;
    canvas.height = height * 2;
    const ctx = canvas.getContext("2d");
    ctx.scale(2, 2);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    function text(value, x, y, size = 16, bold = false, align = "right") {
      font(ctx, size, bold);
      ctx.textAlign = align;
      ctx.fillStyle = "#202420";
      ctx.fillText(String(value ?? ""), x, y);
    }
    function line(x1, y1, x2, y2, weight = 0.8) {
      ctx.strokeStyle = "#535953";
      ctx.lineWidth = weight;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    function box(x, y, w, h, fill) {
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fillRect(x, y, w, h);
      }
      ctx.strokeStyle = "#535953";
      ctx.lineWidth = 0.8;
      ctx.strokeRect(x, y, w, h);
    }
    text(report.ministry, width - margin, 40, 17, true);
    text(report.district, width - margin, 66, 17);
    text(report.school, width - margin, 92, 17, true);
    text(`اليوم: ${sheet.day}`, margin + 300, 40, 16);
    text(
      `التاريخ: ${arDigits(sheet.date.split("-").reverse().join(" / "))}`,
      margin + 300,
      66,
      16,
    );
    text(`العام الدراسي: ${report.year}`, margin + 300, 92, 16);
    line(margin, 107, width - margin, 107, 1.2);
    text(report.title, width / 2, 140, 25, true, "center");
    text(
      sheet.grade + (plan.continuation ? " · تابع" : ""),
      width / 2,
      167,
      17,
      false,
      "center",
    );
    plan.classes.forEach((c, column) => {
      const x = width - margin - (column + 1) * plan.cellWidth;
      box(x, gridTop, plan.cellWidth, headHeight, "#f0f1ef");
      text(
        `الشعبة ${c.className}`,
        x + plan.cellWidth / 2,
        gridTop + 25,
        18,
        true,
        "center",
      );
      box(x, bodyTop, plan.cellWidth, bodyHeight);
      let y = bodyTop;
      for (const row of plan.columns[column]) {
        row.lines.forEach((v, i) =>
          text(v, x + plan.cellWidth - 9, y + 21 + i * 22),
        );
        y += row.height;
        line(x, y, x + plan.cellWidth, y, 0.5);
      }
      while (y + 26 < bodyTop + bodyHeight) {
        y += 26;
        line(x, y, x + plan.cellWidth, y, 0.5);
      }
      [
        ["الحضور", c.present],
        ["الغياب", c.absent],
      ].forEach(([label, value], row) => {
        const top = bodyTop + bodyHeight + row * 32;
        box(x, top, plan.cellWidth, 32, row ? "#f0f1ef" : undefined);
        text(label, x + plan.cellWidth - 10, top + 23, 16, true);
        text(arDigits(value), x + 18, top + 23, 18, true, "left");
      });
    });
    if (index === plans.length - 1) {
      const totals = [
        ["إجمالي المقيدين", sheet.total],
        ["إجمالي الحضور", sheet.present],
        ["إجمالي الغياب", sheet.absent],
      ];
      totals.forEach(([label, value], i) => {
        const w = gridWidth / 3,
          x = width - margin - (i + 1) * w;
        box(x, 684 - extraFooter, w, 36, "#f0f1ef");
        text(
          `${label}: ${arDigits(value)}`,
          x + w / 2,
          709 - extraFooter,
          18,
          true,
          "center",
        );
      });
      text(
        "توقيع المشرف: ................................",
        width - margin,
        739 - extraFooter,
        16,
        true,
      );
      text(
        "توقيع مدير المدرسة: ................................",
        margin + 380,
        739 - extraFooter,
        16,
        true,
      );
    }
    footer.draw(ctx, height, `${index + 1} / ${plans.length}`);
    pages.push(canvas);
  });
  return pages;
}
