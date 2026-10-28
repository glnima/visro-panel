"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Undo2 } from "lucide-react";

type ToastAction = { label: string; run: () => void };
type ToastState = { id: number; text: string; tone: "ok" | "error"; action?: ToastAction };

type ToastApi = {
  ok: (text: string, action?: ToastAction) => void;
  error: (text: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast outside ToastProvider");
  return ctx;
}

// One toast at a time, fixed at the bottom of the screen so it's visible
// wherever the user is scrolled. Toasts with an undo action stay longer.
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const seq = useRef(0);

  const show = useCallback((t: Omit<ToastState, "id">) => {
    window.clearTimeout(timer.current);
    setToast({ ...t, id: ++seq.current });
    timer.current = window.setTimeout(() => setToast(null), t.action ? 8000 : t.tone === "error" ? 4500 : 3000);
  }, []);

  const apiValue = useMemo<ToastApi>(
    () => ({
      ok: (text, action) => show({ text, tone: "ok", action }),
      error: (text) => show({ text, tone: "error" }),
    }),
    [show]
  );

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <ToastContext.Provider value={apiValue}>
      {children}
      <div className="fixed inset-x-0 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-50 flex justify-center px-4 pointer-events-none" aria-live="polite">
        {toast && (
          <div
            key={toast.id}
            className={
              "pointer-events-auto max-w-xl w-full sm:w-auto flex items-center gap-3 rounded-xl px-4 py-3 text-sm text-white shadow-lg " +
              (toast.tone === "ok" ? "bg-[#16A34A]" : "bg-[#DC2626]")
            }
          >
            {toast.tone === "ok" ? <CheckCircle2 size={16} className="shrink-0" /> : <AlertTriangle size={16} className="shrink-0" />}
            <span className="flex-1">{toast.text}</span>
            {toast.action && (
              <button
                onClick={() => {
                  toast.action!.run();
                  setToast(null);
                }}
                className="shrink-0 flex items-center gap-1 rounded-md bg-white/20 px-2.5 py-1 font-semibold hover:bg-white/30"
              >
                <Undo2 size={14} />
                {toast.action.label}
              </button>
            )}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}
