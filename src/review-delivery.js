import { deliveryState, signedRead } from "./delivery.js";

let database;
export const reviewScope = (c) => (c ? `${c.serverId}:${c.supervisor.id}` : "");
const empty = () => ({
  threads: {},
  details: {},
  pending: [],
  drafts: {},
  after: 0,
  generation: "",
  fetchedAt: "",
  error: "",
});
const request = (r) =>
  new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
async function db() {
  if (!database)
    database = new Promise((resolve, reject) => {
      const r = indexedDB.open("sprv-reviews-v1", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("accounts");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  return database;
}
async function update(connection, fn) {
  const d = await db(),
    tx = d.transaction("accounts", "readwrite");
  const done = new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onabort = () => reject(tx.error || Error("Review storage unavailable"));
    tx.onerror = () => {};
  });
  try {
    const s = tx.objectStore("accounts"),
      key = reviewScope(connection);
    const value = (await request(s.get(key))) || empty();
    const next = fn(value);
    await request(s.put(next, key));
    await done;
    window.dispatchEvent(
      new CustomEvent("sprv-reviews-changed", { detail: key }),
    );
    return next;
  } catch (e) {
    try {
      tx.abort();
    } catch {}
    await done.catch(() => {});
    throw e;
  }
}
export async function reviewCache(connection) {
  if (!connection) return empty();
  const d = await db();
  const saved =
    (await request(
      d
        .transaction("accounts")
        .objectStore("accounts")
        .get(reviewScope(connection)),
    )) || empty();
  return saved.blockedDevices?.[connection.deviceId]
    ? {
        ...empty(),
        revoked: true,
        error: "أُلغي وصول هذا الجهاز. راجع الإشراف لتفعيل الاتصال.",
      }
    : saved;
}
async function assertConnection(expected) {
  const { connection } = await deliveryState();
  if (
    !connection ||
    reviewScope(connection) !== reviewScope(expected) ||
    connection.deviceId !== expected.deviceId ||
    connection.endpoint !== expected.endpoint
  )
    throw Object.assign(Error("تغير اتصال الجهاز"), { code: "unpaired" });
  if ((await reviewCache(expected)).revoked)
    throw Object.assign(Error("أُلغي وصول هذا الجهاز"), {
      code: "revoked",
      status: 401,
    });
}
async function readReviews(connection, action, params) {
  try {
    return await signedRead(action, params);
  } catch (e) {
    if (e.code === "revoked")
      await update(connection, (s) => ({
        ...s,
        blockedDevices: { ...s.blockedDevices, [connection.deviceId]: true },
      }));
    throw e;
  }
}
export async function saveReviewDraft(connection, key, value) {
  return update(connection, (s) => ({
    ...s,
    drafts: { ...s.drafts, [key]: value },
  }));
}
export async function queueReview(connection, operation, draftKey) {
  await assertConnection(connection);
  const op = {
    ...operation,
    id: crypto.randomUUID(),
    authoredAt: new Date().toISOString(),
  };
  await update(connection, (s) => ({
    ...s,
    pending: [...s.pending, { operation: op }],
    drafts: draftKey ? { ...s.drafts, [draftKey]: "" } : s.drafts,
  }));
  return op;
}
export async function removePendingReview(connection, id) {
  await update(connection, (s) => ({
    ...s,
    pending: s.pending.filter((p) => p.operation.id !== id),
  }));
}
export async function retryPendingReview(connection, id) {
  await update(connection, (s) => ({
    ...s,
    pending: s.pending.map((p) =>
      p.operation.id === id ? { operation: p.operation } : p,
    ),
  }));
}
export async function pendingReviewBackup(connection) {
  const cache = await reviewCache(connection);
  return {
    format: "sprv-review-drafts",
    version: 1,
    serverId: connection.serverId,
    supervisorId: connection.supervisor.id,
    drafts: cache.drafts,
    pending: cache.pending.map((p) => ({ operation: p.operation })),
  };
}
export async function restorePendingReviews(connection, backup) {
  await assertConnection(connection);
  if (
    backup?.format !== "sprv-review-drafts" ||
    backup.version !== 1 ||
    backup.serverId !== connection.serverId ||
    backup.supervisorId !== connection.supervisor.id ||
    !backup.drafts ||
    typeof backup.drafts !== "object" ||
    !Array.isArray(backup.pending) ||
    backup.pending.length > 1000 ||
    Object.keys(backup.drafts).length > 2000
  )
    throw Error("النسخة لا تخص هذا الحساب أو غير صالحة");
  for (const [key, value] of Object.entries(backup.drafts))
    if (
      !/^(new|reply):[A-Za-z0-9_:-]{1,300}$/.test(key) ||
      typeof value !== "string" ||
      value.length > 4000
    )
      throw Error("مسودة غير صالحة");
  for (const { operation: op } of backup.pending)
    if (
      !op ||
      !/^[A-Za-z0-9_-]{1,100}$/.test(op.id) ||
      !/^[A-Za-z0-9_-]{1,100}$/.test(op.threadId) ||
      ![
        "note",
        "request",
        "reply",
        "amend",
        "close",
        "reopen",
        "cancel",
        "open",
        "acknowledge",
      ].includes(op.type) ||
      !Number.isFinite(Date.parse(op.authoredAt)) ||
      (op.text !== undefined &&
        (typeof op.text !== "string" || op.text.length > 4000))
    )
      throw Error("رسالة غير صالحة");
  await update(connection, (s) => ({
    ...s,
    drafts: {
      ...backup.drafts,
      ...Object.fromEntries(
        Object.entries(s.drafts).filter(([, value]) => value),
      ),
    },
    pending: [
      ...s.pending,
      ...backup.pending.filter(
        (p) => !s.pending.some((v) => v.operation.id === p.operation.id),
      ),
    ],
  }));
}
export async function reviewDetail(connection, threadId) {
  await assertConnection(connection);
  const data = await readReviews(connection, "review-thread", { threadId });
  if (data.thread?.id !== threadId || !Array.isArray(data.events))
    throw Error("Invalid review response");
  await assertConnection(connection);
  await update(connection, (s) => ({
    ...s,
    details: { ...s.details, [threadId]: data },
    threads: { ...s.threads, [threadId]: data.thread },
  }));
  return data;
}
export async function loadStudentReviews(
  connection,
  studentId,
  active = () => true,
) {
  try {
    await assertConnection(connection);
    let cursor, fetchedAt, total;
    const threads = [];
    for (;;) {
      const page = await readReviews(connection, "student-reviews", {
        studentId,
        ...(cursor ? { cursor } : {}),
      });
      if (!active()) throw new DOMException("Cancelled", "AbortError");
      if (
        !Array.isArray(page.threads) ||
        (fetchedAt && (page.fetchedAt !== fetchedAt || page.total !== total))
      )
        throw Error("Invalid review pagination");
      fetchedAt = page.fetchedAt;
      total = page.total;
      threads.push(...page.threads);
      if (page.nextOffset === null) {
        if (
          threads.length !== total ||
          new Set(threads.map((v) => v.thread.id)).size !== total
        )
          throw Error("Incomplete review history");
        const result = { threads, fetchedAt, offline: false };
        await update(connection, (s) => ({
          ...s,
          studentFiles: { ...s.studentFiles, [studentId]: result },
        }));
        return result;
      }
      if (!page.nextCursor || page.nextCursor === cursor)
        throw Error("Invalid review pagination");
      cursor = page.nextCursor;
    }
  } catch (e) {
    if (
      e.name === "AbortError" ||
      e.code === "unpaired" ||
      [401, 403].includes(e.status)
    )
      throw e;
    const saved = await reviewCache(connection);
    if (saved.studentFiles?.[studentId])
      return { ...saved.studentFiles[studentId], offline: true };
    const rows = Object.values(saved.threads).filter((t) =>
      t.studentIds?.includes(studentId),
    );
    if (
      !saved.fetchedAt ||
      rows.some(
        (t) =>
          !saved.details[t.id] ||
          saved.details[t.id].thread.updatedSeq < t.updatedSeq,
      )
    )
      throw Error(
        "تعذّر تحميل المتابعات كاملة. افتح المتابعات وحدّثها قبل تصدير ملف الطالب.",
      );
    return {
      threads: rows.map((t) => saved.details[t.id]),
      fetchedAt: saved.fetchedAt,
      offline: true,
    };
  }
}
export async function syncReviews(connection) {
  if (!connection?.capabilities?.reviews) return;
  const run = async () => {
    try {
      await assertConnection(connection);
      for (const pending of (await reviewCache(connection)).pending) {
        if (pending.blocked) continue;
        await assertConnection(connection);
        try {
          const receipt = await readReviews(connection, "review-events", {
            operation: pending.operation,
          });
          if (
            receipt.operationId !== pending.operation.id ||
            receipt.serverId !== connection.serverId
          )
            throw Error("Invalid review receipt");
          await update(connection, (s) => ({
            ...s,
            pending: s.pending.filter(
              (p) => p.operation.id !== receipt.operationId,
            ),
          }));
        } catch (e) {
          if (e.status >= 400 && e.status < 500 && e.status !== 429) {
            await update(connection, (s) => ({
              ...s,
              pending: s.pending.map((p) =>
                p.operation.id === pending.operation.id
                  ? { ...p, blocked: true, error: e.message, code: e.code }
                  : p,
              ),
            }));
          } else throw e;
        }
      }
      let saved = await reviewCache(connection),
        after = saved.after,
        until,
        generation = saved.generation,
        reset = false;
      for (;;) {
        await assertConnection(connection);
        let page;
        try {
          page = await readReviews(connection, "review-feed", {
            after,
            ...(until !== undefined ? { until } : {}),
            ...(generation ? { generation } : {}),
          });
        } catch (e) {
          if (e.code === "review_reset" && !reset) {
            after = 0;
            until = undefined;
            generation = "";
            reset = true;
            continue;
          }
          throw e;
        }
        if (
          page.accountId !== connection.supervisor.id ||
          page.serverId !== connection.serverId ||
          !Array.isArray(page.threads) ||
          !Number.isSafeInteger(page.after) ||
          page.after < after ||
          (page.more && page.after === after)
        )
          throw Error("Invalid review feed");
        await update(connection, (s) => {
          const threads = reset && !generation ? {} : { ...s.threads };
          for (const thread of page.threads) threads[thread.id] = thread;
          return {
            ...s,
            threads,
            after: page.after,
            generation: page.generation,
            fetchedAt: page.fetchedAt,
            error: "",
          };
        });
        after = page.after;
        until = page.until;
        generation = page.generation;
        if (!page.more) break;
      }
    } catch (e) {
      await update(connection, (s) => ({
        ...s,
        error: e.message || "تعذّر الاتصال بجهاز الاستقبال",
      }));
    }
  };
  if (navigator.locks?.request)
    return navigator.locks.request(
      "sprv-review-sync:" + reviewScope(connection),
      { ifAvailable: true },
      (lock) => lock && run(),
    );
  return run();
}
