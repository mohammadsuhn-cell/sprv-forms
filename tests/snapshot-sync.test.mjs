import test from "node:test";
import assert from "node:assert/strict";
import {
  createSnapshotSync,
  watchSnapshotSync,
  snapshotCheckInterval,
} from "../src/snapshot-sync.js";
import { readHistoryWindow } from "../src/history-window.js";
import {
  notifySnapshotChange,
  subscribeSnapshotChanges,
} from "../src/snapshot-events.js";

test("cross-tab restrictions cannot fail committed updates, and signals remain account scoped", () => {
  const previous = Object.fromEntries(
    ["window", "BroadcastChannel"].map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ]),
  );
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: new EventTarget(),
  });
  Object.defineProperty(globalThis, "BroadcastChannel", {
    configurable: true,
    value: class {
      constructor() {
        throw Error("Unavailable");
      }
    },
  });
  const connection = {
    serverId: "test",
    deviceId: "test-device",
    endpoint: "http://127.0.0.1",
    supervisor: { id: "test-supervisor", grade: "7" },
  };
  let unsubscribe;
  try {
    const events = [];
    unsubscribe = subscribeSnapshotChanges(connection, (type) =>
      events.push(type),
    );
    assert.doesNotThrow(() => notifySnapshotChange("saved", connection));
    notifySnapshotChange("received", {
      ...connection,
      deviceId: "another-device",
    });
    assert.deepEqual(events, ["saved"]);
  } finally {
    unsubscribe?.();
    for (const [key, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const bundle = (version) => ({
  digest: `digest-${version}`,
  payload: {
    contentVersion: String(version).repeat(64),
    capturedAt: `2026-11-28T10:0${version}:00Z`,
    records: [version],
  },
});
function fixture() {
  let saved = bundle(1),
    connected = true,
    result = bundle(2),
    reads = 0,
    writes = 0,
    blocks = 0;
  const versions = [];
  const sync = createSnapshotSync({
    load: async () => saved,
    validate: async (value) => {
      if (!value.digest) throw Error("Invalid copy");
    },
    download: async (progress, active, version) => {
      reads++;
      versions.push(version);
      progress({ received: 1, total: 2 });
      return typeof result === "function" ? result(active) : result;
    },
    save: async (next) => {
      saved = next;
      writes++;
    },
    block: async () => {
      saved = null;
      blocks++;
    },
    lock: (work) => work(),
    online: () => connected,
  });
  return {
    sync,
    versions,
    get saved() {
      return saved;
    },
    get reads() {
      return reads;
    },
    get writes() {
      return writes;
    },
    get blocks() {
      return blocks;
    },
    setResult: (next) => {
      result = next;
    },
    setSaved: (next) => {
      saved = next;
    },
    setOnline: (next) => {
      connected = next;
    },
  };
}
test("all views observe one committed update; unchanged checks preserve the reader's bundle", async () => {
  const f = fixture(),
    first = [],
    second = [];
  f.sync.subscribe(() => first.push(f.sync.getState()));
  f.sync.subscribe(() => second.push(f.sync.getState()));
  await f.sync.start();
  assert.equal(f.sync.getState().bundle, f.saved);
  assert.deepEqual(first, second);
  const current = f.saved;
  f.setResult({
    notModified: true,
    contentVersion: current.payload.contentVersion,
    checkedAt: "2026-11-28T10:05:00Z",
  });
  await f.sync.refresh();
  assert.equal(f.writes, 1);
  assert.equal(f.sync.getState().bundle, current);
  assert.equal(f.sync.getState().checkedAt, "2026-11-28T10:05:00Z");
  assert.deepEqual(f.versions, [
    bundle(1).payload.contentVersion,
    bundle(2).payload.contentVersion,
  ]);
});
test("offline and failed downloads retain the last complete copy without advancing freshness", async () => {
  const f = fixture();
  f.setOnline(false);
  await f.sync.start();
  assert.equal(f.reads, 0);
  assert.equal(f.sync.getState().bundle, f.saved);
  assert.equal(f.sync.getState().checkedAt, "");
  f.setOnline(true);
  await f.sync.refresh();
  const previous = f.sync.getState();
  f.setResult(() => {
    throw Object.assign(Error("Disconnected mid-download"), {
      code: "read_network",
    });
  });
  await f.sync.refresh();
  assert.equal(f.sync.getState().bundle, previous.bundle);
  assert.equal(f.sync.getState().checkedAt, previous.checkedAt);
  assert.equal(f.sync.getState().error.code, "read_network");
  f.setResult(bundle(3));
  await f.sync.refresh();
  assert.equal(f.sync.getState().bundle.payload.records[0], 3);
  assert.equal(f.sync.getState().error, null);
});
test("a receipt during a download schedules one follow-up; ordinary concurrent checks coalesce", async () => {
  const f = fixture(),
    wait = deferred();
  f.setResult(() => wait.promise);
  const starting = f.sync.start();
  await new Promise((resolve) => setImmediate(resolve));
  const concurrent = f.sync.refresh();
  void f.sync.refresh({ follow: true });
  void f.sync.refresh({ follow: true });
  assert.equal(f.reads, 1);
  f.setResult(bundle(3));
  wait.resolve(bundle(2));
  await starting;
  await concurrent;
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(f.reads, 2);
  assert.equal(f.sync.getState().bundle.payload.records[0], 3);
});
test("stopping an account ignores its late response and does not save it", async () => {
  const f = fixture(),
    wait = deferred();
  f.setResult(() => wait.promise);
  const starting = f.sync.start();
  await new Promise((resolve) => setImmediate(resolve));
  f.sync.stop();
  wait.resolve(bundle(2));
  await starting;
  assert.equal(f.writes, 0);
  assert.equal(f.saved.payload.records[0], 1);
});
test("another tab's committed copy is read before checking, and restored copies synchronize again", async () => {
  const f = fixture();
  await f.sync.start();
  f.setSaved(bundle(3));
  f.setResult({
    notModified: true,
    contentVersion: bundle(3).payload.contentVersion,
    checkedAt: "2026-11-28T10:05:00Z",
  });
  await f.sync.refresh();
  assert.equal(f.versions.at(-1), bundle(3).payload.contentVersion);
  assert.equal(f.sync.getState().bundle, f.saved);
  f.setOnline(false);
  await f.sync.restore(bundle(1));
  assert.equal(f.sync.getState().checkedAt, "");
  f.setOnline(true);
  f.setResult(bundle(3));
  await f.sync.refresh();
  assert.equal(f.saved.payload.records[0], 3);
});
test("revoked access clears the saved view instead of presenting it as usable offline", async () => {
  const f = fixture();
  await f.sync.start();
  f.setResult(() => {
    throw Object.assign(Error("Revoked"), { code: "revoked", status: 401 });
  });
  await f.sync.refresh();
  assert.equal(f.blocks, 1);
  assert.equal(f.sync.getState().bundle, null);
  assert.equal(f.sync.getState().blocked, true);
  assert.equal(f.sync.getState().checkedAt, "");
});
test("opening, reconnecting, returning, receipts and visible polling refresh; cleanup stops watchers", () => {
  const window = new EventTarget(),
    document = new EventTarget();
  document.visibilityState = "visible";
  const calls = [];
  let tick,
    changed,
    cleaned = false;
  const sync = {
    network() {},
    refresh: (options) => {
      calls.push(options);
    },
    getState: () => ({ busy: false }),
  };
  const stop = watchSnapshotSync(sync, {
    window,
    document,
    subscribe: (listener) => {
      changed = listener;
      return () => {
        cleaned = true;
      };
    },
    setInterval: (callback, ms) => {
      assert.equal(ms, snapshotCheckInterval);
      tick = callback;
      return 1;
    },
    clearInterval: (id) => assert.equal(id, 1),
  });
  window.dispatchEvent(new Event("online"));
  window.dispatchEvent(new Event("focus"));
  tick();
  changed("received");
  assert.equal(calls.length, 4);
  assert.deepEqual(calls.at(-1), { follow: true });
  document.visibilityState = "hidden";
  tick();
  window.dispatchEvent(new Event("online"));
  assert.equal(calls.length, 4);
  document.visibilityState = "visible";
  document.dispatchEvent(new Event("visibilitychange"));
  assert.equal(calls.length, 5);
  stop();
  window.dispatchEvent(new Event("online"));
  assert.equal(calls.length, 5);
  assert(cleaned);
});
test("refresh replaces all previously loaded rows from one new pagination chain", async () => {
  const ids = Array.from({ length: 65 }, (_, i) => ({ id: `new-${i}` }));
  const calls = [];
  const read = async (action, params) => {
    calls.push(params);
    const offset = params.cursor ? Number(params.cursor) : 0;
    return {
      records: ids.slice(offset, offset + 30),
      total: ids.length,
      nextOffset: offset + 30 < ids.length ? offset + 30 : null,
      nextCursor: offset + 30 < ids.length ? String(offset + 30) : null,
    };
  };
  const result = await readHistoryWindow(
    read,
    "student-history",
    { studentId: "synthetic" },
    "records",
    60,
  );
  assert.equal(result.records.length, 60);
  assert.equal(result.records[0].id, "new-0");
  assert.equal(result.nextCursor, "60");
  assert.equal(calls.length, 2);
  await assert.rejects(
    readHistoryWindow(read, "student-history", {}, "records", 60, () => false),
    { name: "AbortError" },
  );
});
