import { useEffect, useRef, useState } from "react";
import { storageKey } from "./model.js";

// One document owns the browser workspace. A read/check/write of localStorage
// alone cannot prevent two tabs from replacing one another's saved work.
export function useWorkspaceLock(onAcquire) {
  const callback = useRef(onAcquire);
  callback.current = onAcquire;
  const owner = useRef(false);
  const retry = useRef(() => {});
  const [status, setStatus] = useState("opening");
  useEffect(() => {
    let mounted = true;
    let suspended = false;
    let pending = false;
    let retryWhenReleased = false;
    let release;
    async function acquire() {
      if (!mounted || suspended || owner.current) return;
      if (pending) {
        retryWhenReleased = true;
        return;
      }
      if (!navigator.locks?.request) {
        setStatus("unsupported");
        return;
      }
      pending = true;
      setStatus("opening");
      try {
        await navigator.locks.request(
          storageKey + ":writer",
          { ifAvailable: true },
          async (lock) => {
            if (!mounted || suspended) return;
            if (!lock) {
              setStatus("busy");
              return;
            }
            const held = new Promise((resolve) => {
              release = resolve;
            });
            // Reload after acquisition: this tab may have waited while another
            // tab changed records, drafts, settings, or received references.
            callback.current();
            owner.current = true;
            setStatus("ready");
            await held;
          },
        );
      } catch {
        if (mounted) setStatus("unavailable");
      } finally {
        pending = false;
        if (retryWhenReleased) {
          retryWhenReleased = false;
          void acquire();
        }
      }
    }
    function suspend() {
      suspended = true;
      owner.current = false;
      release?.();
      release = null;
      if (mounted) setStatus("opening");
    }
    function resume() {
      suspended = false;
      void acquire();
    }
    function visible() {
      if (document.visibilityState === "visible") void acquire();
    }
    retry.current = acquire;
    window.addEventListener("pagehide", suspend);
    window.addEventListener("pageshow", resume);
    document.addEventListener("visibilitychange", visible);
    void acquire();
    return () => {
      mounted = false;
      suspend();
      retry.current = () => {};
      window.removeEventListener("pagehide", suspend);
      window.removeEventListener("pageshow", resume);
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);
  return { status, owner, retry: () => retry.current() };
}
