// Freeze the export time once per generated file; never use live print-date fields.
export function exportStamp(supervisor, now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kuwait",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const arabic = (value) => value.replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[d]);
  const name = `اسم المشرف: ${String(supervisor || "")
    .replace(/\s+/gu, " ")
    .trim()}`;
  const generated = `تاريخ التصدير: ${arabic(`${parts.year}/${parts.month}/${parts.day}`)} · ${arabic(`${parts.hour}:${parts.minute}:${parts.second}`)} (الكويت)`;
  return { name, generated, text: `${name} | ${generated}` };
}

export function canvasExportFooter(stamp, width, margin) {
  const ctx = document.createElement("canvas").getContext("2d");
  const font = '400 11px "Noto Sans Arabic", Arial, sans-serif';
  ctx.font = font;
  const lines = [];
  let line = "";
  const available = width - margin * 2 - 54;
  for (const word of stamp.text.split(/\s+/u)) {
    if (line && ctx.measureText(`${line} ${word}`).width > available) {
      lines.push(line);
      line = "";
    }
    if (ctx.measureText(word).width <= available)
      line = line ? `${line} ${word}` : word;
    else
      for (const { segment } of new Intl.Segmenter("ar", {
        granularity: "grapheme",
      }).segment(word)) {
        if (line && ctx.measureText(line + segment).width > available) {
          lines.push(line);
          line = "";
        }
        line += segment;
      }
  }
  if (line) lines.push(line);
  const height = Math.max(40, lines.length * 16 + 24);
  return {
    height,
    draw(context, pageHeight, pageNumber) {
      context.save();
      context.strokeStyle = "#a5aaa5";
      context.lineWidth = 0.6;
      context.beginPath();
      context.moveTo(margin, pageHeight - height);
      context.lineTo(width - margin, pageHeight - height);
      context.stroke();
      context.font = font;
      context.fillStyle = "#60665f";
      context.direction = "rtl";
      context.textAlign = "right";
      context.textBaseline = "alphabetic";
      lines.forEach((value, i) =>
        context.fillText(
          value,
          width - margin,
          pageHeight - 16 - (lines.length - 1 - i) * 16,
        ),
      );
      context.textAlign = "left";
      context.fillText(
        String(pageNumber).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[d]),
        margin,
        pageHeight - 16,
      );
      context.restore();
    },
  };
}
