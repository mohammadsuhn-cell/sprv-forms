import { exportStamp, canvasExportFooter } from "./export-stamp.js";
import { renderAbsencePages } from "./absence-pages.js";
import {
  printStyle as colors,
  columnPercentages,
  reportHeader,
} from "./export-style.js";

// Draw complete lines with native Arabic shaping; never assemble separate letters.
export async function renderPages(r) {
  await Promise.all([
    document.fonts.load('400 18px "Noto Sans Arabic"'),
    document.fonts.load('600 18px "Noto Sans Arabic"'),
  ]);
  await document.fonts.ready;
  if (r.layout === "absence") return renderAbsencePages(r);
  const stamp = r.exportStamp || exportStamp(r.supervisor);
  const head = reportHeader(r, stamp);
  const width = r.landscape ? 1123 : 794,
    height = r.landscape ? 794 : 1123,
    margin = 44,
    footer = canvasExportFooter(stamp, width, margin),
    bottom = height - Math.max(60, footer.height + 12),
    contentWidth = width - margin * 2;
  const pages = [];
  let canvas, ctx, y;
  const font = (size = 18, bold = false) => {
    ctx.font = `${bold ? 600 : 400} ${size}px "Noto Sans Arabic", Arial, sans-serif`;
    ctx.direction = "rtl";
    ctx.textAlign = "right";
    ctx.textBaseline = "alphabetic";
  };
  const draw = (value, x, top, size = 18, bold = false, color = colors.ink) => {
    font(size, bold);
    ctx.fillStyle = `#${color}`;
    ctx.fillText(String(value ?? ""), x, top + size * 1.45);
  };
  const box = (left, top, w, h, fill = colors.white) => {
    ctx.fillStyle = `#${fill}`;
    ctx.fillRect(left, top, w, h);
    ctx.strokeStyle = `#${colors.line}`;
    ctx.lineWidth = 0.85;
    ctx.strokeRect(left, top, w, h);
  };
  const wrap = (value, maxWidth, size = 18, bold = false) => {
    font(size, bold);
    const lines = [];
    for (const para of String(value ?? "").split("\n")) {
      let line = "";
      for (const word of para.split(/\s+/u)) {
        const candidate = line ? line + " " + word : word;
        if (ctx.measureText(candidate).width <= maxWidth) {
          line = candidate;
          continue;
        }
        if (line) {
          lines.push(line);
          line = "";
        }
        if (ctx.measureText(word).width <= maxWidth) {
          line = word;
          continue;
        }
        for (const { segment } of new Intl.Segmenter("ar", {
          granularity: "grapheme",
        }).segment(word)) {
          if (line && ctx.measureText(line + segment).width > maxWidth) {
            lines.push(line);
            line = "";
          }
          line += segment;
        }
      }
      lines.push(line);
    }
    return lines;
  };
  const newPage = () => {
    canvas = document.createElement("canvas");
    canvas.width = width * 2;
    canvas.height = height * 2;
    ctx = canvas.getContext("2d");
    ctx.scale(2, 2);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
    pages.push(canvas);
    const top = 22,
      rightWidth = contentWidth * 0.6,
      leftWidth = contentWidth - rightWidth;
    let rightY = top,
      leftY = top;
    head.right.forEach((value, index) => {
      const size = index === 1 ? 16 : 17;
      for (const line of wrap(value, rightWidth - 18, size, index !== 1)) {
        draw(line, width - margin, rightY, size, index !== 1);
        rightY += 27;
      }
    });
    head.left.forEach((value) => {
      for (const line of wrap(value, leftWidth - 18, 14)) {
        draw(line, margin + leftWidth - 16, leftY, 14);
        leftY += 27;
      }
    });
    y = Math.max(rightY, leftY) + 8;
    ctx.strokeStyle = `#${colors.line}`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(margin, y);
    ctx.lineTo(width - margin, y);
    ctx.stroke();
    font(25, true);
    ctx.textAlign = "center";
    ctx.fillStyle = `#${colors.ink}`;
    ctx.fillText(r.title, width / 2, y + 37);
    y += 51;
    if (head.issued) {
      for (const line of wrap(head.issued, contentWidth - 12, 14)) {
        font(14);
        ctx.textAlign = "center";
        ctx.fillText(line, width / 2, y + 18);
        y += 24;
      }
      y += 8;
    }
    y += 12;
    footer.draw(ctx, height, pages.length);
  };
  const ensure = (h) => {
    if (y + h > bottom) newPage();
  };
  const sectionBar = (title) => {
    box(margin, y, contentWidth, 38, colors.soft);
    draw(title, width - margin - 16, y + 3, 18, true);
    y += 38;
  };
  // Each row can continue across pages, with its section/table header repeated.
  const row = (cells, percentages, options = {}) => {
    const widths = percentages.map((p) => (contentWidth * p) / 100),
      size = options.size || 16,
      lineHeight = size * 1.8,
      padding = r.layout === "daily" ? 8 : 12;
    const isLabel = (i) => options.header || options.labels?.includes(i);
    const lines = cells.map((v, i) =>
      wrap(v, widths[i] - padding * 2, size, isLabel(i)),
    );
    const total = Math.max(...lines.map((l) => l.length), 1);
    let offset = 0;
    while (offset < total) {
      if (y + lineHeight + padding * 2 > bottom) {
        newPage();
        options.repeat?.();
      }
      const take = Math.max(
        1,
        Math.min(
          total - offset,
          Math.floor((bottom - y - padding * 2) / lineHeight),
        ),
      );
      const h = Math.max(
        take * lineHeight + padding * 2,
        options.minHeight || 0,
      );
      let right = width - margin;
      cells.forEach((_, i) => {
        const fill = options.header
          ? colors.soft
          : isLabel(i)
            ? colors.soft
            : options.stripe
              ? colors.stripe
              : colors.white;
        box(right - widths[i], y, widths[i], h, fill);
        for (let n = 0; n < take; n++)
          if (lines[i][offset + n] !== undefined)
            draw(
              lines[i][offset + n],
              right - padding,
              y + padding - 3 + n * lineHeight,
              size,
              isLabel(i),
              colors.ink,
            );
        right -= widths[i];
      });
      y += h;
      offset += take;
    }
  };
  newPage();
  const metadata = [
    ...r.meta.filter(
      ([key]) => !["التاريخ", "من تاريخ", "إلى تاريخ"].includes(key),
    ),
    ["اسم المشرف", r.supervisor],
  ];
  for (let i = 0; i < metadata.length; i += 2) {
    const pairs = metadata.slice(i, i + 2);
    row(
      pairs.flat(),
      pairs.length === 2
        ? r.layout === "daily"
          ? [21, 29, 21, 29]
          : [17, 33, 17, 33]
        : [17, 83],
      {
        labels: pairs.map((_, j) => j * 2),
        size: 15,
      },
    );
  }
  y += 18;
  for (const table of r.tables) {
    const weights = columnPercentages(table.columns);
    const heading = () => {
      sectionBar(table.title);
      row(table.columns, weights, { header: true, size: 15 });
    };
    ensure(155);
    heading();
    table.rows.forEach((cells, index) =>
      row(cells, weights, {
        size: 16,
        stripe: index % 2 === 1,
        labels:
          table.totalRow && index === table.rows.length - 1
            ? cells.map((_, i) => i)
            : [],
        repeat: heading,
      }),
    );
    y += 18;
  }
  for (const section of r.sections) {
    ensure(112);
    const heading = () => sectionBar(section.title);
    heading();
    section.lines.forEach(([key, value]) =>
      row(key ? [key, value] : [value], key ? [25, 75] : [100], {
        labels: key ? [0] : [],
        size: 17,
        repeat: heading,
      }),
    );
    y += 18;
  }
  const signature = wrap(
    `اسم المشرف: ${r.supervisor}`,
    contentWidth / 2 - 20,
    16,
  );
  ensure(Math.max(76, signature.length * 28 + 16));
  signature.forEach((line, i) =>
    draw(line, width - margin, y + 10 + i * 28, 16, true),
  );
  draw(
    "التوقيع: ................................",
    margin + contentWidth / 2 - 20,
    y + 10,
    16,
    true,
  );
  return pages;
}
