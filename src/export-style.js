// Shared print palette and column proportions. This layer never changes form data.
export const printStyle = Object.freeze({
  ink: "202420",
  muted: "60665F",
  line: "535953",
  soft: "F0F1EF",
  stripe: "FFFFFF",
  white: "FFFFFF",
});
export function columnPercentages(columns) {
  const weights = columns.map((label) =>
    /التفاصيل|وصف|النتيجة/.test(label)
      ? 3
      : /اسم الطالب|أسماء|المعلم|البديل/.test(label)
        ? 2
        : /الشعبة|الحصة|الحاضرون|الغائبون|المتأخرون/.test(label)
          ? 1
          : 1.6,
  );
  const total = weights.reduce((a, b) => a + b, 0);
  return weights.map((weight) => (weight * 100) / total);
}

export function reportHeader(r, stamp) {
  const date = r.recordDate ? new Date(`${r.recordDate}T12:00:00`) : null;
  const day =
    date && !Number.isNaN(date.valueOf())
      ? new Intl.DateTimeFormat("ar-KW", { weekday: "long" }).format(date)
      : "";
  const period = r.meta.filter(([key]) =>
    ["من تاريخ", "إلى تاريخ"].includes(key),
  );
  const left = period.length
    ? period.map(([key, value]) => `${key}: ${value}`)
    : [
        day && `اليوم: ${day}`,
        ...r.meta
          .filter(([key]) => key === "التاريخ")
          .map(([key, value]) => `${key}: ${value}`),
      ];
  left.push(`العام الدراسي: ${r.year}`);
  return {
    right: [r.ministry, r.district, r.school],
    left: left.filter(Boolean),
    issued:
      r.kind === "late"
        ? stamp.generated.replace("تاريخ التصدير:", "تاريخ ووقت إصدار الكشف:")
        : "",
  };
}
