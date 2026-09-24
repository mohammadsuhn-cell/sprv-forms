// Shared print palette and column proportions. This layer never changes form data.
export const printStyle = Object.freeze({
  ink: "303632",
  muted: "626B64",
  line: "AAB2AB",
  soft: "EDF0EC",
  stripe: "F8F9F7",
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
