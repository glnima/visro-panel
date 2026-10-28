"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { isIsoDate, todayISO } from "@/lib/dates";
import { faDateFull, faDigits, faNum } from "@/lib/format";
import { JALALI_MONTHS, daysInJalaliMonth, isoToJalali, jalaliToIso } from "@/lib/jalali";

type Props = {
  value: string;
  onChange: (iso: string) => void;
  className?: string;
  // When set, "" means "no date" and is shown as this label instead of as today.
  emptyLabel?: string;
  // Days before this ISO date can't be picked.
  min?: string;
};

// Persian week starts on Saturday.
const WEEKDAYS = ["ش", "ی", "د", "س", "چ", "پ", "ج"];

function weekdayIndex(iso: string): number {
  return (new Date(iso + "T00:00:00Z").getUTCDay() + 1) % 7; // 0 = Saturday
}

export default function JalaliDateInput({ value, onChange, className, emptyLabel, min }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const today = todayISO();
  const hasValue = isIsoDate(value);
  const [viewYear, setViewYear] = useState(0);
  const [viewMonth, setViewMonth] = useState(0);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = () => {
    if (!open) {
      const [jy, jm] = isoToJalali(hasValue ? value : today);
      setViewYear(jy);
      setViewMonth(jm);
    }
    setOpen(!open);
  };

  const shiftMonth = (delta: number) => {
    const m = viewMonth + delta;
    setViewYear(viewYear + Math.floor((m - 1) / 12));
    setViewMonth(((m - 1 + 12) % 12) + 1);
  };

  const pick = (iso: string) => {
    onChange(iso);
    setOpen(false);
  };

  const firstIso = viewMonth ? jalaliToIso(viewYear, viewMonth, 1) : today;
  const lead = weekdayIndex(firstIso);
  const days = viewMonth ? daysInJalaliMonth(viewYear, viewMonth) : 0;

  return (
    <div ref={ref} className={"relative " + (className || "")}>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={toggle}
          aria-haspopup="dialog"
          aria-expanded={open}
          className="flex w-full min-w-40 items-center justify-between gap-2 rounded-lg border border-[#D9CDB6] bg-[#FBF8F1] px-3 py-2 text-sm text-[#2B2420] outline-none focus:border-[#9C7A3C]"
        >
          <span className={hasValue ? "" : "text-[#8A7B60]"}>{hasValue ? faDateFull(value) : emptyLabel ?? "انتخاب تاریخ"}</span>
          <CalendarDays size={16} className="text-[#8A7B60] shrink-0" />
        </button>
        {emptyLabel !== undefined && hasValue && (
          <button type="button" onClick={() => onChange("")} aria-label="پاک کردن تاریخ" className="text-[#8A7B60] hover:text-[#8A3C2F]">
            <X size={16} />
          </button>
        )}
      </div>

      {open && (
        <div
          role="dialog"
          aria-label="انتخاب تاریخ"
          className="absolute right-0 top-full z-30 mt-1 w-72 rounded-xl border border-[#D9CDB6] bg-[#FBF8F1] p-3 shadow-lg"
        >
          <div className="mb-2 flex items-center justify-between">
            <button type="button" onClick={() => shiftMonth(-1)} aria-label="ماه قبل" className="rounded-md p-1.5 text-[#6B5E4F] hover:bg-[#EDE6D6]">
              <ChevronRight size={18} />
            </button>
            <div className="text-sm font-bold text-[#2B2420]">
              {JALALI_MONTHS[viewMonth - 1]} {faDigits(viewYear)}
            </div>
            <button type="button" onClick={() => shiftMonth(1)} aria-label="ماه بعد" className="rounded-md p-1.5 text-[#6B5E4F] hover:bg-[#EDE6D6]">
              <ChevronLeft size={18} />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center">
            {WEEKDAYS.map((w, i) => (
              <div key={w} className={"py-1 text-[11px] font-medium " + (i === 6 ? "text-[#DC2626]" : "text-[#8A7B60]")}>
                {w}
              </div>
            ))}
            {Array.from({ length: lead }, (_, i) => (
              <div key={`pad${i}`} />
            ))}
            {Array.from({ length: days }, (_, i) => {
              const d = i + 1;
              const iso = jalaliToIso(viewYear, viewMonth, d);
              const selected = hasValue && iso === value;
              const isToday = iso === today;
              const disabled = !!min && iso < min;
              const friday = (lead + i) % 7 === 6;
              return (
                <button
                  key={d}
                  type="button"
                  disabled={disabled}
                  onClick={() => pick(iso)}
                  className={
                    "h-9 rounded-lg text-sm transition-colors disabled:opacity-30 disabled:cursor-not-allowed " +
                    (selected
                      ? "bg-[#3B241A] text-[#F3EEE1] font-semibold"
                      : isToday
                        ? "border border-[#9C7A3C] text-[#2B2420] hover:bg-[#EDE6D6]"
                        : (friday ? "text-[#DC2626] " : "text-[#2B2420] ") + "hover:bg-[#EDE6D6]")
                  }
                >
                  {faNum(d)}
                </button>
              );
            })}
          </div>

          <div className="mt-2 flex items-center justify-between border-t border-[#E4DCC8] pt-2">
            <button
              type="button"
              disabled={!!min && today < min}
              onClick={() => pick(today)}
              className="rounded-md px-2 py-1 text-xs font-medium text-[#7A5E28] hover:bg-[#EDE6D6] disabled:opacity-40"
            >
              امروز
            </button>
            {emptyLabel !== undefined && (
              <button
                type="button"
                onClick={() => pick("")}
                className="rounded-md px-2 py-1 text-xs text-[#8A7B60] hover:bg-[#EDE6D6]"
              >
                {emptyLabel}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
