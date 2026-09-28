export const validCaseReference = (value) =>
  typeof value === "string" && /^CASE-\d{4}-\d{6,12}$/.test(value);

export const caseReference = (form) =>
  form.kind === "case" ? form.receiverReference || form.reference || "" : "";

export const caseReferenceLabel = (form) =>
  caseReference(form) || (form.syncSupervisorId ? "بانتظار رقم الحالة" : "");

// Receipt metadata is portable, but never changes the signed submission or
// creates a new revision just because the receiver acknowledged a case.
export function submissionForm(form) {
  const { receiverReference, ...submitted } = form;
  return submitted;
}

export function withReceivedReferences(store, records) {
  const references = new Map(
    records
      .filter((r) => validCaseReference(r.receipt?.reference))
      .map((r) => [r.formId, r.receipt.reference]),
  );
  let changed = false;
  const apply = (form) => {
    const reference = references.get(form.id);
    if (
      form.kind !== "case" ||
      !reference ||
      form.syncSupervisorId !== store.profile.syncSupervisorId ||
      form.receiverReference === reference
    )
      return form;
    changed = true;
    return { ...form, receiverReference: reference };
  };
  const saved = store.saved.map(apply);
  const drafts = Object.fromEntries(
    Object.entries(store.drafts).map(([k, f]) => [k, apply(f)]),
  );
  return changed ? { ...store, saved, drafts } : store;
}
