"use client";

import { useSyncExternalStore, type ReactNode } from "react";

const subscribe = () => () => {};

// Renders `fallback` on the server and `children` only in the browser.
// The app reads today's date and localStorage while rendering, so it must not prerender.
export default function ClientOnly({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const isClient = useSyncExternalStore(subscribe, () => true, () => false);
  return isClient ? children : fallback;
}
