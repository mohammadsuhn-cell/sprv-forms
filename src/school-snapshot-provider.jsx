import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";
import {
  readSavedSchoolSnapshot,
  readSchoolSnapshotPage,
  saveSchoolSnapshot,
  blockSchoolSnapshot,
} from "./delivery.js";
import {
  downloadSchoolSnapshot,
  validateSnapshotBundle,
} from "./school-snapshot.js";
import { createSnapshotSync, watchSnapshotSync } from "./snapshot-sync.js";
import {
  snapshotConnectionKey,
  subscribeSnapshotChanges,
} from "./snapshot-events.js";

const Context = createContext(null);
const empty = {
  bundle: null,
  ready: false,
  busy: false,
  progress: null,
  error: null,
  blocked: false,
  checkedAt: "",
  offline: false,
};
const emptyState = () => empty;
const noSubscription = () => () => {};
export const useSchoolSnapshot = () => useContext(Context);

export function SchoolSnapshotProvider({ connection, children }) {
  const identity = snapshotConnectionKey(connection);
  const sync = useMemo(
    () =>
      connection
        ? createSnapshotSync({
            load: () => readSavedSchoolSnapshot(connection),
            validate: (bundle) => validateSnapshotBundle(bundle, connection),
            download: (progress, active, version) =>
              downloadSchoolSnapshot(
                readSchoolSnapshotPage,
                connection,
                progress,
                active,
                version,
              ),
            save: (bundle, fromReceiver) =>
              saveSchoolSnapshot(bundle, connection, fromReceiver),
            block: () => blockSchoolSnapshot(connection),
            online: () => navigator.onLine,
            lock: (work) =>
              navigator.locks?.request
                ? navigator.locks.request(`sprv-history:${identity}`, work)
                : work(),
          })
        : null,
    [identity],
  );
  const state = useSyncExternalStore(
    sync?.subscribe || noSubscription,
    sync?.getState || emptyState,
  );
  useEffect(() => {
    if (!sync) return;
    const unwatch = watchSnapshotSync(sync, {
      window,
      document,
      subscribe: (listener) => subscribeSnapshotChanges(connection, listener),
      setInterval,
      clearInterval,
    });
    void sync.start();
    return () => {
      unwatch();
      sync.stop();
    };
  }, [sync]);
  return (
    <Context.Provider value={{ ...state, sync }}>{children}</Context.Provider>
  );
}
