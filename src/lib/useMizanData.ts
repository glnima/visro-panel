"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import type { Bootstrap } from "./types";

const POLL_MS = 3000;

// Loads everything the current user may see, then polls a cheap version
// number and reloads only when someone has changed something.
export function useMizanData() {
  const [data, setData] = useState<Bootstrap | null>(null);
  const [offline, setOffline] = useState(false);
  const version = useRef(0);
  const loading = useRef(false);

  const refresh = useCallback(async () => {
    if (loading.current) return;
    loading.current = true;
    try {
      const next = await api<Bootstrap>("GET", "/api/bootstrap");
      version.current = next.version;
      setData(next);
      setOffline(false);
    } catch {
      setOffline(true);
    } finally {
      loading.current = false;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    const tick = async () => {
      if (cancelled) return;
      if (document.visibilityState === "visible") {
        try {
          const { version: v } = await api<{ version: number }>("GET", "/api/version");
          setOffline(false);
          if (v !== version.current) await refresh();
        } catch {
          setOffline(true);
        }
      }
      if (!cancelled) timer = window.setTimeout(tick, POLL_MS);
    };
    // version.current starts at 0, so the first tick always loads the data
    timer = window.setTimeout(tick, 0);
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  return { data, offline, refresh };
}
