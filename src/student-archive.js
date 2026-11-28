import JSZip from "jszip";
import { shortCaseReference } from "./case-reference.js";
import { historyFileName, profileReport } from "./history-export.js";

// Shared by live and offline student histories. Return a file only when every
// expected case has rendered successfully at the revision listed in history.
export async function buildStudentArchive(
  history,
  read,
  context,
  { active = () => true, onProgress = () => {}, renderers } = {},
) {
  const lib = renderers || (await import("./exports.js"));
  const checkActive = () => {
    if (!active()) throw new DOMException("Cancelled", "AbortError");
  };
  const changed = () =>
    Object.assign(new Error("Student cases changed"), {
      code: "pagination_expired",
    });
  const records = history.records.filter((r) =>
    ["case", "cases"].includes(r.kind),
  );
  if (new Set(records.map((r) => r.id)).size !== records.length)
    throw changed();
  const total = records.reduce(
    (count, r) => count + (r.kind === "case" ? 1 : r.caseSummaries.length),
    0,
  );
  const zip = new JSZip();
  const bundleContext = { ...context, dataAsOf: history.fetchedAt };
  checkActive();
  const summary = await lib.pdfReportBlob(
    profileReport(history),
    bundleContext,
  );
  checkActive();
  zip.file("ملخص سجل الطالب.pdf", await summary.arrayBuffer());
  let completed = 0;
  onProgress(completed, total);
  for (const record of records) {
    checkActive();
    const detail = await read("student-report", {
      studentId: history.student.id,
      recordId: record.id,
    });
    checkActive();
    if (
      detail.id !== record.id ||
      detail.kind !== record.kind ||
      detail.revision !== record.revision ||
      detail.form?.kind !== record.kind
    )
      throw changed();
    const entries =
      record.kind === "case"
        ? [
            {
              form: detail.form,
              date: detail.date,
              reference: detail.reference,
            },
          ]
        : Array.isArray(detail.form.rows) &&
            detail.form.rows.length === record.caseSummaries.length
          ? detail.form.rows.map((row) => ({
              form: { ...detail.form, rows: [row] },
              date: row.date || detail.date,
              reference: row.reference || detail.reference,
            }))
          : null;
    if (!entries?.length) throw changed();
    for (const entry of entries) {
      checkActive();
      const baseName = [
        `حالة-${String(completed + 1).padStart(3, "0")}`,
        entry.date || "بدون-تاريخ",
        shortCaseReference(entry.reference),
      ]
        .filter(Boolean)
        .join("-");
      const blob = await lib.pdfBlob(entry.form, {
        ...bundleContext,
        sourceRevision: detail.revision,
      });
      checkActive();
      zip.file(
        `الحالات/${historyFileName(baseName, "pdf")}`,
        await blob.arrayBuffer(),
      );
      onProgress(++completed, total);
    }
  }
  checkActive();
  if (completed !== total) throw changed();
  const blob = await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    mimeType: "application/zip",
  });
  checkActive();
  return blob;
}
