"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { storage } from "./storage";

const POLL_MS = 4000;

// Loads a JSON list from storage (seeding it if missing), polls for other
// people's changes, and writes the whole list back on every save.
// NOTE: whole-list writes mean last write wins. Replaced per-record in Phase 2.
export function useSharedList<T>(key: string, seed: () => T[], sanitize: (raw: unknown) => T[]) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncError, setSyncError] = useState(false);
  const itemsRef = useRef(items);

  const seedRef = useRef(seed);
  const sanitizeRef = useRef(sanitize);

  const apply = useCallback((next: T[]) => {
    itemsRef.current = next;
    setItems(next);
  }, []);

  // ---- load ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await storage.get(key);
        if (cancelled) return;
        if (res && res.value) {
          apply(sanitizeRef.current(JSON.parse(res.value)));
        } else {
          const initial = seedRef.current();
          await storage.set(key, JSON.stringify(initial));
          if (!cancelled) apply(initial);
        }
      } catch {
        const initial = seedRef.current();
        try {
          await storage.set(key, JSON.stringify(initial));
          if (!cancelled) apply(initial);
        } catch {
          if (!cancelled) {
            apply(initial);
            setSyncError(true);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key, apply]);

  // ---- poll for teammates' changes ----
  useEffect(() => {
    if (loading) return;
    const id = window.setInterval(async () => {
      try {
        const res = await storage.get(key);
        if (res && res.value) {
          const fresh = JSON.stringify(JSON.parse(res.value));
          if (fresh !== JSON.stringify(itemsRef.current)) {
            apply(sanitizeRef.current(JSON.parse(fresh)));
          }
        }
      } catch {
        // ignore transient poll errors
      }
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [key, loading, apply]);

  const save = useCallback(
    async (updater: T[] | ((prev: T[]) => T[])) => {
      const next = typeof updater === "function" ? updater(itemsRef.current) : updater;
      apply(next);
      try {
        await storage.set(key, JSON.stringify(next));
      } catch {
        setSyncError(true);
      }
    },
    [key, apply]
  );

  return { items, loading, syncError, save };
}
