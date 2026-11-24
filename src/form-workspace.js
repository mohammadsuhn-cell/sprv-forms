import { newForm, today } from "./model.js";
import { prepareCaseDraft } from "./case-options.js";
import { isLinkedDaily, refreshDailyBrief } from "./daily-brief.js";
import { normalizeSearch } from "./roster.js";

export const isDailyForm = (kind) => ["absence", "daily"].includes(kind);
function bounded(store) {
  if (
    store.saved.length +
      Object.keys(store.drafts).length +
      (store.draftArchive || []).length >
    2000
  )
    throw Error(
      "بلغت سعة النماذج على الجهاز. نزّل نسخة احتياطية ثم احذف المسودات غير المطلوبة.",
    );
  return store;
}
const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, canonical(value[k])]),
    );
  return value;
};
const content = ({ receiverReference, savedAt, ...form }) => canonical(form);
export const sameFormContent = (a, b) =>
  Boolean(a && b && JSON.stringify(content(a)) === JSON.stringify(content(b)));

// Generated roster rows and linked counts alone are not unfinished input.
// Compare all other fields with a fresh form; unknown legacy fields are kept.
export function hasDraftInput(form, roster) {
  const scrub = (value, root = false) => {
    if (Array.isArray(value)) return value.map((v) => scrub(v));
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value)
          .filter(
            ([key]) =>
              key !== "id" &&
              !(
                root &&
                [
                  "createdAt",
                  "savedAt",
                  "receiverReference",
                  "date",
                  "from",
                  "to",
                  "roll",
                  ...(["absence", "late"].includes(form.kind)
                    ? ["className"]
                    : []),
                  ...(isLinkedDaily(form) ? ["summary"] : []),
                ].includes(key)
              ),
          )
          .map(([key, v]) => [key, scrub(v)]),
      );
    return value;
  };
  const fresh = newForm(form.kind, form, roster);
  const prepare = (f) => (f.kind === "case" ? prepareCaseDraft(f) : f);
  return (
    JSON.stringify(canonical(scrub(prepare(form), true))) !==
    JSON.stringify(canonical(scrub(prepare(fresh), true)))
  );
}

export function isUnfinished(store, form) {
  if (!form) return false;
  const saved = store.saved.find((s) => s.id === form.id);
  return saved
    ? !sameFormContent(saved, form)
    : Boolean(form.savedAt || hasDraftInput(form, store.roster));
}

export function unfinishedDrafts(store) {
  const byId = new Map((store.draftArchive || []).map((f) => [f.id, f]));
  for (const f of Object.values(store.drafts)) byId.set(f.id, f);
  return [...byId.values()]
    .filter((f) => isUnfinished(store, f))
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        String(b.createdAt || "").localeCompare(String(a.createdAt || "")),
    );
}

// Switching forms never submits a draft or replaces another unfinished entry.
export function activateDraft(store, form) {
  const previous = store.drafts[form.kind];
  const archive = (store.draftArchive || []).filter(
    (f) => f.id !== form.id && f.id !== previous?.id,
  );
  if (previous && previous.id !== form.id && isUnfinished(store, previous))
    archive.unshift(previous);
  const next = {
    ...store,
    drafts: { ...store.drafts, [form.kind]: form },
    draftArchive: archive,
  };
  return bounded(next);
}

export function discardDraft(store, id) {
  return {
    ...store,
    drafts: Object.fromEntries(
      Object.entries(store.drafts).filter(([, f]) => f.id !== id),
    ),
    draftArchive: (store.draftArchive || []).filter((f) => f.id !== id),
  };
}

const inScope = (form, profile) =>
  (form.grade || "") === (profile.grade || "") &&
  (form.syncSupervisorId || profile.syncSupervisorId
    ? form.syncSupervisorId === profile.syncSupervisorId
    : normalizeSearch(form.supervisor) === normalizeSearch(profile.supervisor));

export function dailyFormForDate(
  store,
  kind,
  profile,
  date = today(),
  excluded = [],
) {
  if (!isDailyForm(kind)) return null;
  const usable = (f) =>
    f.kind === kind &&
    f.date === date &&
    inScope(f, profile) &&
    !excluded.includes(f.id);
  const saved = store.saved
    .filter(usable)
    .sort((a, b) => (b.savedAt || "").localeCompare(a.savedAt || ""))[0];
  const drafts = [
    ...Object.values(store.drafts),
    ...(store.draftArchive || []),
  ];
  // Prefer corrections of the existing report over an accidentally started duplicate.
  return (
    (saved && drafts.find((f) => f.id === saved.id)) ||
    saved ||
    drafts.find(usable) ||
    null
  );
}

export function openWorkspaceForm(
  store,
  kind,
  profile,
  { date = today(), excluded = [] } = {},
) {
  const existing = dailyFormForDate(store, kind, profile, date, excluded);
  let form = existing || { ...newForm(kind, profile, store.roster), date };
  if (kind === "case" && !form.savedAt) form = prepareCaseDraft(form);
  if (isLinkedDaily(form) && !form.savedAt)
    form = refreshDailyBrief(form, store.saved, store.roster);
  return activateDraft(store, form);
}

export function saveWorkspaceForm(
  store,
  form,
  savedAt = new Date().toISOString(),
) {
  const previous = store.saved.find((s) => s.id === form.id);
  const saved = sameFormContent(previous, form)
    ? previous
    : { ...form, savedAt };
  return bounded({
    ...store,
    saved:
      previous === saved
        ? store.saved
        : [saved, ...store.saved.filter((s) => s.id !== form.id)],
    drafts: { ...store.drafts, [form.kind]: saved },
    draftArchive: (store.draftArchive || []).filter((f) => f.id !== form.id),
  });
}

export function formState(store, form, records = []) {
  const record = records.find((r) => r.formId === form?.id);
  if (record?.withdrawalRequestedAt) return "withdrawn";
  const saved = store.saved.find((s) => s.id === form?.id);
  if (!saved) return "draft";
  if (!sameFormContent(saved, form)) return "edited";
  if (!saved.syncSupervisorId) return "local";
  if (!record || record.savedAt !== saved.savedAt) return "pending";
  if (record.blocked) return "blocked";
  return record.receipt && !record.pending ? "received" : "pending";
}

// Restore missing drafts without displacing this device's newer work for an ID.
export function mergeWorkspaceBackup(store, incoming) {
  const drafts = { ...store.drafts };
  const archive = [...(store.draftArchive || [])];
  const ids = new Set([...Object.values(drafts), ...archive].map((f) => f.id));
  for (const f of [
    ...Object.values(incoming.drafts),
    ...(incoming.draftArchive || []),
  ]) {
    if (ids.has(f.id)) continue;
    ids.add(f.id);
    if (!drafts[f.kind]) drafts[f.kind] = f;
    else archive.push(f);
  }
  return bounded({
    ...store,
    drafts,
    draftArchive: archive,
    roster: store.roster || incoming.roster,
    profile: {
      ...store.profile,
      grade: store.profile.grade || incoming.profile.grade || "",
    },
    saved: [
      ...store.saved,
      ...incoming.saved.filter((s) => !store.saved.some((a) => a.id === s.id)),
    ],
  });
}
