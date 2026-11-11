import { useCallback, useEffect, useRef, useState } from "react";
import { Aborted, call, subscribeLog } from "./api.js";
import { createLatest } from "./latest.js";

// GET a resource; reload() re-reads it. Errors keep Vault's text.
//
// Prompt 09: only the newest answer is applied (createLatest), an obsolete
// read is aborted, polls are scheduled after the previous one finished (they
// never pile up), and a hidden tab stops polling and refreshes when it is
// shown again.
export function useResource(
  label,
  path,
  { quiet = true, intervalMs = 0 } = {},
) {
  const [state, setState] = useState({
    data: null,
    error: null,
    loading: true,
  });
  const latest = useRef(null);
  if (!latest.current) latest.current = createLatest();
  const load = useCallback(async () => {
    const { id, signal } = latest.current.begin();
    try {
      const data = await call(label, path, { quiet, signal });
      if (latest.current.isCurrent(id))
        setState({ data, error: null, loading: false });
      return data;
    } catch (error) {
      if (error instanceof Aborted || !latest.current.isCurrent(id))
        return null;
      setState((s) => ({ data: s.data, error, loading: false }));
      return null;
    }
  }, [label, path, quiet]);
  useEffect(() => {
    let timer = null;
    let stopped = false;
    const schedule = () => {
      if (!intervalMs || stopped) return;
      clearTimeout(timer);
      timer = setTimeout(async () => {
        if (document.hidden) return; // resumed by visibilitychange
        await load();
        schedule();
      }, intervalMs);
    };
    const onVisible = () => {
      if (!document.hidden && intervalMs) {
        load().then(schedule);
      }
    };
    load().then(schedule);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      latest.current.abort();
    };
  }, [load, intervalMs]);
  return { ...state, reload: load };
}

export function useVaultLog() {
  const [entries, setEntries] = useState([]);
  useEffect(() => subscribeLog(setEntries), []);
  return entries;
}

// Hash routing: #/pki, #/agility …
export function useRoute(routes, fallback) {
  const read = () => {
    const r = window.location.hash.replace(/^#\/?/, "").split("?")[0];
    return routes.includes(r) ? r : fallback;
  };
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const on = () => setRoute(read());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  });
  return route;
}

// One chapter: Vault's view of it (GET /api/chapters/:id, polled every 3s
// while a request is held), and run(step, body, label) for its steps. Each
// step's last answer is kept by name for the page.
export function useChapter(id, signedIn) {
  const view = useResource(`chapter ${id}`, `/api/chapters/${id}`, { intervalMs: 0 });
  const [results, setResults] = useState({});
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const held = Boolean(view.data?.held);
  const { reload } = view;
  useEffect(() => {
    if (!held || !signedIn) return undefined;
    const t = setInterval(() => reload(), 3000);
    return () => clearInterval(t);
  }, [held, signedIn, reload]);
  const run = useCallback(
    async (step, body, label, key = step) => {
      setBusy(key);
      setError(null);
      try {
        const r = await call(label || `${id}: ${step}`, `/api/chapters/${id}/${step}`, { method: "POST", body: body || {} });
        setResults((x) => ({ ...x, [key]: r }));
        await reload();
        return r;
      } catch (e) {
        setError(e);
        return null;
      } finally {
        setBusy(null);
      }
    },
    [id, reload],
  );
  return { view, results, run, busy, error };
}
