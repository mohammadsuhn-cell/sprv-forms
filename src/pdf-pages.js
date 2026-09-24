// Browser text shaping draws complete lines, preserving Arabic ligatures and bidi order.
// All fonts are local assets; no form contents leave the device.
export async function renderPages(r) {
  await Promise.all([
    document.fonts.load('400 16px "Noto Sans Arabic"'),
    document.fonts.load('600 16px "Noto Sans Arabic"'),
  ]);
  await document.fonts.ready;
  const width = r.landscape ? 1123 : 794,
    height = r.landscape ? 794 : 1123;
  const margin = 44,
    bottom = height - 60,
    contentWidth = width - margin * 2;
  const pages = [];
  let canvas, ctx, y;
  const font = (size = 14, bold = false) => {
    ctx.font = `${bold ? 600 : 400} ${size}px "Noto Sans Arabic", Arial, sans-serif`;
    ctx.direction = "rtl";
    ctx.textAlign = "right";
    ctx.textBaseline = "alphabetic";
  };
  const draw = (value, x, top, size = 14, bold = false, color = "#303530") => {
    font(size, bold);
    ctx.fillStyle = color;
    ctx.fillText(String(value ?? ""), x, top + size * 1.45);
  };
  const wrap = (value, maxWidth, size = 14, bold = false) => {
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
    draw(r.school || "", width - margin, 36, 17, true);
    if (r.year) draw("العام الدراسي: " + r.year, width - margin, 70, 12);
    draw(r.title, width - margin, 100, 23, true);
    ctx.strokeStyle = "#6b706a";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(margin, 148);
    ctx.lineTo(width - margin, 148);
    ctx.stroke();
    draw(
      String(pages.length).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[d]),
      width / 2,
      height - 40,
      11,
    );
    y = 164;
  };
  const ensure = (h) => {
    if (y + h > bottom) newPage();
  };
  const paragraph = (text, size = 14, bold = false) => {
    for (const line of wrap(text, contentWidth, size, bold)) {
      ensure(30);
      draw(line, width - margin, y, size, bold);
      y += 30;
    }
    y += 5;
  };
  newPage();
  for (const [key, value] of r.meta) paragraph(`${key}: ${value}`);
  for (const table of r.tables) {
    const weights =
      table.columns.length === 8
        ? [10, 17, 7, 14, 20, 14, 10, 8]
        : Array(table.columns.length).fill(100 / table.columns.length);
    const widths = weights.map((w) => (contentWidth * w) / 100),
      lineHeight = 25;
    const row = (cells, header = false, repeatHeader) => {
      const lines = cells.map((v, i) => wrap(v, widths[i] - 16, 12, header));
      const total = Math.max(...lines.map((l) => l.length));
      let offset = 0;
      while (offset < total) {
        if (y + lineHeight + 16 > bottom) {
          newPage();
          if (repeatHeader) repeatHeader();
        }
        const take = Math.max(
          1,
          Math.min(total - offset, Math.floor((bottom - y - 16) / lineHeight)),
        );
        const h = take * lineHeight + 16;
        let right = width - margin;
        cells.forEach((_, i) => {
          ctx.fillStyle = header ? "#eef0ed" : "#fff";
          ctx.fillRect(right - widths[i], y, widths[i], h);
          ctx.strokeStyle = "#ced3cc";
          ctx.lineWidth = 0.7;
          ctx.strokeRect(right - widths[i], y, widths[i], h);
          for (let n = 0; n < take; n++)
            if (lines[i][offset + n] !== undefined)
              draw(
                lines[i][offset + n],
                right - 8,
                y + 7 + n * lineHeight,
                12,
                header,
              );
          right -= widths[i];
        });
        y += h;
        offset += take;
      }
    };
    ensure(115);
    paragraph(table.title, 16, true);
    const header = () => row(table.columns, true);
    header();
    for (const cells of table.rows) row(cells, false, header);
    y += 18;
  }
  for (const section of r.sections) {
    ensure(90);
    paragraph(section.title, 16, true);
    for (const [key, value] of section.lines)
      paragraph(key ? `${key}: ${value}` : value);
    y += 10;
  }
  ensure(85);
  paragraph("اسم المشرف: " + r.supervisor);
  paragraph("التوقيع: ____________________");
  return pages;
}
