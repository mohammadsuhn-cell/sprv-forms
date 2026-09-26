// Device credentials and pending submissions are deliberately separate from portable JSON backups.
// The private signing key is non-exportable and never placed in localStorage or an activation URL.
import { storageKey } from "./model.js";
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
const sameConnection = (row, c) =>
  row.serverId === c.serverId && row.deviceId === c.deviceId;
function jobFor(row, c) {
  return {
    fingerprint: row.fingerprint,
    message: JSON.stringify({
      protocol: 1,
      serverId: c.serverId,
      deviceId: c.deviceId,
      revision: (row.receipt?.revision || 0) + 1,
      form: row.form,
    }),
  };
}
export async function reconcileSaved() {
  const connection = await readSetting("connection");
  if (!connection) return;
  const raw = localStorage.getItem(storageKey);
  const store = raw ? JSON.parse(raw) : null;
  if (!Array.isArray(store?.saved)) return;
  for (const form of store.saved) {
    if (form.syncSupervisorId !== connection.supervisor.id) continue;
    const fingerprint = JSON.stringify(form);
    const id =
      connection.serverId + ":" + connection.supervisor.id + ":" + form.id;
    await transaction("records", "readwrite", async (s) => {
      const previous = await request(s.get(id));
      if (previous && !sameConnection(previous, connection)) return;
      if (previous?.fingerprint === fingerprint) return;
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
  if (!connection) return;
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
      const receipt = await post(connection.endpoint, "/v1/records", {
        message: job.message,
        signature,
      });
      const sent = JSON.parse(job.message);
      if (
        receipt.protocol !== 1 ||
        receipt.serverId !== connection.serverId ||
        receipt.deviceId !== connection.deviceId ||
        receipt.formId !== sent.form.id ||
        receipt.revision !== sent.revision ||
        !receipt.receiptId ||
        !Number.isFinite(Date.parse(receipt.receivedAt))
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
    return { connection: null, records: [], pending: 0, blocked: 0 };
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
    records: rows.map((r) => ({
      formId: r.form.id,
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
