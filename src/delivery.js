// Device credentials and pending submissions are deliberately separate from portable JSON backups.
// The private signing key is non-exportable and never placed in localStorage or an activation URL.
import { storageKey, validateStore } from "./model.js";
import { submissionForm, validCaseReference } from "./case-reference.js";
const databaseName = "sprv-delivery-v1";
let database;
const request = (r) =>
  new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
async function db() {
  if (!database)
    database = new Promise((resolve, reject) => {
      const r = indexedDB.open(databaseName, 1);
      r.onupgradeneeded = () => {
        r.result.createObjectStore("settings");
        r.result.createObjectStore("records", { keyPath: "id" });
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  return database;
}
async function transaction(store, mode, fn) {
  const d = await db(),
    tx = d.transaction(store, mode);
  const done = new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onabort = () => reject(tx.error || Error("Device storage unavailable"));
    tx.onerror = () => {};
  });
  try {
    const value = await fn(tx.objectStore(store));
    await done;
    return value;
  } catch (error) {
    try {
      tx.abort();
    } catch {}
    await done.catch(() => {});
    throw error;
  }
}
const readSetting = (key) =>
  transaction("settings", "readonly", (s) => request(s.get(key)));
const writeSetting = (key, value) =>
  transaction("settings", "readwrite", (s) => request(s.put(value, key)));
export function endpointURL(value) {
  const url = new URL(value);
  const local =
    ["localhost", "127.0.0.1"].includes(url.hostname) &&
    ["localhost", "127.0.0.1"].includes(location.hostname);
  if (
    (url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    throw Error("عنوان الاستقبال غير صالح");
  return url.origin;
}
const base64 = (bytes) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
export function parseInvitation(value) {
  const fragment = value.includes("#")
    ? value.slice(value.indexOf("#") + 1)
    : value;
  const raw = new URLSearchParams(fragment).get("activate");
  if (!raw || raw.length > 3000) throw Error("رابط التفعيل غير صالح");
  let invitation;
  try {
    invitation = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(atob(raw.replace(/-/g, "+").replace(/_/g, "/")), (c) =>
          c.charCodeAt(0),
        ),
      ),
    );
  } catch {
    throw Error("رابط التفعيل غير صالح");
  }
  if (
    !/^[A-Za-z0-9_-]{43}$/.test(invitation.code || "") ||
    typeof invitation.serverId !== "string"
  )
    throw Error("رابط التفعيل غير صالح");
  return { ...invitation, endpoint: endpointURL(invitation.endpoint) };
}
async function post(endpoint, path, body) {
  const response = await fetch(endpoint + path, {
    method: "POST",
    mode: "cors",
    credentials: "omit",
    cache: "no-store",
    redirect: "error",
    referrerPolicy: "no-referrer",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json();
  if (!response.ok)
    throw Object.assign(Error(data.error || "تعذّر إرسال السجل"), {
      status: response.status,
      code: data.code,
    });
  return data;
}
export async function previewInvitation(invitation) {
  const result = await post(invitation.endpoint, "/v1/invitation", {
    code: invitation.code,
  });
  if (result.serverId !== invitation.serverId)
    throw Error("عنوان الاستقبال لا يطابق رابط التفعيل");
  return result;
}
export async function activate(invitation) {
  const old = await readSetting("connection");
  if (old) throw Error("هذا المتصفح مرتبط بمشرف بالفعل");
  let pending = await readSetting("activation");
  if (
    !pending ||
    pending.code !== invitation.code ||
    pending.serverId !== invitation.serverId
  ) {
    const keys = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign", "verify"],
    );
    pending = {
      ...invitation,
      privateKey: keys.privateKey,
      publicKey: await crypto.subtle.exportKey("jwk", keys.publicKey),
    };
    // Persist BEFORE sending. A lost response can safely retry using the same key.
    await writeSetting("activation", pending);
  }
  const paired = await post(invitation.endpoint, "/v1/pair", {
    code: invitation.code,
    publicKey: pending.publicKey,
  });
  if (
    paired.serverId !== invitation.serverId ||
    !paired.supervisor?.id ||
    !paired.deviceId
  )
    throw Error("استجابة تفعيل غير صالحة");
  const connection = {
    ...paired,
    endpoint: invitation.endpoint,
    privateKey: pending.privateKey,
  };
  await writeSetting("connection", connection);
  await writeSetting("activation", null);
  return publicConnection(connection);
}
const publicConnection = (c) =>
  c
    ? {
        serverId: c.serverId,
        deviceId: c.deviceId,
        supervisor: c.supervisor,
        endpoint: c.endpoint,
      }
    : null;

// Shared history is fetched on demand, never added to local forms or the delivery queue.
async function signedRead(action, params) {
  const connection = await readSetting("connection");
  if (!connection)
    throw Object.assign(Error("فعّل اتصال المشرف من الإعدادات أولًا"), {
      code: "unpaired",
    });
  const message = JSON.stringify({
    ...params,
    protocol: 1,
    serverId: connection.serverId,
    deviceId: connection.deviceId,
    action,
    requestedAt: new Date().toISOString(),
  });
  const signature = base64(
    new Uint8Array(
      await crypto.subtle.sign(
        { name: "ECDSA", hash: "SHA-256" },
        connection.privateKey,
        new TextEncoder().encode(message),
      ),
    ),
  );
  let data;
  try {
    data = await post(connection.endpoint, "/v1/" + action, {
      message,
      signature,
    });
  } catch (error) {
    if (error.name === "TimeoutError" || error.name === "AbortError")
      throw Object.assign(error, { code: "read_timeout" });
    if (error instanceof TypeError)
      throw Object.assign(error, { code: "read_network" });
    throw error;
  }
  const current = await readSetting("connection");
  if (
    !current ||
    current.deviceId !== connection.deviceId ||
    current.serverId !== connection.serverId ||
    current.endpoint !== connection.endpoint ||
    current.supervisor.id !== connection.supervisor.id ||
    current.supervisor.grade !== connection.supervisor.grade ||
    current.supervisor.role !== connection.supervisor.role
  )
    throw Object.assign(Error("تغير اتصال الجهاز"), { code: "unpaired" });
  return data;
}
const validReadPage = (data) =>
  Number.isSafeInteger(data?.total) &&
  data.total >= 0 &&
  (data.nextOffset === null || Number.isSafeInteger(data.nextOffset)) &&
  (data.nextCursor == null ||
    (typeof data.nextCursor === "string" &&
      /^[A-Za-z0-9_-]{32}:\d{1,9}$/.test(data.nextCursor)));
export async function readGeneralData(action, params = {}) {
  if (
    ![
      "overview",
      "overview-details",
      "received-reports",
      "received-report",
    ].includes(action)
  )
    throw Error("طلب غير صالح");
  const data = await signedRead(action, params);
  const reportValid =
    data?.id &&
    data.form &&
    Array.isArray(data.report?.sections) &&
    Array.isArray(data.report?.tables);
  const snapshotValid =
    typeof data?.snapshotId === "string" &&
    /^[A-Za-z0-9_-]{32}$/.test(data.snapshotId) &&
    Number.isFinite(Date.parse(data.fetchedAt));
  const valid =
    action === "received-report"
      ? reportValid
      : snapshotValid &&
        (action === "overview"
          ? data.version === 2 &&
            data.scope &&
            data.totals &&
            Array.isArray(data.grades) &&
            Array.isArray(data.supervisors) &&
            data.coverage
          : validReadPage(data) && Array.isArray(data.items));
  if (!valid)
    throw Object.assign(Error("يرجى تحديث جهاز الاستقبال"), {
      code: "overview_unavailable",
    });
  return data;
}
export async function readStudentData(action, params = {}) {
  if (!["students", "student-history", "student-report"].includes(action))
    throw Error("طلب سجل غير صالح");
  const data = await signedRead(action, params);
  const pageValid =
    Number.isSafeInteger(data?.total) &&
    data.total >= 0 &&
    (data.nextOffset === null || Number.isSafeInteger(data.nextOffset)) &&
    (data.nextCursor === undefined ||
      data.nextCursor === null ||
      (typeof data.nextCursor === "string" &&
        /^[A-Za-z0-9_-]{32}:\d{1,9}$/.test(data.nextCursor)));
  const valid =
    action === "students"
      ? pageValid && Array.isArray(data.students) && Array.isArray(data.classes)
      : action === "student-history"
        ? pageValid &&
          data.student?.id &&
          Array.isArray(data.records) &&
          Array.isArray(data.totals?.lateDates) &&
          [data.totals?.caseReports, data.totals?.lateDays].every(
            Number.isSafeInteger,
          ) &&
          Number.isFinite(Date.parse(data.fetchedAt))
        : data?.id &&
          data.report &&
          Array.isArray(data.report.sections) &&
          Array.isArray(data.report.tables);
  if (!valid)
    throw Object.assign(Error("سجل الطالب غير متاح بعد لدى الإشراف العام"), {
      code: "history_unavailable",
    });
  return data;
}
const sameConnection = (row, c) =>
  row.serverId === c.serverId && row.deviceId === c.deviceId;
function jobFor(row, c, revision = (row.receipt?.revision || 0) + 1) {
  return {
    fingerprint: row.fingerprint,
    message: JSON.stringify({
      protocol: 1,
      serverId: c.serverId,
      deviceId: c.deviceId,
      ...(row.backup
        ? { backup: row.backup }
        : row.withdrawalRequestedAt
          ? { action: "withdraw", revision, formId: row.form.id }
          : { revision, form: submissionForm(row.form) }),
    }),
  };
}
// Retain the original pending packet until acknowledged, then send a withdrawal
// at the next revision. A lost reply must never cause us to skip a revision.
export async function queueWithdrawal(formId) {
  const connection = await readSetting("connection");
  if (!connection || connection.supervisor.role === "general")
    throw Error("اتصال مشرف الصف مطلوب");
  const id = `${connection.serverId}:${connection.supervisor.id}:${formId}`;
  await transaction("records", "readwrite", async (s) => {
    const row = await request(s.get(id));
    if (!row?.form || !sameConnection(row, connection))
      throw Error("سجل إرسال هذا التقرير غير متاح على هذا الجهاز");
    if (row.withdrawalRequestedAt) return;
    row.withdrawalRequestedAt = new Date().toISOString();
    row.updatedAt = row.withdrawalRequestedAt;
    row.fingerprint = `withdraw:${row.withdrawalRequestedAt}`;
    if (!row.job) row.job = jobFor(row, connection);
    await request(s.put(row));
  });
}
// Only an explicit backup download creates a job. Draft changes never call this.
export async function queueBackup(contents, filename) {
  const connection = await readSetting("connection");
  if (!connection || connection.supervisor.role === "general") return null;
  if (new Blob([contents]).size > 15000000)
    throw Error("النسخة أكبر من حد الإرسال (١٥ ميغابايت)");
  validateStore(JSON.parse(contents));
  const backup = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    filename,
    contents,
  };
  const row = {
    id: connection.serverId + ":backup:" + backup.id,
    serverId: connection.serverId,
    deviceId: connection.deviceId,
    backup,
    fingerprint: backup.id,
    updatedAt: backup.createdAt,
  };
  row.job = jobFor(row, connection);
  await transaction("records", "readwrite", (s) => request(s.put(row)));
  return backup.id;
}
export async function reconcileSaved() {
  const connection = await readSetting("connection");
  if (!connection || connection.supervisor.role === "general") return;
  const raw = localStorage.getItem(storageKey);
  const store = raw ? JSON.parse(raw) : null;
  if (!Array.isArray(store?.saved)) return;
  for (const saved of store.saved) {
    const form = submissionForm(saved);
    if (form.syncSupervisorId !== connection.supervisor.id) continue;
    const fingerprint = JSON.stringify(form);
    const id =
      connection.serverId + ":" + connection.supervisor.id + ":" + form.id;
    await transaction("records", "readwrite", async (s) => {
      const previous = await request(s.get(id));
      if (previous && !sameConnection(previous, connection)) return;
      // Restored old backups and stale tabs cannot resubmit a withdrawn report.
      if (previous?.withdrawalRequestedAt || previous?.receipt?.withdrawn)
        return;
      if (previous?.fingerprint === fingerprint) {
        // Replay the exact acknowledged revision once to upgrade an older
        // receipt. This assigns a reference without submitting another case.
        if (
          form.kind === "case" &&
          previous.receipt &&
          !previous.receipt.reference &&
          !previous.job &&
          !previous.referenceChecked
        ) {
          previous.job = jobFor(
            previous,
            connection,
            previous.receipt.revision,
          );
          previous.referenceChecked = true;
          await request(s.put(previous));
        }
        return;
      }
      const row = {
        ...previous,
        id,
        serverId: connection.serverId,
        deviceId: connection.deviceId,
        form,
        fingerprint,
        updatedAt: new Date().toISOString(),
      };
      if (!row.job) row.job = jobFor(row, connection);
      // A confirmed validation rejection has not committed. A corrected save can reuse that revision.
      else if ([400, 403, 413].includes(row.errorStatus)) {
        row.job = jobFor(row, connection);
        row.error = "";
        row.errorStatus = null;
      }
      await request(s.put(row));
    });
  }
}
let sending;
export async function deliver() {
  if (sending) return sending;
  sending = deliverOnce().finally(() => {
    sending = null;
  });
  return sending;
}
async function deliverOnce() {
  const connection = await readSetting("connection");
  if (!connection || connection.supervisor.role === "general") return;
  await reconcileSaved();
  const rows = await transaction("records", "readonly", (s) =>
    request(s.getAll()),
  );
  for (const row of rows
    .filter((r) => sameConnection(r, connection) && r.job)
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))) {
    if (row.errorStatus && [400, 401, 403, 409, 413].includes(row.errorStatus))
      continue;
    const job = row.job;
    try {
      const signature = base64(
        new Uint8Array(
          await crypto.subtle.sign(
            { name: "ECDSA", hash: "SHA-256" },
            connection.privateKey,
            new TextEncoder().encode(job.message),
          ),
        ),
      );
      const receipt = await post(
        connection.endpoint,
        row.backup
          ? "/v1/backups"
          : JSON.parse(job.message).action === "withdraw"
            ? "/v1/withdrawals"
            : "/v1/records",
        {
          message: job.message,
          signature,
        },
      );
      const sent = JSON.parse(job.message);
      if (
        receipt.protocol !== 1 ||
        receipt.serverId !== connection.serverId ||
        receipt.deviceId !== connection.deviceId ||
        (sent.backup
          ? receipt.backupId !== sent.backup.id
          : receipt.formId !== (sent.formId || sent.form.id) ||
            receipt.revision !== sent.revision ||
            Boolean(receipt.withdrawn) !== (sent.action === "withdraw")) ||
        !receipt.receiptId ||
        !Number.isFinite(Date.parse(receipt.receivedAt)) ||
        (receipt.reference !== undefined &&
          !validCaseReference(receipt.reference)) ||
        (row.receipt?.reference && receipt.reference !== row.receipt.reference)
      )
        throw Error("استجابة استلام غير صالحة");
      await transaction("records", "readwrite", async (s) => {
        const current = await request(s.get(row.id));
        if (current?.job?.message !== job.message) return; // Another tab already acknowledged it.
        current.receipt = receipt;
        current.job =
          current.fingerprint === job.fingerprint
            ? null
            : jobFor(current, connection);
        current.error = "";
        current.errorStatus = null;
        // Keep the receipt after delivery, without a second full workspace copy on the phone.
        if (current.backup && !current.job) delete current.backup.contents;
        await request(s.put(current));
      });
    } catch (error) {
      await transaction("records", "readwrite", async (s) => {
        const current = await request(s.get(row.id));
        if (current?.job?.message === job.message)
          await request(
            s.put({
              ...current,
              error: error.status
                ? error.message
                : "بانتظار الاتصال بجهاز الاستقبال",
              errorStatus: error.status || null,
            }),
          );
      });
      if (!error.status || error.status >= 500 || error.status === 429) break;
    }
  }
}
export async function retryDelivery() {
  const connection = await readSetting("connection");
  if (!connection) return;
  await transaction("records", "readwrite", async (s) => {
    const rows = await request(s.getAll());
    for (const row of rows.filter(
      (r) => sameConnection(r, connection) && r.job,
    ))
      await request(s.put({ ...row, error: "", errorStatus: null }));
  });
  return deliver();
}
export async function deliveryState() {
  const connection = await readSetting("connection");
  if (!connection)
    return {
      connection: null,
      records: [],
      backups: [],
      pending: 0,
      blocked: 0,
    };
  const rows = (
    await transaction("records", "readonly", (s) => request(s.getAll()))
  ).filter((r) => sameConnection(r, connection));
  return {
    connection: publicConnection(connection),
    pending: rows.filter((r) => r.job).length,
    blocked: rows.filter(
      (r) =>
        r.job && r.errorStatus && r.errorStatus < 500 && r.errorStatus !== 429,
    ).length,
    backups: rows
      .filter((r) => r.backup)
      .map((r) => ({
        id: r.backup.id,
        createdAt: r.backup.createdAt,
        pending: Boolean(r.job),
        receipt: r.receipt,
        error: r.error || "",
      }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    records: rows
      .filter((r) => r.form)
      .map((r) => ({
        formId: r.form.id,
        kind: r.form.kind,
        date: r.form.date,
        label: [
          r.form.className || r.form.grade || "",
          r.form.student ||
            r.form.students
              ?.slice(0, 3)
              .map((s) => s.student)
              .filter(Boolean)
              .join("، ") ||
            "",
        ]
          .filter(Boolean)
          .join(" · "),
        withdrawalRequestedAt: r.withdrawalRequestedAt || null,
        withdrawn: Boolean(r.receipt?.withdrawn),
        savedAt: r.form.savedAt,
        pending: Boolean(r.job),
        receipt: r.receipt,
        error: r.error || "",
        blocked: Boolean(
          r.errorStatus && r.errorStatus < 500 && r.errorStatus !== 429,
        ),
      })),
  };
}

// General-supervisor snapshots live separately from drafts, submissions and keys.
const snapshotAccount = (c) => {
  if (c?.supervisor?.role !== "general")
    throw Object.assign(Error("General supervisor required"), {
      code: "snapshot_scope",
    });
  return `${c.serverId}:${c.supervisor.id}`;
};
const assertSnapshotConnection = (current, expected) => {
  if (
    !current ||
    snapshotAccount(current) !== snapshotAccount(expected) ||
    current.deviceId !== expected.deviceId ||
    current.endpoint !== expected.endpoint
  )
    throw Object.assign(Error("Connection changed"), { code: "unpaired" });
};
export const readSchoolSnapshotPage = (params = {}) =>
  signedRead("school-snapshot", params);
export async function readSavedSchoolSnapshot(expected) {
  return transaction("settings", "readonly", async (store) => {
    const current = await request(store.get("connection"));
    assertSnapshotConnection(current, expected);
    if (await request(store.get(`snapshot-blocked:${current.deviceId}`)))
      throw Object.assign(Error("Device revoked"), {
        code: "revoked",
        status: 401,
      });
    return request(store.get(`school-snapshot:${snapshotAccount(current)}`));
  });
}
export async function saveSchoolSnapshot(
  bundle,
  expected,
  fromReceiver = false,
) {
  return transaction("settings", "readwrite", async (store) => {
    const current = await request(store.get("connection"));
    assertSnapshotConnection(current, expected);
    if (
      `${bundle.payload.serverId}:${bundle.payload.supervisorId}` !==
      snapshotAccount(current)
    )
      throw Object.assign(Error("Snapshot owner differs"), {
        code: "snapshot_owner",
      });
    if (
      !fromReceiver &&
      (await request(store.get(`snapshot-blocked:${current.deviceId}`)))
    )
      throw Object.assign(Error("Device revoked"), {
        code: "revoked",
        status: 401,
      });
    const key = `school-snapshot:${snapshotAccount(current)}`;
    const previous = await request(store.get(key));
    if (
      fromReceiver &&
      previous?.payload.capturedAt > bundle.payload.capturedAt
    )
      throw Object.assign(Error("Older snapshot"), { code: "snapshot_older" });
    await request(store.put(bundle, key));
    if (fromReceiver)
      await request(store.delete(`snapshot-blocked:${current.deviceId}`));
  });
}
export async function blockSchoolSnapshot(expected) {
  return transaction("settings", "readwrite", async (store) => {
    const current = await request(store.get("connection"));
    assertSnapshotConnection(current, expected);
    await request(store.put(true, `snapshot-blocked:${current.deviceId}`));
    await request(store.delete(`school-snapshot:${snapshotAccount(current)}`));
  });
}
