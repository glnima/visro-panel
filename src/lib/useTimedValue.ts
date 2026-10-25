"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// A value that resets to `empty` after `ms`. Setting it again restarts the timer.
export function useTimedValue<T>(empty: T, ms: number) {
  const [value, setValue] = useState<T>(empty);
  const timer = useRef<number | undefined>(undefined);

  const set = useCallback(
    (next: T) => {
      setValue(next);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setValue(empty), ms);
    },
    [empty, ms]
  );

  const clear = useCallback(() => {
    window.clearTimeout(timer.current);
    setValue(empty);
  }, [empty]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return [value, set, clear] as const;
}
