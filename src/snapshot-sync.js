// One coordinator feeds every history view. Dependencies are injected so that
// races, offline recovery and account changes can be exercised without a browser.
export const snapshotCheckInterval = 30_000;
export function createSnapshotSync({
  load,
  validate,
  download,
  save,
  block,
  lock,
  online,
}) {
  let state = {
    bundle: null,
    ready: false,
    busy: false,
    progress: null,
    error: null,
    blocked: false,
    checkedAt: "",
    offline: !online(),
  };
  const listeners = new Set();
  let generation = 0,
    running = false,
    pending = null,
    again = false;
  const patch = (next) => {
    state = { ...state, ...next };
    for (const listener of listeners) listener();
  };
  const current = (version) => running && generation === version;
  async function failure(error, version) {
    if (!current(version) || error.name === "AbortError") return;
    const denied =
      ["revoked", "scope", "unpaired"].includes(error.code) ||
      error.status === 403;
    if (denied) {
      patch({ bundle: null, checkedAt: "", blocked: true });
      if (error.code !== "unpaired") await block().catch(() => {});
    }
    if (current(version)) patch({ error });
  }
  async function loadCopy(version) {
    const saved = await load();
    if (saved?.digest !== state.bundle?.digest) {
      if (saved) await validate(saved);
      if (current(version)) patch({ bundle: saved || null, checkedAt: "" });
    }
  }
  function operation(work) {
    const version = generation;
    patch({ busy: true, error: null, progress: null, offline: !online() });
    const job = Promise.resolve()
      .then(() =>
        lock(async () => {
          if (current(version)) await work(version);
        }),
      )
      .catch((error) => failure(error, version))
      .finally(() => {
        if (!current(version)) return;
        pending = null;
        patch({ busy: false, progress: null });
        if (again) {
          again = false;
          void refresh();
        }
      });
    pending = job;
    return job;
  }
  function refresh({ follow = false } = {}) {
    if (!running || !state.ready) return Promise.resolve();
    if (pending) {
      if (follow) again = true;
      return pending;
    }
    return operation(async (version) => {
      // Another tab may have finished a download while this tab waited for the
      // device lock. Start from that committed copy, not an older in-memory one.
      try {
        await loadCopy(version);
      } catch (error) {
        // A damaged stored file must not prevent a fresh, validated download.
        if (error.code !== "snapshot_invalid" || !online()) throw error;
      }
      if (!current(version) || !online()) return;
      const next = await download(
        (progress) => {
          if (current(version)) patch({ progress });
        },
        () => current(version),
        state.bundle?.payload.contentVersion,
      );
      if (!current(version)) return;
      if (next.notModified) {
        patch({ checkedAt: next.checkedAt, blocked: false });
        return;
      }
      await save(next, true);
      if (current(version))
        patch({
          bundle: next,
          checkedAt: next.payload.capturedAt,
          blocked: false,
        });
    });
  }
  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async start() {
      running = true;
      const version = ++generation;
      try {
        await loadCopy(version);
      } catch (error) {
        await failure(error, version);
      }
      if (!current(version)) return;
      patch({ ready: true });
      return refresh();
    },
    stop() {
      running = false;
      generation++;
      pending = null;
      again = false;
    },
    network() {
      patch({ offline: !online() });
    },
    refresh,
    restore(bundle) {
      if (!running || !state.ready || pending) return Promise.resolve();
      return operation(async (version) => {
        await validate(bundle);
        if (!current(version)) return;
        await save(bundle, false);
        if (current(version)) {
          patch({ bundle, checkedAt: "", blocked: false });
          again = online();
        }
      });
    },
  };
}

// Visibility is checked at the moment of each trigger. Closed/background pages
// do not poll; returning to the app checks immediately.
export function watchSnapshotSync(
  sync,
  { window, document, subscribe, setInterval, clearInterval },
) {
  const check = () => {
    sync.network();
    if (document.visibilityState === "visible" && !sync.getState().offline)
      void sync.refresh();
  };
  const changed = (type) => {
    if (type === "saved" && sync.getState().busy) return;
    if (document.visibilityState === "visible")
      void sync.refresh({ follow: type === "received" });
  };
  window.addEventListener("online", check);
  window.addEventListener("offline", check);
  window.addEventListener("focus", check);
  document.addEventListener("visibilitychange", check);
  const timer = setInterval(check, snapshotCheckInterval);
  const unsubscribe = subscribe(changed);
  return () => {
    clearInterval(timer);
    unsubscribe();
    window.removeEventListener("online", check);
    window.removeEventListener("offline", check);
    window.removeEventListener("focus", check);
    document.removeEventListener("visibilitychange", check);
  };
}
