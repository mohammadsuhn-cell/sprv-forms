import { useEffect, useRef, useState } from "react";

// Keep report/student data in memory; browser history contains only opaque keys.
export function useWorkspaceNavigation(initial, active = true) {
  const session = useRef(crypto.randomUUID());
  const entries = useRef(
    new Map([[0, { value: initial, scroll: 0, parent: null }]]),
  );
  const sequence = useRef(0);
  const current = useRef(0);
  const activeRef = useRef(active);
  activeRef.current = active;
  const [state, setState] = useState({ value: initial, key: 0 });
  const marker = (key) => ({
    ...history.state,
    sprvGeneral: { session: session.current, key },
  });
  const restoreScroll = (y) =>
    requestAnimationFrame(() =>
      requestAnimationFrame(() => window.scrollTo(0, y)),
    );
  useEffect(() => {
    history.replaceState(marker(0), "");
    const previousRestoration = history.scrollRestoration;
    history.scrollRestoration = "manual";
    const pop = (event) => {
      if (!activeRef.current) return;
      const target = event.state?.sprvGeneral;
      const entry =
        target?.session === session.current && entries.current.get(target.key);
      if (!entry) return;
      entries.current.get(current.current).scroll = window.scrollY;
      current.current = target.key;
      setState({ value: entry.value, key: target.key });
      restoreScroll(entry.scroll);
    };
    window.addEventListener("popstate", pop);
    return () => {
      window.removeEventListener("popstate", pop);
      history.scrollRestoration = previousRestoration;
    };
  }, []);
  function navigate(patch, { replace = false } = {}) {
    const previous = entries.current.get(current.current);
    const value = {
      ...previous.value,
      ...(typeof patch === "function" ? patch(previous.value) : patch),
    };
    previous.scroll = window.scrollY;
    const key = replace ? current.current : ++sequence.current;
    entries.current.set(key, {
      value,
      scroll: replace ? previous.scroll : 0,
      parent: replace ? previous.parent : current.current,
    });
    current.current = key;
    history[replace ? "replaceState" : "pushState"](marker(key), "");
    setState({ value, key });
    if (!replace) window.scrollTo(0, 0);
  }
  function back() {
    if (entries.current.get(current.current).parent !== null) history.back();
    else navigate(initial, { replace: true });
  }
  return [state.value, navigate, back];
}
