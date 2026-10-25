"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

export const inputCls =
  "rounded-lg border border-[#D9CDB6] bg-[#FBF8F1] px-3 py-2 text-sm text-[#2B2420] outline-none focus:border-[#9C7A3C] disabled:opacity-60";

export const labelCls = "flex flex-col gap-1 text-xs text-[#6B5E4F]";

export const cardCls = "rounded-xl border border-[#D9CDB6] bg-[#F7F2E7]";

export const primaryBtn =
  "flex items-center justify-center gap-1.5 rounded-lg bg-[#3B241A] text-[#F3EEE1] text-sm font-medium py-2.5 px-5 hover:bg-[#4A2E22] transition-colors disabled:opacity-60";

export const secondaryBtn =
  "flex items-center justify-center gap-1.5 rounded-lg border border-[#D9CDB6] bg-[#FBF8F1] text-[#3B241A] text-sm py-2 px-4 hover:border-[#9C7A3C] transition-colors disabled:opacity-60";

export const linkBtn = "text-xs text-[#7A5E28] hover:text-[#5C4620] flex items-center gap-1";

export function PageTitle({ title, subtitle, icon }: { title: string; subtitle?: string; icon?: ReactNode }) {
  return (
    <div className="mb-4">
      <h1 className="text-lg font-bold flex items-center gap-2">
        {icon}
        {title}
      </h1>
      {subtitle && <p className="text-sm text-[#6B5E4F] mt-1">{subtitle}</p>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="px-4 py-8 text-center text-xs text-[#8A7B60]">{children}</div>;
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/40 sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={
          "w-full max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-[#F7F2E7] shadow-xl " +
          (wide ? "sm:max-w-3xl" : "sm:max-w-lg")
        }
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-[#E4DCC8] bg-[#F7F2E7] px-5 py-3">
          <h2 className="text-sm font-bold">{title}</h2>
          <button onClick={onClose} aria-label="بستن" className="text-[#8A7B60] hover:text-[#3B241A]">
            <X size={18} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
