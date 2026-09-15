"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
export function useData(path) {
  const [version, setVersion] = useState(0);
  const [state, setState] = useState({
    path: null,
    key: null,
    data: null,
    error: "",
  });
  const key = `${path}:${version}`;
  useEffect(() => {
    if (!path) return undefined;
    const controller = new AbortController();
    api(path, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setState({ path, key, data, error: "" });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setState((previous) => ({
            path,
            key,
            // A failed background refresh must not blank an already usable view.
            data: previous.path === path ? previous.data : null,
            error: error.message,
          }));
      });
    return () => controller.abort();
  }, [path, key]);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  return {
    data: state.path === path ? state.data : null,
    error: state.path === path ? state.error : "",
    // Keep rendered tables and cards mounted while an explicit mutation refreshes.
    // A new path still uses the normal initial loading state.
    loading: Boolean(path) && state.path !== path,
    refreshing: Boolean(path) && state.path === path && state.key !== key,
    refresh,
  };
}
export function useDebounce(value, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
