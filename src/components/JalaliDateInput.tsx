"use client";

import { X } from "lucide-react";
import { isIsoDate, todayISO } from "@/lib/dates";
import { faDigits, faNum } from "@/lib/format";
import { JALALI_MONTHS, daysInJalaliMonth, isoToJalali, jalaliToIso } from "@/lib/jalali";

type Props = {
  value: string;
  onChange: (iso: string) => void;
  className?: string;
  // When set, "" means "no date" and is shown as such instead of as today.
  emptyLabel?: string;
};

export default function JalaliDateInput({ value, onChange, className, emptyLabel }: Props) {
  const selectCls =
    "rounded-lg border border-[#D9CDB6] bg-[#FBF8F1] px-2 py-2 text-sm text-[#2B2420] outline-none focus:border-[#9C7A3C]";

  if (emptyLabel !== undefined && !value) {
    return (
      <button
        type="button"
        onClick={() => onChange(todayISO())}
        className={selectCls + " text-[#8A7B60] min-w-40 text-right " + (className || "")}
      >
        {emptyLabel}
      </button>
    );
  }

  const [jy, jm, jd] = isoToJalali(isIsoDate(value) ? value : todayISO());
  const maxDay = daysInJalaliMonth(jy, jm);

  const set = (ny: number, nm: number, nd: number) => {
    onChange(jalaliToIso(ny, nm, Math.min(Math.max(1, nd), daysInJalaliMonth(ny, nm))));
  };

  const years = [];
  for (let y = jy - 2; y <= jy + 3; y++) years.push(y);

  return (
    <div className={"flex gap-1.5 items-center " + (className || "")}>
      <select aria-label="روز" value={jd} onChange={(e) => set(jy, jm, Number(e.target.value))} className={selectCls + " w-16"}>
        {Array.from({ length: maxDay }, (_, i) => i + 1).map((d) => (
          <option key={d} value={d}>{faNum(d)}</option>
        ))}
      </select>
      <select aria-label="ماه" value={jm} onChange={(e) => set(jy, Number(e.target.value), jd)} className={selectCls + " flex-1"}>
        {JALALI_MONTHS.map((m, i) => (
          <option key={i} value={i + 1}>{m}</option>
        ))}
      </select>
      <select aria-label="سال" value={jy} onChange={(e) => set(Number(e.target.value), jm, jd)} className={selectCls + " w-20"}>
        {years.map((y) => (
          <option key={y} value={y}>{faDigits(y)}</option>
        ))}
      </select>
      {emptyLabel !== undefined && (
        <button type="button" onClick={() => onChange("")} aria-label="پاک کردن تاریخ" className="text-[#8A7B60] hover:text-[#8A3C2F]">
          <X size={16} />
        </button>
      )}
    </div>
  );
}
